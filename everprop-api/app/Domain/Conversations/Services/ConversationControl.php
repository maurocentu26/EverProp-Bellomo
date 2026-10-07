<?php

namespace App\Domain\Conversations\Services;

use App\Domain\Conversations\Exceptions\ConversationConflict;
use App\Domain\Conversations\Notifications\ConversationNeedsAttention;
use App\Models\User;
use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/**
 * Single writer of the conversation control state (ADR D11).
 *
 * Every transition locks the conversation row, which is also what the dispatcher locks before
 * starting a send. That shared row lock is the serialization point: a takeover either happens
 * before a bot send is claimed (the send is cancelled) or after it (TRANSITION_PENDING until the
 * provider call resolves). Never hold this lock during an LLM or HTTP call.
 */
final class ConversationControl
{
    public const BOT_STATES = ['AI_ACTIVE', 'WAITING_TOOL'];

    /** @return array{state: string, epoch: int, pending_send: bool} */
    public function takeover(int $tenantId, int $conversationId, User $user): array
    {
        return DB::transaction(function () use ($tenantId, $conversationId, $user): array {
            $conversation = $this->lock($tenantId, $conversationId);
            if ($conversation->control_state === 'CLOSED') {
                throw new ConversationConflict('CONVERSATION_CLOSED', 'La conversación está cerrada.');
            }
            if (in_array($conversation->control_state, ['HUMAN_ACTIVE', 'TRANSITION_PENDING'], true)
                && (int) $conversation->controlled_by_user_id !== (int) $user->id) {
                throw new ConversationConflict('ALREADY_CONTROLLED', 'Otro asesor ya tiene el control de la conversación.');
            }

            $epoch = (int) $conversation->control_epoch + 1;
            // Bot output of previous epochs that has not started sending is cancelled now.
            $this->cancelPendingBotSends($tenantId, $conversationId, $epoch);
            $inFlight = DB::table('outbound_jobs')->where('tenant_id', $tenantId)->where('conversation_id', $conversationId)
                ->whereNotNull('control_epoch')->whereIn('status', ['PROCESSING', 'UNKNOWN'])->exists();
            $state = $inFlight ? 'TRANSITION_PENDING' : 'HUMAN_ACTIVE';

            $this->write($tenantId, $conversationId, [
                'control_state' => $state,
                'control_epoch' => $epoch,
                'controlled_by_user_id' => $user->id,
                'assigned_user_id' => $user->id,
                'bot_mode' => 'HUMAN_ONLY',
            ]);
            DB::table('chatbot_sessions')->where('tenant_id', $tenantId)->where('conversation_id', $conversationId)
                ->where('status', 'ACTIVE')->update(['status' => 'HANDED_OFF', 'handoff_user_id' => $user->id, 'ended_at' => now()]);
            $this->outbox($tenantId, $conversationId, 'CONVERSATION_TAKEN_OVER', ['epoch' => $epoch, 'user_id' => $user->id, 'state' => $state]);

            return ['state' => $state, 'epoch' => $epoch, 'pending_send' => $inFlight];
        }, 3);
    }

    /**
     * Explicit, audited resume. Never happens by timeout.
     *
     * @return array{state: string, epoch: int}
     */
    public function resume(int $tenantId, int $conversationId, User $user, string $reason): array
    {
        return DB::transaction(function () use ($tenantId, $conversationId, $user, $reason): array {
            if (! InboundMessageService::aiEnabled()) {
                throw new ConversationConflict('AI_DISABLED', 'La IA todavía no está habilitada para responder.');
            }
            $conversation = $this->lock($tenantId, $conversationId);
            if (! in_array($conversation->control_state, ['HUMAN_ACTIVE', 'WAITING_HUMAN'], true)) {
                throw new ConversationConflict('INVALID_TRANSITION', 'Solo se puede reanudar la IA desde control humano.');
            }
            $epoch = (int) $conversation->control_epoch + 1;
            $this->write($tenantId, $conversationId, [
                'control_state' => 'AI_ACTIVE', 'control_epoch' => $epoch, 'controlled_by_user_id' => null, 'bot_mode' => 'BOT_FIRST',
            ]);
            $this->outbox($tenantId, $conversationId, 'CONVERSATION_AI_RESUMED', ['epoch' => $epoch, 'user_id' => $user->id, 'reason' => mb_substr($reason, 0, 500)]);

            return ['state' => 'AI_ACTIVE', 'epoch' => $epoch];
        }, 3);
    }

