<?php

namespace App\Domain\CRM\Notifications;

use Illuminate\Bus\Queueable;
use Illuminate\Notifications\Notification;

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
