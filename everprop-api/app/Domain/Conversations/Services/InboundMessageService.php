<?php

namespace App\Domain\Conversations\Services;

use App\Domain\AgentRuntime\Jobs\RunAgentJob;
use App\Domain\Conversations\Data\InboundMessage;
use App\Domain\Conversations\Exceptions\ConversationConflict;
use App\Domain\Conversations\Notifications\ConversationNeedsAttention;
use App\Domain\CRM\Services\ContactIdentityResolver;
use Carbon\CarbonImmutable;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/**
 * Persists a normalized inbound message exactly once per (tenant, channel, provider message id),
 * assigns the next per-conversation sequence and records a domain_outbox event in the same
 * transaction. The tenant always comes from the verified channel account, never from the payload.
 */
final class InboundMessageService
{
    public function __construct(private readonly ContactIdentityResolver $contacts) {}

    /** @return array{message_id: int, conversation_id: int, conversation_public_id: string, sequence: int, replayed: bool} */
    public function accept(InboundMessage $message): array
    {
        $existing = $this->existing($message);
        if ($existing !== null) {
            return $existing + ['replayed' => true];
        }

        // Idempotent and self-transactional: resolved before the main transaction.
        $contact = $this->contacts->resolve(
            $message->tenantId,
            ['display_name' => $message->senderDisplayName, 'phone_e164' => $message->senderPhoneE164],
            ['channel_type' => $message->identityChannelType, 'provider_user_id' => $message->senderProviderId, 'display_name' => $message->senderDisplayName],
            $message->occurredAt,
        );
        $identityId = (int) DB::table('contact_identities')
            ->where('tenant_id', $message->tenantId)
            ->where('channel_type', $message->identityChannelType)
            ->where('provider_scope_id', '')
            ->where('provider_user_id', trim($message->senderProviderId))
            ->value('id');

        try {
            $result = DB::transaction(fn (): array => $this->persist($message, $contact['id'], $identityId ?: null), 3);
        } catch (UniqueConstraintViolationException) {
            // A concurrent delivery of the same provider message won the unique key.
            return ($this->existing($message) ?? throw new \RuntimeException('Inbound message dedupe failed.')) + ['replayed' => true];
        }

        // G2: the assistant answers text turns of conversations under bot control (checked again in the job).
        if (self::aiEnabled() && $message->type === 'TEXT' && $message->text !== null && trim($message->text) !== '') {
            RunAgentJob::dispatch($message->tenantId, $result['conversation_id'], $result['sequence']);
        } elseif (! self::aiEnabled()) {
            // Assistant switched off (rollback) while this conversation was under bot control: nobody would
            // answer it and it would not show under "Esperan asesor". Hand it to a human. The message is already
            // stored: a failure here must not turn into a 500 (a retry would replay and skip this), the sweep recovers it.
            rescue(fn () => self::handOffOrphanedBotConversation($message->tenantId, $result['conversation_id']));
        }

        return $result;
    }

    /** @return array{message_id: int, conversation_id: int, conversation_public_id: string, sequence: int, replayed: bool} */
    private function persist(InboundMessage $message, int $contactId, ?int $identityId): array
    {
        $now = CarbonImmutable::now('UTC');
        $conversation = $this->lockOrCreateConversation($message, $contactId, $now);
        $sequence = (int) $conversation->next_sequence;

        $messageId = (int) DB::table('messages')->insertGetId([
            'tenant_id' => $message->tenantId,
            'conversation_id' => $conversation->id,
            'channel_account_id' => $message->channelAccountId,
            'sequence' => $sequence,
            'contact_identity_id' => $identityId,
            'provider_message_id' => $message->providerMessageId,
            'direction' => 'INBOUND',
            'sender_type' => 'CONTACT',
            'message_type' => $message->type,
            'text_body' => $message->text,
            'media_json' => $message->media === null ? null : json_encode($message->media, JSON_THROW_ON_ERROR | JSON_UNESCAPED_UNICODE),
            'metadata_json' => $message->metadata === [] ? null : json_encode($message->metadata, JSON_THROW_ON_ERROR | JSON_UNESCAPED_UNICODE),
            'delivery_status' => 'RECEIVED',
            'occurred_at' => $message->occurredAt->utc()->format('Y-m-d H:i:s.v'),
            // Receipt time in UTC, independent of the DB session time zone: ChannelPolicy caps occurred_at with it.
            'created_at' => CarbonImmutable::now('UTC')->format('Y-m-d H:i:s.v'),
        ]);

        $reopen = $conversation->control_state === 'CLOSED';
        // A new message reopens a closed conversation with a fresh epoch; AI stays off if a human owned it.
        $state = $reopen ? ($conversation->controlled_by_user_id || ! self::aiEnabled() ? 'WAITING_HUMAN' : 'AI_ACTIVE') : $conversation->control_state;
        DB::table('conversations')->where('tenant_id', $message->tenantId)->where('id', $conversation->id)->update([
            'next_sequence' => $sequence + 1,
            'unread_count' => DB::raw('unread_count + 1'),
            'first_inbound_at' => $conversation->first_inbound_at ?? $now->format('Y-m-d H:i:s.v'),
            'last_inbound_at' => $now->format('Y-m-d H:i:s.v'),
            'last_activity_at' => $now->format('Y-m-d H:i:s.v'),
            'control_state' => $state,
            'control_epoch' => $reopen ? DB::raw('control_epoch + 1') : $conversation->control_epoch,
            'state_version' => DB::raw('state_version + 1'),
            'status' => 'OPEN',
            'closed_at' => null,
        ]);

        // One alert per unattended episode: the first unread message in a conversation people handle.
        // unread_count only resets when the assignee reads, so follow-ups before that don't repeat it.
        if (in_array($state, ['WAITING_HUMAN', 'HUMAN_ACTIVE'], true) && ($reopen || (int) $conversation->unread_count === 0)) {
            ConversationNeedsAttention::sendFor($conversation);
        }

        DB::table('domain_outbox')->insert([
            'tenant_id' => $message->tenantId,
            'aggregate_type' => 'CONVERSATION',
            'aggregate_id' => $conversation->id,
            'event_type' => 'MESSAGE_INBOUND_RECEIVED',
            'idempotency_key' => 'message-inbound:'.$messageId,
            'payload_json' => json_encode([
                'schema_version' => 1,
                'conversation_id' => (int) $conversation->id,
                'message_id' => $messageId,
                'sequence' => $sequence,
                'channel_account_id' => $message->channelAccountId,
            ], JSON_THROW_ON_ERROR),
            'status' => 'PENDING',
            'available_at' => $now->format('Y-m-d H:i:s.v'),
        ]);

        return [
            'message_id' => $messageId,
            'conversation_id' => (int) $conversation->id,
            'conversation_public_id' => (string) $conversation->public_id,
            'sequence' => $sequence,
            'replayed' => false,
        ];
    }