    /**
     * Bot asks for a human. The AI stops producing output for this conversation. An optional notice
     * ("te paso con un asesor") is queued under the NEW epoch and flagged as a handoff notice, so it
     * survives the cancellation of older bot drafts but dies if an advisor takes over first.
     * The assignee is only suggested (e.g. the lead owner) and never overrides an existing one.
     *
     * @return array{state: string, epoch: int, notice_job_id: ?int}
     */
    public function requestHuman(int $tenantId, int $conversationId, int $expectedEpoch, string $reason, ?string $notice = null, ?string $noticeKey = null, ?int $suggestedAssigneeId = null): array
    {
        return DB::transaction(function () use ($tenantId, $conversationId, $expectedEpoch, $reason, $notice, $noticeKey, $suggestedAssigneeId): array {
            $conversation = $this->lock($tenantId, $conversationId);
            $this->assertBotControl($conversation, $expectedEpoch);
            $epoch = (int) $conversation->control_epoch + 1;
            $this->cancelPendingBotSends($tenantId, $conversationId, $epoch);
            $changes = ['control_state' => 'WAITING_HUMAN', 'control_epoch' => $epoch, 'bot_mode' => 'HUMAN_FIRST'];
            // The suggestion comes from CRM data: only an active user of this tenant who can attend is assigned.
            if ($conversation->assigned_user_id === null && $suggestedAssigneeId !== null && DB::table('users')->where('tenant_id', $tenantId)
                ->where('id', $suggestedAssigneeId)->where('status', 'ACTIVE')->whereIn('role_code', ['TENANT_ADMIN', 'SALES_MANAGER', 'SALES_ADVISOR'])->exists()) {
                $changes['assigned_user_id'] = $suggestedAssigneeId;
            }
            $this->write($tenantId, $conversationId, $changes);
            $this->outbox($tenantId, $conversationId, 'CONVERSATION_HANDOFF_REQUESTED', ['epoch' => $epoch, 'reason' => mb_substr($reason, 0, 500)]);
            ConversationNeedsAttention::sendFor((object) [
                'tenant_id' => $tenantId, 'public_id' => $conversation->public_id, 'controlled_by_user_id' => null,
                'assigned_user_id' => $changes['assigned_user_id'] ?? $conversation->assigned_user_id,
            ]);
            // The assistant session ends with the handoff, atomically.
            DB::table('chatbot_sessions')->where('tenant_id', $tenantId)->where('conversation_id', $conversationId)->where('status', 'ACTIVE')
                ->update(['status' => 'HANDED_OFF', 'handoff_reason' => mb_substr($reason, 0, 500), 'ended_at' => now(), 'last_activity_at' => now()]);

            $noticeJobId = null;
            if ($notice !== null && $noticeKey !== null) {
                $fresh = $this->lock($tenantId, $conversationId);
                $noticeJobId = $this->queueOutbound($fresh, $notice, 'BOT', null, $epoch, 'handoff:'.$noticeKey, true)['job_id'];
            }

            return ['state' => 'WAITING_HUMAN', 'epoch' => $epoch, 'notice_job_id' => $noticeJobId];
        }, 3);
    }

    public function close(int $tenantId, int $conversationId, User $user): void
    {
        DB::transaction(function () use ($tenantId, $conversationId, $user): void {
            $conversation = $this->lock($tenantId, $conversationId);
            $epoch = (int) $conversation->control_epoch + 1;
            $this->cancelPendingBotSends($tenantId, $conversationId, $epoch);
            $this->write($tenantId, $conversationId, ['control_state' => 'CLOSED', 'control_epoch' => $epoch, 'status' => 'RESOLVED', 'closed_at' => now()]);
            $this->outbox($tenantId, $conversationId, 'CONVERSATION_CLOSED', ['epoch' => $epoch, 'user_id' => $user->id]);
        }, 3);
    }

