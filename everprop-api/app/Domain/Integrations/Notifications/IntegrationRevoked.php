<?php

namespace App\Domain\Integrations\Notifications;

use App\Domain\Identity\Enums\Capability;
use App\Domain\Identity\Enums\RoleCode;
use App\Models\User;
use Illuminate\Bus\Queueable;
use Illuminate\Notifications\Notification;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Notification as Notifier;

/** Meta stopped accepting a tenant's token: whoever can manage integrations must reconnect (Plan W7). */
final class IntegrationRevoked extends Notification
{
    use Queueable;

    public function __construct(public readonly string $integrationPublicId) {}

    /** Active users of the tenant holding manageIntegrations, after commit; a failed alert never breaks sending. */
    public static function sendFor(int $tenantId, string $integrationPublicId): void
    {
        DB::afterCommit(function () use ($tenantId, $integrationPublicId): void {
            try {
                $roles = array_values(array_map(fn (RoleCode $r) => $r->value, array_filter(RoleCode::cases(), fn (RoleCode $r) => $r->allows(Capability::MANAGE_INTEGRATIONS))));
                $admins = User::query()->where('tenant_id', $tenantId)->where('status', 'ACTIVE')->whereIn('role_code', $roles)->get();
                Notifier::send($admins, new self($integrationPublicId));
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
        return [
            'integration_id' => $this->integrationPublicId,
            'event_type' => 'INTEGRATION_REVOKED',
            'title' => 'WhatsApp se desconectó',
            'message' => 'Meta dejó de aceptar el acceso de la inmobiliaria. Volvé a conectar WhatsApp en Configuración para seguir enviando mensajes.',
            'action_url' => '/admin/settings#whatsapp',
        ];
    }
}
