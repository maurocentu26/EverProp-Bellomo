<?php

namespace App\Domain\CRM\Notifications;

use App\Domain\Identity\Enums\RoleCode;
use App\Models\User;
use Illuminate\Bus\Queueable;
use Illuminate\Notifications\Notification;
use Illuminate\Support\Facades\Notification as Notifier;

final class LeadAssignedNotification extends Notification
{
    use Queueable;

    public function __construct(
        public readonly string $leadPublicId,
        public readonly string $leadName,
        public readonly string $eventType,
        public readonly string $title,
        public readonly string $message,
        public readonly ?string $actionUrl = null,
    ) {}

    /** EVP-136: a new lead nobody follows (manual, web or chatbot) → every active admin and sales manager hears about it. */
    public static function sendUnassigned(int $tenantId, string $leadPublicId, string $leadName, string $origin, ?string $actionUrl = null): void
    {
        $managers = User::query()->where('tenant_id', $tenantId)->where('status', 'ACTIVE')->whereNull('deleted_at')
            ->whereIn('role_code', [RoleCode::TENANT_ADMIN->value, RoleCode::SALES_MANAGER->value])->get();
        Notifier::send($managers, new self($leadPublicId, $leadName, 'LEAD_CREATED_UNASSIGNED', 'Lead pendiente de asignación',
            "Ingresó un lead {$origin} sin asesor: '{$leadName}'. Asignalo desde su ficha.", $actionUrl));
    }

    /**
     * Get the notification's delivery channels.
     *
     * @return array<int, string>
     */
    public function via(object $notifiable): array
    {
        return ['database'];
    }

    /**
     * Get the array representation of the notification.
     *
     * @return array<string, mixed>
     */
    public function toArray(object $notifiable): array
    {
        return [
            'lead_id' => $this->leadPublicId,
            'lead_name' => $this->leadName,
            'event_type' => $this->eventType,
            'title' => $this->title,
            'message' => $this->message,
            'action_url' => $this->actionUrl ?: "/admin/leads/{$this->leadPublicId}",
        ];
    }
}