    /**
     * Stores a bot reply as a QUEUED message + outbound job bound to the epoch the generation started
     * with. Rejects with STALE_CONTROL if control changed meanwhile: the draft is discarded, not sent.
     */
    /** @return array{message_id: int, job_id: int, sequence: int, replayed: bool} */
    public function proposeBotReply(int $tenantId, int $conversationId, int $expectedEpoch, string $text, string $idempotencyKey): array
    {
        return DB::transaction(function () use ($tenantId, $conversationId, $expectedEpoch, $text, $idempotencyKey): array {
            $conversation = $this->lock($tenantId, $conversationId);
            $this->assertBotControl($conversation, $expectedEpoch);

            return $this->queueOutbound($conversation, $text, 'BOT', null, $expectedEpoch, 'bot:'.$idempotencyKey);
        }, 3);
    }

    /**
     * Human reply: only the controlling advisor, and only under human control.
     *
     * @param  array<string, mixed>|null  $media  stored attachment (ConversationAttachments::store); $text is then its caption
     * @return array{message_id: int, job_id: int, sequence: int, replayed: bool}
     */
    public function humanReply(int $tenantId, int $conversationId, User $user, string $text, string $idempotencyKey, ?array $media = null): array
    {
        return DB::transaction(function () use ($tenantId, $conversationId, $user, $text, $idempotencyKey, $media): array {
            $conversation = $this->lock($tenantId, $conversationId);
            if ($conversation->control_state !== 'HUMAN_ACTIVE' || (int) $conversation->controlled_by_user_id !== (int) $user->id) {
                throw new ConversationConflict('NOT_IN_CONTROL', 'Tomá el control de la conversación antes de responder.');
            }
            $key = 'user:'.$user->id.':c'.$conversationId.':'.$idempotencyKey;
            // Same rule the dispatcher enforces, checked up front so the advisor keeps the draft and sees why.
            // A retry of an already queued reply is a replay, not a new send: it skips the check.
            $channel = (array) DB::table('channel_accounts')->where('tenant_id', $tenantId)->where('id', $conversation->channel_account_id)->first();
            $blocked = DB::table('outbound_jobs')->where('tenant_id', $tenantId)->where('idempotency_key', $key)->exists()
                ? null : app(ChannelPolicy::class)->check($tenantId, $conversationId, $channel);
            if ($blocked === 'OUTSIDE_SERVICE_WINDOW') {
                throw new ConversationConflict($blocked, 'Pasaron más de 24 horas desde el último mensaje del cliente por WhatsApp. Solo se puede escribir con una plantilla aprobada, o esperar a que el cliente vuelva a escribir.');
            }
            if ($blocked !== null) {
                throw new ConversationConflict($blocked, 'Este canal no está disponible para enviar mensajes.');
            }

            return $this->queueOutbound($conversation, $text, 'USER', $user->id, null, $key, media: $media);
        }, 3);
    }

    /**
     * Approved WhatsApp template from the advisor in control: the only send allowed outside the 24 h window.
     * Stored with its rendered text so the thread reads like any reply.
     *
     * @param  array{name: string, language: string, body: string}  $template
     * @param  list<string>  $params
     * @return array{message_id: int, job_id: int, sequence: int, replayed: bool}
     */
    public function humanTemplate(int $tenantId, int $conversationId, User $user, array $template, array $params, string $idempotencyKey): array
    {
        return DB::transaction(function () use ($tenantId, $conversationId, $user, $template, $params, $idempotencyKey): array {
            $conversation = $this->lock($tenantId, $conversationId);
            if ($conversation->control_state !== 'HUMAN_ACTIVE' || (int) $conversation->controlled_by_user_id !== (int) $user->id) {
                throw new ConversationConflict('NOT_IN_CONTROL', 'Tomá el control de la conversación antes de responder.');
            }
            $key = 'user:'.$user->id.':c'.$conversationId.':'.$idempotencyKey;
            $channel = (array) DB::table('channel_accounts')->where('tenant_id', $tenantId)->where('id', $conversation->channel_account_id)->first();
            $blocked = DB::table('outbound_jobs')->where('tenant_id', $tenantId)->where('idempotency_key', $key)->exists()
                ? null : app(ChannelPolicy::class)->check($tenantId, $conversationId, $channel, $template['name']);
            if ($blocked !== null) {
                throw new ConversationConflict($blocked, $blocked === 'TEMPLATE_NOT_APPROVED'
                    ? 'Esa plantilla no está aprobada para este número. Actualizá la lista de plantillas.' : 'Este canal no está disponible para enviar mensajes.');
            }

            return $this->queueOutbound($conversation, WhatsAppTemplates::render($template['body'], $params), 'USER', $user->id, null, $key,
                template: ['name' => $template['name'], 'language' => $template['language'], 'params' => $params]);
        }, 3);
    }

