<?php

namespace App\Domain\Conversations\Notifications;

use App\Domain\Conversations\Jobs\SendConversationAlert;
use App\Domain\Identity\Enums\RoleCode;
use App\Models\User;
use Illuminate\Bus\Queueable;
use Illuminate\Database\QueryException;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Notifications\Notification;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

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
        // EVP-144: a transient failure (deadlock, dropped connection) must not lose the alert. Three quick tries
        // inline, then a queued job with backoff; each alert has one id per recipient, so a retry never duplicates.
        // The queued payload keeps only ids and the reason CODE: the free-text reason can carry the client's data.
        $epoch = DB::table('conversations')->where('tenant_id', $conversation->tenant_id)->where('public_id', $conversation->public_id)->value('control_epoch');
        $code = preg_match('/^([A-Z_]+):/u', trim((string) ($conversation->reason ?? '')), $m) === 1 ? $m[1] : null;
        $alert = ['tenant_id' => (int) $conversation->tenant_id, 'public_id' => (string) $conversation->public_id,
            'controlled_by_user_id' => $conversation->controlled_by_user_id, 'assigned_user_id' => $conversation->assigned_user_id,
            'epoch' => $epoch === null ? null : (int) $epoch, 'reason' => $code === null ? null : $code.':', 'key' => (string) Str::uuid()];
        DB::afterCommit(function () use ($alert): void {
            try {
                retry([100, 400], fn () => self::deliver($alert));
            } catch (\Throwable $error) {
                report($error);
                try {
                    SendConversationAlert::dispatch($alert);
                } catch (\Throwable $queueError) {
                    report($queueError); // queue down too: only the log remains
                }
            }
        });
    }

    /**
     * Sends one alert to whoever should get it now. Idempotent per recipient: the notification id derives from
     * the alert key and the user, so a recipient reached by an earlier attempt hits the primary key and is skipped.
     * A queued retry can run minutes later, so the conversation is read again: if control moved (another epoch, D11)
     * the alert is stale and dropped; a reassignment (same epoch) sends it to the current assignee, never the old one.
     *
     * @param  array{tenant_id: int, public_id: string, controlled_by_user_id: int|string|null, assigned_user_id: int|string|null, epoch: int|null, reason: string|null, key: string}  $alert
     */
    public static function deliver(array $alert): void
    {
        $now = DB::table('conversations')->where('tenant_id', $alert['tenant_id'])->where('public_id', $alert['public_id'])
            ->first(['assigned_user_id', 'control_epoch']);
        if ($now === null || ($now->control_epoch === null ? null : (int) $now->control_epoch) !== $alert['epoch']) {
            return;
        }
        $conversation = (object) (['assigned_user_id' => $now->assigned_user_id] + $alert);
        $roles = fn (array $codes) => array_map(fn (RoleCode $r) => $r->value, $codes);
        $users = fn () => User::query()->where('tenant_id', $conversation->tenant_id)->where('status', 'ACTIVE');
        $owner = $conversation->controlled_by_user_id ?? $conversation->assigned_user_id;
        $recipients = $owner !== null ? $users()->where('id', $owner)->whereIn('role_code', $roles(self::ACTORS))->get() : collect();
        $includeIdentity = $recipients->isNotEmpty();
        if ($recipients->isEmpty()) {
            $recipients = $users()->whereIn('role_code', $roles($conversation->assigned_user_id !== null ? self::SUPERVISORS : self::ACTORS))->get();
        }
        [$title, $message] = self::describe($conversation, $includeIdentity);
        $failed = 0;
        $first = null;
        foreach ($recipients as $user) { // one failing recipient never stops the others
            $notification = new self($conversation->public_id, $title, $message);
            $hash = hash('sha256', $alert['key'].':'.$user->id);
            $notification->id = substr($hash, 0, 8).'-'.substr($hash, 8, 4).'-'.substr($hash, 12, 4).'-'.substr($hash, 16, 4).'-'.substr($hash, 20, 12);
            try {
                $user->notify($notification);
            } catch (UniqueConstraintViolationException) {
                // delivered by an earlier attempt
            } catch (\Throwable $error) {
                $failed++;
                $first ??= $error;
            }
        }
        if ($first !== null) {
            // Retry the rest. No previous/SQL in the message: its bindings hold the alert text (client name or phone),
            // and this exception ends up in logs and failed_jobs.
            $cause = $first instanceof QueryException ? 'SQLSTATE '.($first->errorInfo[0] ?? '?') : $first::class;
            throw new \RuntimeException("Alert for conversation {$alert['public_id']}: {$failed} recipient(s) not notified ({$cause}).");
        }
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
            // EVP-126: fixed text, nobody derived it and no client data even for the owner.
            'NEW_CONVERSATION' => "Entró un mensaje nuevo por {$channelLabel} y nadie lo respondió todavía.",
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

        return [$reasonCode === 'NEW_CONVERSATION' ? "Nueva conversación en {$channelLabel}" : $title, $message];
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