    private function lockOrCreateConversation(InboundMessage $message, int $contactId, CarbonImmutable $now): object
    {
        $find = fn (bool $lock) => DB::table('conversations')
            ->where('tenant_id', $message->tenantId)
            ->where('channel_account_id', $message->channelAccountId)
            ->where('provider_thread_id', $message->threadId)
            ->when($lock, fn ($q) => $q->lockForUpdate())
            ->first();

        // Plain read first (no gap locks). Existing conversation: lock its row by primary key.
        $existing = $find(false);
        if ($existing !== null) {
            return DB::table('conversations')->where('tenant_id', $message->tenantId)->where('id', $existing->id)->lockForUpdate()->first();
        }

        // New conversation: serialize creators on the channel row, then use a locking (current) read.
        DB::table('channel_accounts')->where('tenant_id', $message->tenantId)->where('id', $message->channelAccountId)->lockForUpdate()->first();
        $conversation = $find(true);
        if ($conversation !== null) {
            return $conversation;
        }

        DB::table('conversations')->insert([
            'tenant_id' => $message->tenantId,
            'public_id' => (string) Str::uuid(),
            'contact_id' => $contactId,
            'channel_account_id' => $message->channelAccountId,
            'provider_thread_id' => $message->threadId,
            'status' => 'OPEN',
            'bot_mode' => self::aiEnabled() ? 'BOT_FIRST' : 'HUMAN_FIRST',
            // Until the AI coordinator is enabled (G2) nobody would answer an AI_ACTIVE conversation.
            'control_state' => self::aiEnabled() ? 'AI_ACTIVE' : 'WAITING_HUMAN',
            'last_activity_at' => $now->format('Y-m-d H:i:s.v'),
        ]);

        return $find(true) ?? throw new \RuntimeException('Conversation could not be created.');
    }

    /** Assistant off: moves a conversation still under bot control to WAITING_HUMAN (epoch-fenced, tenant-scoped). */
    public static function handOffOrphanedBotConversation(int $tenantId, int $conversationId): bool
    {
        $conversation = DB::table('conversations')->where('tenant_id', $tenantId)->where('id', $conversationId)->first(['control_state', 'control_epoch']);
        if ($conversation === null || ! in_array($conversation->control_state, ConversationControl::BOT_STATES, true)) {
            return false;
        }
        try {
            app(ConversationControl::class)->requestHuman($tenantId, $conversationId, (int) $conversation->control_epoch, 'AI_DISABLED: asistente apagado');

            return true;
        } catch (ConversationConflict) {
            return false; // control moved meanwhile
        }
    }

    /**
     * Fail-safe: in production a synchronous queue would run the model call inside the visitor's
     * (or Meta's webhook) request and lose delayed retries, so the assistant stays off and
     * conversations wait for an advisor instead.
     */
    public static function aiEnabled(): bool
    {
        return (bool) config('conversations.ai_enabled', false)
            && ! (app()->isProduction() && config('queue.connections.'.config('queue.default').'.driver') === 'sync');
    }

    /** @return array{message_id: int, conversation_id: int, conversation_public_id: string, sequence: int}|null */
    private function existing(InboundMessage $message): ?array
    {
        if ($message->providerMessageId === null) {
            return null;
        }

        $row = DB::table('messages as m')
            ->join('conversations as c', fn ($j) => $j->on('c.id', '=', 'm.conversation_id')->on('c.tenant_id', '=', 'm.tenant_id'))
            ->where('m.tenant_id', $message->tenantId)
            ->where('m.channel_account_id', $message->channelAccountId)
            ->where('m.provider_message_id', $message->providerMessageId)
            ->first(['m.id', 'm.conversation_id', 'm.sequence', 'c.public_id']);

        return $row === null ? null : [
            'message_id' => (int) $row->id,
            'conversation_id' => (int) $row->conversation_id,
            'conversation_public_id' => (string) $row->public_id,
            'sequence' => (int) $row->sequence,
        ];
    }
}
