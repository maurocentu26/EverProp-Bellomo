<?php

namespace App\Domain\Conversations\Notifications;

use App\Domain\Identity\Enums\RoleCode;
use App\Models\User;
use Illuminate\Bus\Queueable;
use Illuminate\Notifications\Notification;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Notification as Notifier;

/**
 * "A person is needed in this conversation": database notification, so the existing
 * NotificationSent listener sends the web push. No client name or text: it can reach a lock screen.
 */
final class ConversationNeedsAttention extends Notification
{
    use Queueable;

    private const ACTORS = [RoleCode::TENANT_ADMIN, RoleCode::SALES_MANAGER, RoleCode::SALES_ADVISOR];

    private const SUPERVISORS = [RoleCode::TENANT_ADMIN, RoleCode::SALES_MANAGER];

    public function __construct(public readonly string $conversationPublicId) {}

    /**
     * Who to tell, mirroring inbox visibility (AdminConversationController::visible): the active owner
     * (in control, else assigned) if they can act; if it belongs to someone no longer active, the
     * managers/admins (advisors cannot see someone else's conversation); if unassigned, every active
     * advisor/manager/admin. Sent after commit: a failed alert never rolls back the client's message.
     *
     * @param  object{tenant_id: int|string, public_id: string, controlled_by_user_id: int|string|null, assigned_user_id: int|string|null}  $conversation
     */
    public static function sendFor(object $conversation): void
    {
        DB::afterCommit(function () use ($conversation): void {
            try {
                $roles = fn (array $codes) => array_map(fn (RoleCode $r) => $r->value, $codes);
                $users = fn () => User::query()->where('tenant_id', $conversation->tenant_id)->where('status', 'ACTIVE');
                $owner = $conversation->controlled_by_user_id ?? $conversation->assigned_user_id;
                $recipients = $owner !== null ? $users()->where('id', $owner)->whereIn('role_code', $roles(self::ACTORS))->get() : collect();
                if ($recipients->isEmpty()) {
                    $recipients = $users()->whereIn('role_code', $roles($conversation->assigned_user_id !== null ? self::SUPERVISORS : self::ACTORS))->get();
                }
                Notifier::send($recipients, new self((string) $conversation->public_id));
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
            'conversation_id' => $this->conversationPublicId,
            'event_type' => 'CONVERSATION_NEEDS_ATTENTION',
            'title' => 'Un cliente espera respuesta',
            'message' => 'Hay una conversación que necesita a un asesor.',
            'action_url' => '/admin/conversaciones?c='.$this->conversationPublicId,
        ];
    }
}