    /**
     * Internal note (S04). Stored as an INTERNAL message in the thread's sequence: the widget, the
     * assistant's history and the transports only read INBOUND/OUTBOUND, so it never leaves the team.
     * Idempotent per author and key through the existing unique provider_message_id.
     *
     * @return array{sequence: int, replayed: bool}
     */
    public function addNote(int $tenantId, int $conversationId, User $user, string $text, string $idempotencyKey): array
    {
        return DB::transaction(function () use ($tenantId, $conversationId, $user, $text, $idempotencyKey): array {
            $conversation = $this->lock($tenantId, $conversationId);
            $key = 'note:c'.$conversationId.':u'.$user->id.':'.$idempotencyKey;
            $existing = DB::table('messages')->where('tenant_id', $tenantId)->where('conversation_id', $conversationId)
                ->where('provider_message_id', $key)->first(['sequence', 'text_body']);
            if ($existing !== null) {
                if ($existing->text_body !== $text) {
                    throw new ConversationConflict('IDEMPOTENCY_CONFLICT', 'La clave ya se usó con otro contenido.');
                }

                return ['sequence' => (int) $existing->sequence, 'replayed' => true];
            }
            $sequence = (int) $conversation->next_sequence;
            DB::table('messages')->insert([
                'tenant_id' => $tenantId, 'conversation_id' => $conversationId, 'channel_account_id' => $conversation->channel_account_id,
                'sequence' => $sequence, 'provider_message_id' => $key, 'direction' => 'INTERNAL', 'sender_type' => 'USER',
                'message_type' => 'TEXT', 'text_body' => $text, 'metadata_json' => json_encode(['author_user_id' => $user->id], JSON_THROW_ON_ERROR),
                'occurred_at' => CarbonImmutable::now('UTC')->format('Y-m-d H:i:s.v'),
            ]);
            // A note is not customer activity: it does not reorder the inbox or touch unread counts.
            DB::table('conversations')->where('tenant_id', $tenantId)->where('id', $conversationId)->update(['next_sequence' => $sequence + 1]);

            return ['sequence' => $sequence, 'replayed' => false];
        }, 3);
    }

    /** Called by the dispatcher once an in-flight send resolved; completes a pending takeover. */
    public function settleTransition(int $tenantId, int $conversationId): void
    {
        $conversation = $this->lock($tenantId, $conversationId);
        if ($conversation->control_state !== 'TRANSITION_PENDING') {
            return;
        }
        $stillInFlight = DB::table('outbound_jobs')->where('tenant_id', $tenantId)->where('conversation_id', $conversationId)
            ->whereNotNull('control_epoch')->whereIn('status', ['PROCESSING', 'UNKNOWN'])->exists();
        if (! $stillInFlight) {
            $this->write($tenantId, $conversationId, ['control_state' => 'HUMAN_ACTIVE']);
        }
    }

    public function lock(int $tenantId, int $conversationId): object
    {
        return DB::table('conversations')->where('tenant_id', $tenantId)->where('id', $conversationId)
            ->lockForUpdate()->first() ?? throw new ConversationConflict('NOT_FOUND', 'Conversación inexistente.', 404);
    }

    private function assertBotControl(object $conversation, int $expectedEpoch): void
    {
        if ((int) $conversation->control_epoch !== $expectedEpoch || ! in_array($conversation->control_state, self::BOT_STATES, true)) {
            throw new ConversationConflict('STALE_CONTROL', 'La conversación cambió de responsable.');
        }
    }

