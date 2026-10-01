<?php

namespace App\Domain\Conversations\Services;

use App\Domain\Conversations\Exceptions\ConversationConflict;
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
            if ($conversation->assigned_user_id === null && $suggestedAssigneeId !== null) {
                $changes['assigned_user_id'] = $suggestedAssigneeId;
            }
            $this->write($tenantId, $conversationId, $changes);
            $this->outbox($tenantId, $conversationId, 'CONVERSATION_HANDOFF_REQUESTED', ['epoch' => $epoch, 'reason' => mb_substr($reason, 0, 500)]);
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
     * @return array{message_id: int, job_id: int, sequence: int, replayed: bool}
     */
    public function humanReply(int $tenantId, int $conversationId, User $user, string $text, string $idempotencyKey): array
    {
        return DB::transaction(function () use ($tenantId, $conversationId, $user, $text, $idempotencyKey): array {
            $conversation = $this->lock($tenantId, $conversationId);
            if ($conversation->control_state !== 'HUMAN_ACTIVE' || (int) $conversation->controlled_by_user_id !== (int) $user->id) {
                throw new ConversationConflict('NOT_IN_CONTROL', 'Tomá el control de la conversación antes de responder.');
            }

            return $this->queueOutbound($conversation, $text, 'USER', $user->id, null, 'user:'.$user->id.':c'.$conversationId.':'.$idempotencyKey);
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

    /** @return array{message_id: int, job_id: int, sequence: int, replayed: bool} */
    private function queueOutbound(object $conversation, string $text, string $sender, ?int $userId, ?int $epoch, string $key, bool $handoffNotice = false): array
    {
        $tenantId = (int) $conversation->tenant_id;
        $existing = DB::table('outbound_jobs')->where('tenant_id', $tenantId)->where('idempotency_key', $key)->first(['id', 'message_id', 'payload_json']);
        if ($existing !== null) {
            $payload = json_decode((string) $existing->payload_json, true, 512, JSON_THROW_ON_ERROR);
            if (($payload['text_sha256'] ?? null) !== hash('sha256', $text)) {
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
            'message_type' => 'TEXT', 'text_body' => $text, 'delivery_status' => 'QUEUED', 'occurred_at' => $now,
        ]);
        $jobId = (int) DB::table('outbound_jobs')->insertGetId([
            'tenant_id' => $tenantId, 'channel_account_id' => $conversation->channel_account_id, 'conversation_id' => $conversation->id,
            'message_id' => $messageId, 'control_epoch' => $epoch, 'requested_by_user_id' => $userId, 'idempotency_key' => $key,
            'job_type' => 'SEND_MESSAGE', 'payload_json' => json_encode(['text_sha256' => hash('sha256', $text)] + ($handoffNotice ? ['handoff_notice' => true] : []), JSON_THROW_ON_ERROR),
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
