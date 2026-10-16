<?php

namespace App\Domain\Conversations\Services;

use App\Domain\Conversations\Data\InboundMessage;
use App\Domain\Integrations\Services\IntegrationTokens;
use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;

/**
 * Applies one signed WhatsApp webhook change. Runs in the worker from a durable receipt (Plan W6):
 * every step is idempotent (inbound dedupe by provider message id, monotonic statuses), so a retry
 * of the same change never duplicates anything.
 */
final class MetaWebhookProcessor
{
    private const STATUS_RANK = ['QUEUED' => 1, 'UNKNOWN' => 1, 'SENT' => 2, 'DELIVERED' => 3, 'READ' => 4];

    /** Meta events that mean our access to the WABA is gone (account_update, Tech Provider W6). */
    private const ACCESS_LOST = ['ACCOUNT_DELETED', 'ACCOUNT_OFFBOARDED', 'PARTNER_REMOVED', 'PARTNER_APP_UNINSTALLED'];

    public function __construct(private readonly InboundMessageService $inbound, private readonly IntegrationTokens $tokens) {}

    /**
     * entry.id is the WABA. Access-loss events revoke every connection to that WABA (any tenant that
     * holds it; normally one) and alert its admins. ACCOUNT_RECONNECTED never revives anything: a new
     * Embedded Signup with a new token is required. Other events are informational and ignored.
     *
     * @param  array<string, mixed>  $value
     */
    public function accountUpdate(string $wabaId, array $value): void
    {
        $event = is_string($value['event'] ?? null) ? $value['event'] : '';
        $partnerApp = $value['waba_info']['partner_app_id'] ?? null;
        $otherPartner = is_scalar($partnerApp) && (string) $partnerApp !== '' && (string) $partnerApp !== (string) config('services.meta.app_id');
        if (! in_array($event, self::ACCESS_LOST, true) || ($event === 'PARTNER_APP_UNINSTALLED' && $otherPartner)) {
            Log::info('whatsapp.webhook.account_update_ignored', ['event' => mb_substr($event, 0, 64)]);

            return;
        }
        $integrations = DB::table('integration_connections')->where('provider', 'META')->where('settings_json->waba_id', $wabaId)->get(['id', 'tenant_id']);
        foreach ($integrations as $integration) {
            $this->tokens->revoke((int) $integration->tenant_id, (int) $integration->id, null, 'META_'.$event);
        }
    }

    /**
     * Channel for a phone_number_id (unique platform-wide, 2026-09-29.002), or null.
     *
     * @return object{id: int|string, tenant_id: int|string, integration_id: int|string, status: string, metadata_json: string|null, provider: string, integration_status: string}|null
     */
    public function channelFor(string $phoneNumberId): ?object
    {
        return $phoneNumberId === '' ? null : DB::table('channel_accounts as ca')
            ->join('integration_connections as ic', fn ($j) => $j->on('ic.id', '=', 'ca.integration_id')->on('ic.tenant_id', '=', 'ca.tenant_id'))
            ->where('ca.whatsapp_phone_number_id', $phoneNumberId)
            ->first(['ca.id', 'ca.tenant_id', 'ca.integration_id', 'ca.status', 'ca.metadata_json', 'ic.provider', 'ic.status as integration_status']);
    }

