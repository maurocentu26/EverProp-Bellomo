<?php

namespace App\Console\Commands;

use App\Domain\Integrations\Exceptions\OnboardingFailed;
use App\Domain\Integrations\Notifications\IntegrationTokenExpiring;
use App\Domain\Integrations\Services\InstagramOnboarding;
use Carbon\CarbonImmutable;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;

/**
 * EVP-128: Instagram Login tokens last 60 days and Meta only renews them on request. Daily, renew the ones that
 * expire within RENEW_DAYS; when renewal fails or fewer than ALERT_DAYS remain (any channel with an expiry, e.g. a
 * WhatsApp token stored with one), tell the integration admins once a day, until GRACE_DAYS after it expired.
 * Running twice the same day renews nothing twice (the new expiry is 60 days out) and alerts once (audit row).
 */
final class RefreshIntegrationTokens extends Command
{
    public const RENEW_DAYS = 15;

    public const ALERT_DAYS = 7;

    public const GRACE_DAYS = 7;

    protected $signature = 'everprop:integrations:refresh-tokens';

    protected $description = 'Renew Instagram tokens close to expiry and alert integration admins when a channel token is about to expire';

    public function handle(InstagramOnboarding $instagram): int
    {
        $now = CarbonImmutable::now('UTC');
        $rows = DB::table('integration_connections as ic')
            ->join('tenants as t', 't.id', '=', 'ic.tenant_id')
            ->join('channel_accounts as ca', fn ($j) => $j->on('ca.integration_id', '=', 'ic.id')->on('ca.tenant_id', '=', 'ic.tenant_id'))
            ->where('t.status', 'ACTIVE')->where('ic.status', 'ACTIVE')->where('ic.provider', 'META')
            ->whereIn('ca.channel_type', ['INSTAGRAM_DM', 'WHATSAPP'])
            ->whereBetween('ic.token_expires_at', [$now->subDays(self::GRACE_DAYS)->format('Y-m-d H:i:s.v'), $now->addDays(self::RENEW_DAYS)->format('Y-m-d H:i:s.v')])
            ->orderBy('ic.id')
            ->get(['ic.id', 'ic.tenant_id', 'ic.public_id', 'ic.token_expires_at', 'ic.settings_json', 'ca.channel_type', 'ca.provider_account_id'])
            ->unique('id');

        $renewed = $alerted = 0;
        foreach ($rows as $row) {
            $instagramLogin = $row->channel_type === 'INSTAGRAM_DM' && (json_decode((string) $row->settings_json, true)['instagram_login'] ?? false) === true;
            $expires = CarbonImmutable::parse($row->token_expires_at, 'UTC');
            $failed = false;
            if ($instagramLogin && $expires->isFuture()) {
                try {
                    $instagram->refreshScheduled((int) $row->tenant_id, (int) $row->id, (string) $row->provider_account_id);
                    $renewed++;

                    continue;
                } catch (\Throwable $error) {
                    $failed = true;
                    // Code only: OnboardingFailed messages are user-facing and never contain the token.
                    Log::warning('integrations.token_refresh_failed', ['integration' => $row->public_id,
                        'code' => $error instanceof OnboardingFailed ? $error->reason : class_basename($error)]);
                }
            }
            $daysLeft = (int) floor($now->diffInDays($expires, false));
            if (($failed || $daysLeft <= self::ALERT_DAYS) && $this->alertOncePerDay($row, $now, $daysLeft, $failed)) {
                $alerted++;
            }
        }
        $this->info("renewed={$renewed} alerted={$alerted}");

        return self::SUCCESS;
    }

    private function alertOncePerDay(object $row, CarbonImmutable $now, int $daysLeft, bool $failed): bool
    {
        return DB::transaction(function () use ($row, $now, $daysLeft, $failed): bool {
            DB::table('integration_connections')->where('tenant_id', $row->tenant_id)->where('id', $row->id)->lockForUpdate()->first(['id']);
            $sentToday = DB::table('audit_logs')->where('tenant_id', $row->tenant_id)->where('entity_type', 'INTEGRATION_CONNECTION')
                ->where('entity_id', $row->id)->where('occurred_at', '>=', $now->startOfDay()->format('Y-m-d H:i:s.v'))
                ->where('action_code', 'INTEGRATION_TOKEN_EXPIRY_ALERTED')->exists();
            if ($sentToday) {
                return false;
            }
            DB::table('audit_logs')->insert(['tenant_id' => $row->tenant_id, 'actor_type' => 'SYSTEM', 'action_code' => 'INTEGRATION_TOKEN_EXPIRY_ALERTED',
                'entity_type' => 'INTEGRATION_CONNECTION', 'entity_id' => $row->id, 'occurred_at' => $now->format('Y-m-d H:i:s.v'),
                'metadata_json' => json_encode(['days_left' => $daysLeft, 'renewal_failed' => $failed], JSON_THROW_ON_ERROR)]);
            IntegrationTokenExpiring::sendFor((int) $row->tenant_id, new IntegrationTokenExpiring(
                (string) $row->public_id, $row->channel_type === 'INSTAGRAM_DM' ? 'instagram' : 'whatsapp', $daysLeft, $failed));

            return true;
        });
    }
}
