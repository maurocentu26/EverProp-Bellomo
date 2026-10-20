<?php

namespace App\Domain\CRM\Notifications;

use Illuminate\Bus\Queueable;
use Illuminate\Notifications\Notification;

/**
 * EVP-50: follow-up alerts and re-engagement nudges. The bell shows title/message (may name the client);
 * the push payload uses push_body, which never carries client data because it reaches the lock screen.
 */
final class FollowUpNotification extends Notification
{
    use Queueable;

    public function __construct(
        public readonly string $eventType,
        public readonly string $title,
        public readonly string $message,
        public readonly string $pushBody,
        public readonly string $actionUrl,
        public readonly ?string $leadPublicId = null,
    ) {}

    /** @return array<int, string> */
    public function via(object $notifiable): array
    {
        return ['database'];
    }

    /** @return array<string, mixed> */
    public function toArray(object $notifiable): array
    {
        return array_filter([
            'event_type' => $this->eventType,
            'lead_id' => $this->leadPublicId,
            'title' => $this->title,
            'message' => $this->message,
            'push_body' => $this->pushBody,
            'action_url' => $this->actionUrl,
        ], fn ($value) => $value !== null);
    }
}
