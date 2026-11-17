<?php

namespace App\Domain\Integrations\Notifications;

use App\Domain\Identity\Enums\Capability;
use App\Domain\Identity\Enums\RoleCode;
use App\Models\User;
use Illuminate\Bus\Queueable;
use Illuminate\Notifications\Notification;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Notification as Notifier;

/**
 * EVP-128: a channel's access token is about to expire (or expired) and was not renewed. Whoever can manage
 * integrations has to reconnect it. Never carries the token.
 */
final class IntegrationTokenExpiring extends Notification
{
    use Queueable;

    /** @param 'instagram'|'whatsapp' $channel */
    public function __construct(
        public readonly string $integrationPublicId,
        public readonly string $channel,
        public readonly int $daysLeft,
        public readonly bool $renewalFailed,
    ) {}

    /** Active users of the tenant holding manageIntegrations, after commit; a failed alert is reported, never thrown. */
    public static function sendFor(int $tenantId, self $notification): void
    {
        DB::afterCommit(function () use ($tenantId, $notification): void {
            try {
                $roles = array_values(array_map(fn (RoleCode $r) => $r->value, array_filter(RoleCode::cases(), fn (RoleCode $r) => $r->allows(Capability::MANAGE_INTEGRATIONS))));
                Notifier::send(User::query()->where('tenant_id', $tenantId)->where('status', 'ACTIVE')->whereIn('role_code', $roles)->get(), $notification);
            } catch (\Throwable $error) {
                report($error);
            }
        });
    }

    /** @return array<int, string> */
    public function via(object $notifiable): array
    {
        return ['database'];
    }

    /** @return array<string, mixed> */
    public function toArray(object $notifiable): array
    {
        $name = $this->channel === 'instagram' ? 'Instagram' : 'WhatsApp';
        $when = match (true) {
            $this->daysLeft < 0 => 'venció',
            $this->daysLeft === 0 => 'vence hoy',
            $this->daysLeft === 1 => 'vence mañana',
            default => "vence en {$this->daysLeft} días",
        };
        $why = $this->renewalFailed ? 'No pudimos renovarlo automáticamente. ' : '';

        return [
            'integration_id' => $this->integrationPublicId,
            'event_type' => 'INTEGRATION_TOKEN_EXPIRING',
            'title' => "El acceso de {$name} {$when}",
            'message' => "{$why}Volvé a conectar {$name} en Configuración para seguir respondiendo mensajes por ese canal.",
            'action_url' => '/admin/settings#'.$this->channel,
        ];
    }
}