    /**
     * @param  array<string, mixed>|null  $media
     * @param  array{name: string, language: string, params: list<string>}|null  $template
     * @return array{message_id: int, job_id: int, sequence: int, replayed: bool}
     */
    private function queueOutbound(object $conversation, string $text, string $sender, ?int $userId, ?int $epoch, string $key, bool $handoffNotice = false, ?array $media = null, ?array $template = null): array
    {
        $tenantId = (int) $conversation->tenant_id;
        // The idempotency hash covers the attachment too: same key with another file is a conflict.
        $contentHash = hash('sha256', $text.($media === null ? '' : "\0".$media['sha256']));
        $existing = DB::table('outbound_jobs')->where('tenant_id', $tenantId)->where('idempotency_key', $key)->first(['id', 'message_id', 'payload_json']);
        if ($existing !== null) {
            $payload = json_decode((string) $existing->payload_json, true, 512, JSON_THROW_ON_ERROR);
            if (($payload['text_sha256'] ?? null) !== $contentHash) {
                throw new ConversationConflict('IDEMPOTENCY_CONFLICT', 'La clave ya se usó con otro contenido.');
            }

            return ['message_id' => (int) $existing->message_id, 'job_id' => (int) $existing->id,
                'sequence' => (int) DB::table('messages')->where('tenant_id', $tenantId)->where('id', $existing->message_id)->value('sequence'), 'replayed' => true];
        }

        $now = CarbonImmutable::now('UTC')->format('Y-m-d H:i:s.v');
        $sequence = (int) $conversation->next_sequence;
        $messageId = (int) DB::table('messages')->insertGetId([
            'tenant_id' => $tenantId, 'conversation_id' => $conversation->id, 'channel_account_id' => $conversation->channel_account_id,
            'sequence' => $sequence, 'control_epoch' => $epoch, 'direction' => 'OUTBOUND', 'sender_type' => $sender,
            'message_type' => $template !== null ? 'TEMPLATE' : ($media['kind'] ?? 'TEXT'), 'text_body' => $media !== null && $text === '' ? null : $text,
            'media_json' => $media === null ? null : json_encode($media, JSON_THROW_ON_ERROR), 'delivery_status' => 'QUEUED', 'occurred_at' => $now,
        ]);
        $jobId = (int) DB::table('outbound_jobs')->insertGetId([
            'tenant_id' => $tenantId, 'channel_account_id' => $conversation->channel_account_id, 'conversation_id' => $conversation->id,
            'message_id' => $messageId, 'control_epoch' => $epoch, 'requested_by_user_id' => $userId, 'idempotency_key' => $key,
            'job_type' => 'SEND_MESSAGE', 'payload_json' => json_encode(['text_sha256' => $contentHash] + ($template !== null ? ['template' => $template] : []) + ($handoffNotice ? ['handoff_notice' => true] : []), JSON_THROW_ON_ERROR),
            'status' => 'PENDING', 'scheduled_at' => $now,
        ]);
        DB::table('conversations')->where('tenant_id', $tenantId)->where('id', $conversation->id)->update([
            'next_sequence' => $sequence + 1, 'last_outbound_at' => $now, 'last_activity_at' => $now, 'state_version' => DB::raw('state_version + 1'),
        ]);

        return ['message_id' => $messageId, 'job_id' => $jobId, 'sequence' => $sequence, 'replayed' => false];
    }

    private function cancelPendingBotSends(int $tenantId, int $conversationId, int $newEpoch): void
    {
        $jobs = DB::table('outbound_jobs')->where('tenant_id', $tenantId)->where('conversation_id', $conversationId)
            ->whereNotNull('control_epoch')->where('control_epoch', '<', $newEpoch)->whereIn('status', ['PENDING', 'RETRY']);
        $messageIds = (clone $jobs)->pluck('message_id')->filter()->all();
        $jobs->update(['status' => 'CANCELLED', 'last_error_code' => 'STALE_CONTROL']); // $jobs is tenant-scoped above
        if ($messageIds !== []) {
            DB::table('messages')->where('tenant_id', $tenantId)->whereIn('id', $messageIds)->update(['delivery_status' => 'CANCELLED']);
        }
    }

    /** @param array<string, mixed> $changes */
    private function write(int $tenantId, int $conversationId, array $changes): void
    {
        DB::table('conversations')->where('tenant_id', $tenantId)->where('id', $conversationId)
            ->update($changes + ['state_version' => DB::raw('state_version + 1'), 'last_activity_at' => now()]);
    }

    /** @param array<string, mixed> $payload */
    private function outbox(int $tenantId, int $conversationId, string $type, array $payload): void
    {
        DB::table('domain_outbox')->insert([
            'tenant_id' => $tenantId, 'aggregate_type' => 'CONVERSATION', 'aggregate_id' => $conversationId, 'event_type' => $type,
            'idempotency_key' => strtolower($type).':'.$conversationId.':'.Str::uuid(),
            'payload_json' => json_encode(['schema_version' => 1, 'conversation_id' => $conversationId] + $payload, JSON_THROW_ON_ERROR),
            'status' => 'PENDING', 'available_at' => now(),
        ]);
    }
}
