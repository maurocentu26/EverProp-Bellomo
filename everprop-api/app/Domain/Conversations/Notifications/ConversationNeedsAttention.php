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

    public function __construct(
        public readonly string $conversationPublicId,
        public readonly string $title = 'Un cliente espera respuesta',
        public readonly string $message = 'Hay una conversación que necesita a un asesor.',
    ) {}

    /**
     * Who to tell, mirroring inbox visibility (AdminConversationController::visible): the active owner
     * (in control, else assigned) if they can act; if it belongs to someone no longer active, the
     * managers/admins (advisors cannot see someone else's conversation); if unassigned, every active
     * advisor/manager/admin. Sent after commit: a failed alert never rolls back the client's message.
     *
     * @param  object{tenant_id: int|string, public_id: string, controlled_by_user_id: int|string|null, assigned_user_id: int|string|null, reason?: string|null}  $conversation
     */
    public static function sendFor(object $conversation): void
    {
        DB::afterCommit(function () use ($conversation): void {
            try {
                $roles = fn (array $codes) => array_map(fn (RoleCode $r) => $r->value, $codes);
                $users = fn () => User::query()->where('tenant_id', $conversation->tenant_id)->where('status', 'ACTIVE');
                $owner = $conversation->controlled_by_user_id ?? $conversation->assigned_user_id;
                $recipients = $owner !== null ? $users()->where('id', $owner)->whereIn('role_code', $roles(self::ACTORS))->get() : collect();
                $includeIdentity = $recipients->isNotEmpty();
                if ($recipients->isEmpty()) {
                    $recipients = $users()->whereIn('role_code', $roles($conversation->assigned_user_id !== null ? self::SUPERVISORS : self::ACTORS))->get();
                }
                [$title, $message] = self::describe($conversation, $includeIdentity);
                Notifier::send($recipients, new self((string) $conversation->public_id, $title, $message));
            } catch (\Throwable $error) {
                report($error);
            }
        });
    }

    /**
     * @return array{0: string, 1: string}
     */
    private static function describe(object $conversation, bool $includeIdentity): array
    {
        $row = DB::table('conversations as c')
            ->leftJoin('contacts as ct', fn ($j) => $j->on('ct.id', '=', 'c.contact_id')->on('ct.tenant_id', '=', 'c.tenant_id'))
            ->leftJoin('channel_accounts as ca', fn ($j) => $j->on('ca.id', '=', 'c.channel_account_id')->on('ca.tenant_id', '=', 'c.tenant_id'))
            ->where('c.tenant_id', $conversation->tenant_id)
            ->where('c.public_id', $conversation->public_id)
            ->first(['ct.display_name', 'ct.phone_e164', 'ct.email', 'ct.profile_json', 'ca.channel_type']);

        if ($row === null) {
            return ['Un cliente espera respuesta', 'Hay una conversación que necesita a un asesor.'];
        }

        $contactLabel = '';
        if ($includeIdentity) {
            $profile = is_string($row->profile_json ?? null) ? (json_decode($row->profile_json, true) ?: []) : [];
            $declaredPhone = is_string($profile['declared_phone'] ?? null) ? trim($profile['declared_phone']) : '';
            $rawName = trim((string) ($row->display_name ?? ''));
            $isPlaceholder = in_array($rawName, ['', 'Visitante Web', 'Visitante del chat web', 'Contacto sin nombre'], true);
            $contactLabel = ! $isPlaceholder
                ? $rawName
                : (trim((string) ($row->phone_e164 ?? '')) ?: ($declaredPhone ?: trim((string) ($row->email ?? ''))));
        }

        $channelLabel = match ($row->channel_type ?? null) {
            'WHATSAPP' => 'WhatsApp',
            'WEB_CHAT' => 'Chat web',
            'INSTAGRAM', 'INSTAGRAM_DM' => 'Instagram',
            'FACEBOOK_MESSENGER' => 'Messenger',
            default => 'Chat',
        };

        $title = $contactLabel !== ''
            ? "Derivación de {$contactLabel} ({$channelLabel})"
            : "Cliente derivado en {$channelLabel}";

        $rawReason = trim((string) ($conversation->reason ?? ''));
        $reasonCode = '';
        if ($rawReason !== '' && preg_match('/^([A-Z_]+):/u', $rawReason, $matches) === 1) {
            $reasonCode = $matches[1];
        }

        $message = match ($reasonCode) {
            'ADVISOR_REQUESTED', 'USER_REQUEST' => $contactLabel !== ''
                ? "{$contactLabel} pidió hablar con un asesor en {$channelLabel}."
                : "El cliente pidió hablar con un asesor en {$channelLabel}.",
            'NO_EVIDENCE' => "La consulta en {$channelLabel} requiere datos comerciales que un asesor debe confirmar.",
            'COMMERCIAL_EXCEPTION' => "El cliente solicitó condiciones comerciales especiales en {$channelLabel}.",
            'DELIVERY_FAILED' => "La última respuesta automática en {$channelLabel} no le llegó al cliente: necesita a un asesor.",
            'DELIVERY_UNKNOWN' => "No pudimos confirmar si la última respuesta automática en {$channelLabel} llegó al cliente: revisala antes de responder.",
            'TOOL_FAILURE', 'LLM_UNAVAILABLE', 'OUTPUT_GUARD_BLOCKED', 'BUDGET_EXCEEDED', 'RUN_TIMEOUT' => "El asistente derivó la conversación de {$channelLabel} para atención humana.",
            default => $contactLabel !== ''
                ? "{$contactLabel} espera respuesta de un asesor en {$channelLabel}."
                : "Hay una conversación en {$channelLabel} que necesita a un asesor.",
        };

        return [$title, $message];
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
            'title' => $this->title,
            'message' => $this->message,
            'action_url' => '/admin/conversaciones?c='.$this->conversationPublicId,
        ];
    }
}