    /** @param array<string, mixed> $value */
    public function messages(array $value, ?string $wabaId, int $tenantId, int $integrationId): bool
    {
        $phoneNumberId = is_scalar($value['metadata']['phone_number_id'] ?? null) ? (string) $value['metadata']['phone_number_id'] : '';
        $channel = $this->channelFor($phoneNumberId);

        // The tenant comes only from this verified mapping; anything else fails closed.
        $expectedWaba = $channel === null ? null : (json_decode((string) $channel->metadata_json, true)['waba_id'] ?? null);
        if ($channel === null || (int) $channel->tenant_id !== $tenantId || (int) $channel->integration_id !== $integrationId
            || $channel->status !== 'ACTIVE' || $channel->provider !== 'META' || $channel->integration_status !== 'ACTIVE'
            || ($expectedWaba !== null && $expectedWaba !== $wabaId)) {
            Log::warning('whatsapp.webhook.unmapped_phone_number', ['mapped' => $channel !== null]);

            return false;
        }
        $names = collect($this->arrays($value['contacts'] ?? null))
            ->filter(fn ($c) => is_scalar($c['wa_id'] ?? null))
            ->mapWithKeys(fn ($c) => [(string) $c['wa_id'] => is_string($c['profile']['name'] ?? null) ? $c['profile']['name'] : null]);

        foreach ($this->arrays($value['messages'] ?? null) as $message) {
            $from = is_scalar($message['from'] ?? null) ? (string) $message['from'] : '';
            $id = is_scalar($message['id'] ?? null) ? (string) $message['id'] : '';
            if ($from === '' || $id === '' || preg_match('/\A[0-9]{6,20}\z/', $from) !== 1) {
                continue;
            }
            $type = is_string($message['type'] ?? null) ? $message['type'] : 'unknown';
            $body = $message['text']['body'] ?? null;
            $this->inbound->accept(new InboundMessage(
                tenantId: (int) $channel->tenant_id,
                channelAccountId: (int) $channel->id,
                identityChannelType: 'WHATSAPP',
                senderProviderId: $from,
                threadId: 'wa:'.$from,
                providerMessageId: mb_substr($id, 0, 191),
                type: $this->messageType($type),
                text: $type === 'text' && is_string($body) ? mb_substr($body, 0, 4096)
                    : (in_array($type, ['image', 'document'], true) && is_string($message[$type]['caption'] ?? null) ? mb_substr($message[$type]['caption'], 0, 4096) : null),
                media: in_array($type, ['image', 'document'], true) && is_scalar($message[$type]['id'] ?? null) ? array_filter([
                    'kind' => $type === 'image' ? 'IMAGE' : 'DOCUMENT', 'provider_media_id' => mb_substr((string) $message[$type]['id'], 0, 64),
                    'mime' => is_string($message[$type]['mime_type'] ?? null) ? mb_substr($message[$type]['mime_type'], 0, 100) : null,
                    'name' => is_string($message[$type]['filename'] ?? null) ? mb_substr($message[$type]['filename'], 0, 120) : null,
                ]) : null,
                occurredAt: $this->timestamp($message['timestamp'] ?? null),
                senderDisplayName: is_string($names[$from] ?? null) ? mb_substr($names[$from], 0, 200) : null,
                senderPhoneE164: '+'.$from,
                // Minimized: only the campaign identifiers needed for attribution.
                metadata: array_filter([
                    'native_type' => $type,
                    'context_id' => is_scalar($message['context']['id'] ?? null) ? (string) $message['context']['id'] : null,
                    'referral' => is_array($message['referral'] ?? null) ? array_filter(array_intersect_key($message['referral'], array_flip(['source_type', 'source_id', 'ctwa_clid'])), 'is_scalar') ?: null : null,
                ]),
            ));
        }

        foreach ($this->arrays($value['statuses'] ?? null) as $status) {
            $this->applyStatus((int) $channel->tenant_id, (int) $channel->id, $status);
        }

        return true;
    }

    /** @param array<string, mixed> $status */
    private function applyStatus(int $tenantId, int $channelId, array $status): void
    {
        $new = is_string($status['status'] ?? null) ? strtoupper($status['status']) : '';
        $providerId = is_scalar($status['id'] ?? null) ? (string) $status['id'] : '';
        if ($providerId === '' || ! in_array($new, ['SENT', 'DELIVERED', 'READ', 'FAILED'], true)) {
            return;
        }

        DB::transaction(function () use ($tenantId, $channelId, $providerId, $new, $status): void {
            $message = DB::table('messages')->where('tenant_id', $tenantId)->where('channel_account_id', $channelId)
                ->where('provider_message_id', $providerId)->where('direction', 'OUTBOUND')->lockForUpdate()->first(['id', 'delivery_status']);
            if ($message === null) {
                return;
            }
            $current = (string) $message->delivery_status;
            // Out-of-order callbacks never move a message backwards (READ never returns to SENT).
            $advance = $new === 'FAILED'
                ? in_array($current, ['QUEUED', 'SENT', 'UNKNOWN'], true)
                : self::STATUS_RANK[$new] > (self::STATUS_RANK[$current] ?? 99);
            if (! $advance) {
                return;
            }
            $at = $this->timestamp($status['timestamp'] ?? null)->format('Y-m-d H:i:s.v');
            DB::table('messages')->where('tenant_id', $tenantId)->where('id', $message->id)->update(array_filter([
                'delivery_status' => $new,
                'sent_at' => $new === 'SENT' ? $at : null,
                'delivered_at' => $new === 'DELIVERED' ? $at : null,
                'read_at' => $new === 'READ' ? $at : null,
                'failed_at' => $new === 'FAILED' ? $at : null,
                'provider_error_code' => $new === 'FAILED' ? mb_substr(is_scalar($status['errors'][0]['code'] ?? null) ? (string) $status['errors'][0]['code'] : 'FAILED', 0, 80) : null,
            ], fn ($v) => $v !== null));
        });
    }

    /** @return list<array<string, mixed>> */
    public function arrays(mixed $value): array
    {
        return is_array($value) ? array_values(array_filter($value, 'is_array')) : [];
    }

    private function messageType(string $native): string
    {
        return match ($native) {
            'text' => 'TEXT', 'image' => 'IMAGE', 'video' => 'VIDEO', 'audio' => 'AUDIO', 'document' => 'DOCUMENT',
            'location' => 'LOCATION', 'contacts' => 'CONTACT', 'sticker' => 'STICKER', 'reaction' => 'REACTION',
            'interactive', 'button' => 'INTERACTIVE', default => 'SYSTEM',
        };
    }

    private function timestamp(mixed $value): CarbonImmutable
    {
        return is_numeric($value) ? CarbonImmutable::createFromTimestampUTC((int) $value) : CarbonImmutable::now('UTC');
    }
}
