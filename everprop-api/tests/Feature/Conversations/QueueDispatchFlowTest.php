<?php

namespace Tests\Feature\Conversations;

use App\Domain\AgentRuntime\Coordinator\AgentCoordinator;
use App\Domain\AgentRuntime\Jobs\RunAgentJob;
use App\Domain\AgentRuntime\Llm\LlmClient;
use App\Domain\AgentRuntime\Llm\LlmFailure;
use App\Domain\AgentRuntime\Llm\LlmResponse;
use App\Domain\Conversations\Services\InboundMessageService;
use App\Domain\Identity\Enums\RoleCode;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Queue;
use Illuminate\Support\Str;
use Tests\TestCase;

/**
 * Producer → storage → worker → result with QUEUE_CONNECTION=database and the assistant OFF:
 * a human reply is only a queued job until a worker consumes that same connection.
 */
final class QueueDispatchFlowTest extends TestCase
{
    use ConversationTestSupport, DatabaseTransactions;

    protected function setUp(): void
    {
        parent::setUp();
        config(['conversations.web_rate_limit_per_minute' => 10_000, 'conversations.ai_enabled' => false, 'queue.default' => 'database']);
    }

    public function test_human_reply_waits_in_the_database_queue_until_a_worker_consumes_it(): void
    {
        ['tenant' => $tenant, 'integration' => $integration] = $this->tenantWithIntegration('WEB');
        $channel = $this->webChannel($tenant->id, $integration);
        $token = $this->withHeaders($this->tenantHeaders($tenant))->postJson('/api/v1/public/chat/sessions', ['widget_id' => $channel['public_id']])->json('data.token');
        $send = fn () => $this->withHeaders($this->tenantHeaders($tenant))->withToken($token);
        $send()->postJson('/api/v1/public/chat/messages', ['client_message_id' => (string) Str::uuid(), 'text' => 'Hola'])->assertCreated();
        $this->flushHeaders();

        $conversation = DB::table('conversations')->where('tenant_id', $tenant->id)->first(['id', 'public_id', 'control_state']);
        $this->assertSame('WAITING_HUMAN', $conversation->control_state, 'assistant off: the visitor waits for an advisor');
        $this->assertSame(0, DB::table('chatbot_runs')->where('tenant_id', $tenant->id)->count());

        $advisor = $this->user($tenant, RoleCode::SALES_MANAGER);
        $this->actingAs($advisor)->withHeaders($this->tenantHeaders($tenant))->postJson("/api/v1/admin/conversations/{$conversation->public_id}/takeover")->assertOk();
        $this->postJson("/api/v1/admin/conversations/{$conversation->public_id}/messages", ['text' => 'Hola, soy Ana', 'idempotency_key' => 'reply-queue-0001'])->assertStatus(202);
        $this->flushHeaders();

        // Stored, not sent, not visible.
        $this->assertSame(1, DB::table('jobs')->where('payload', 'like', '%DispatchOutboundJob%')->count());
        $this->assertSame('QUEUED', DB::table('messages')->where('conversation_id', $conversation->id)->where('direction', 'OUTBOUND')->value('delivery_status'));
        $visible = fn () => array_column($send()->getJson('/api/v1/public/chat/messages')->assertOk()->json('data'), 'text');
        $this->assertSame(['Hola'], $visible());

        // A worker on the same connection delivers it.
        $this->artisan('queue:work', ['connection' => 'database', '--once' => true, '--stop-when-empty' => true])->assertSuccessful();

        $this->assertSame(0, DB::table('jobs')->where('payload', 'like', '%DispatchOutboundJob%')->count());
        $this->assertSame('SENT', DB::table('messages')->where('conversation_id', $conversation->id)->where('direction', 'OUTBOUND')->value('delivery_status'));
        $this->assertSame(['Hola', 'Hola, soy Ana'], $visible());
    }

    public function test_with_the_assistant_off_no_turn_is_ever_queued(): void
    {
        Queue::fake();
        ['tenant' => $tenant, 'integration' => $integration] = $this->tenantWithIntegration('WEB');
        $channel = $this->webChannel($tenant->id, $integration);
        $token = $this->withHeaders($this->tenantHeaders($tenant))->postJson('/api/v1/public/chat/sessions', ['widget_id' => $channel['public_id']])->json('data.token');
        $this->withToken($token)->postJson('/api/v1/public/chat/messages', ['client_message_id' => (string) Str::uuid(), 'text' => 'Hola'])->assertCreated();

        Queue::assertNotPushed(RunAgentJob::class);
    }

    public function test_switching_the_assistant_off_hands_orphaned_bot_conversations_to_humans(): void
    {
        Queue::fake([RunAgentJob::class]);
        config(['conversations.ai_enabled' => true]);
        ['tenant' => $tenant, 'integration' => $integration] = $this->tenantWithIntegration('WEB');
        $channel = $this->webChannel($tenant->id, $integration);
        $open = function () use ($tenant, $channel): array {
            $token = $this->withHeaders($this->tenantHeaders($tenant))->postJson('/api/v1/public/chat/sessions', ['widget_id' => $channel['public_id']])->json('data.token');
            $this->withToken($token)->postJson('/api/v1/public/chat/messages', ['client_message_id' => (string) Str::uuid(), 'text' => 'Hola'])->assertCreated();
            $id = (int) DB::table('public_chat_sessions')->where('tenant_id', $tenant->id)->orderByDesc('id')->value('conversation_id');

            return [$token, $id];
        };
        [$tokenA, $a] = $open();
        [, $b] = $open();
        [, $c] = $open();
        $state = fn (int $id) => DB::table('conversations')->where('id', $id)->value('control_state');
        $this->assertSame(['AI_ACTIVE', 'AI_ACTIVE', 'AI_ACTIVE'], [$state($a), $state($b), $state($c)]);

        config(['conversations.ai_enabled' => false]); // rollback

        // 1. New visitor message on a bot conversation.
        $this->withToken($tokenA)->postJson('/api/v1/public/chat/messages', ['client_message_id' => (string) Str::uuid(), 'text' => '¿Hay alguien?'])->assertCreated();
        $this->assertSame('WAITING_HUMAN', $state($a));

        // 2. A turn queued before the rollback does not call the model nor reserve budget.
        $llm = new class implements LlmClient
        {
            public int $calls = 0;

            public function complete(string $system, array $messages, array $tools, int $maxOutputTokens, bool $allowTools): LlmResponse
            {
                $this->calls++;
                throw new LlmFailure('UNEXPECTED_CALL', retryable: false, billable: false);
            }

            public function provider(): string
            {
                return 'spy';
            }

            public function model(): string
            {
                return 'spy';
            }
        };
        $this->app->instance(LlmClient::class, $llm);
        $seq = (int) DB::table('messages')->where('conversation_id', $b)->max('sequence');
        $this->assertSame('SKIPPED_AI_DISABLED', app(AgentCoordinator::class)->handle($tenant->id, $b, $seq));
        $this->assertSame('WAITING_HUMAN', $state($b));
        $this->assertSame(0, DB::table('chatbot_runs')->where('conversation_id', $b)->count());
        $this->assertSame(0, $llm->calls);
        $this->assertSame(0, DB::table('usage_ledger')->where('tenant_id', $tenant->id)->count());

        // 3. The sweep catches conversations with an unanswered visitor and no new message.
        $this->artisan('everprop:conversations:reconcile')->assertSuccessful();
        $this->assertSame('WAITING_HUMAN', $state($c));
    }

    public function test_ai_off_sweep_leaves_answered_closed_human_and_stale_conversations_alone(): void
    {
        Queue::fake([RunAgentJob::class]);
        ['tenant' => $tenant, 'integration' => $integration] = $this->tenantWithIntegration('WEB');
        $channel = $this->webChannel($tenant->id, $integration);
        $contact = (int) DB::table('contacts')->insertGetId(['tenant_id' => $tenant->id, 'public_id' => (string) Str::uuid(),
            'first_seen_at' => now(), 'last_seen_at' => now()]);
        $make = function (array $row) use ($tenant, $channel, $contact): int {
            return (int) DB::table('conversations')->insertGetId($row + [
                'tenant_id' => $tenant->id, 'public_id' => (string) Str::uuid(), 'contact_id' => $contact,
                'channel_account_id' => $channel['id'], 'provider_thread_id' => 'web:'.Str::uuid(),
                'status' => 'OPEN', 'bot_mode' => 'BOT_FIRST', 'control_state' => 'AI_ACTIVE', 'last_activity_at' => now(),
            ]);
        };
        $now = now();
        $unanswered = $make(['last_inbound_at' => $now, 'last_outbound_at' => $now->copy()->subMinute()]);
        $botAnsweredLast = $make(['last_inbound_at' => $now->copy()->subMinute(), 'last_outbound_at' => $now]);
        $resolved = $make(['last_inbound_at' => $now, 'status' => 'RESOLVED', 'closed_at' => $now]);
        $human = $make(['last_inbound_at' => $now, 'control_state' => 'HUMAN_ACTIVE']);
        $stale = $make(['last_inbound_at' => $now->copy()->subDays(10)]);

        config(['conversations.ai_enabled' => false]);
        $this->artisan('everprop:conversations:reconcile')->assertSuccessful();

        $state = fn (int $id) => DB::table('conversations')->where('id', $id)->value('control_state');
        $this->assertSame('WAITING_HUMAN', $state($unanswered));
        $this->assertSame(['AI_ACTIVE', 'AI_ACTIVE', 'HUMAN_ACTIVE', 'AI_ACTIVE'], [$state($botAnsweredLast), $state($resolved), $state($human), $state($stale)]);

        // With the assistant on, the sweep does nothing.
        DB::table('conversations')->where('id', $unanswered)->update(['control_state' => 'AI_ACTIVE']);
        config(['conversations.ai_enabled' => true]);
        $this->artisan('everprop:conversations:reconcile')->assertSuccessful();
        $this->assertSame('AI_ACTIVE', $state($unanswered));
    }

    public function test_the_same_reply_key_on_two_conversations_is_two_replies(): void
    {
        ['tenant' => $tenant, 'integration' => $integration] = $this->tenantWithIntegration('WEB');
        $channel = $this->webChannel($tenant->id, $integration);
        $advisor = $this->user($tenant, RoleCode::SALES_MANAGER);
        $ids = [];
        foreach ([1, 2] as $n) {
            $token = $this->withHeaders($this->tenantHeaders($tenant))->postJson('/api/v1/public/chat/sessions', ['widget_id' => $channel['public_id']])->json('data.token');
            $this->withToken($token)->postJson('/api/v1/public/chat/messages', ['client_message_id' => (string) Str::uuid(), 'text' => "Hola $n"])->assertCreated();
            $this->flushHeaders();
            $ids[] = (string) DB::table('public_chat_sessions')->join('conversations', 'conversations.id', '=', 'public_chat_sessions.conversation_id')
                ->where('public_chat_sessions.tenant_id', $tenant->id)->orderByDesc('public_chat_sessions.id')->value('conversations.public_id');
        }
        foreach ($ids as $id) {
            $this->actingAs($advisor)->withHeaders($this->tenantHeaders($tenant))->postJson("/api/v1/admin/conversations/$id/takeover")->assertOk();
            $this->postJson("/api/v1/admin/conversations/$id/messages", ['text' => 'Buen día', 'idempotency_key' => 'same-key-0001-abcdefgh'])->assertStatus(202);
            $this->flushHeaders();
        }

        $this->assertSame(2, DB::table('messages')->where('tenant_id', $tenant->id)->where('text_body', 'Buen día')->distinct()->count('conversation_id'));
    }

    public function test_ai_off_handoff_and_sweep_never_cross_tenants(): void
    {
        Queue::fake([RunAgentJob::class]);
        $botConversation = function (?object $tenant = null, string $control = 'AI_ACTIVE'): array {
            if ($tenant === null) {
                ['tenant' => $tenant, 'integration' => $integration] = $this->tenantWithIntegration('WEB');
                $this->webChannel($tenant->id, $integration);
            }
            $channel = (int) DB::table('channel_accounts')->where('tenant_id', $tenant->id)->value('id');
            $contact = (int) DB::table('contacts')->insertGetId(['tenant_id' => $tenant->id, 'public_id' => (string) Str::uuid(),
                'first_seen_at' => now(), 'last_seen_at' => now()]);
            $id = (int) DB::table('conversations')->insertGetId([
                'tenant_id' => $tenant->id, 'public_id' => (string) Str::uuid(), 'contact_id' => $contact,
                'channel_account_id' => $channel, 'provider_thread_id' => 'web:'.Str::uuid(), 'status' => 'OPEN',
                'bot_mode' => 'BOT_FIRST', 'control_state' => $control, 'last_activity_at' => now(), 'last_inbound_at' => now(),
            ]);

            return [$tenant, $id];
        };
        [$a, $convA] = $botConversation();
        [$b, $convB] = $botConversation();
        [, $humanB] = $botConversation($b, 'HUMAN_ACTIVE');
        config(['conversations.ai_enabled' => false]);
        $state = fn (int $id) => DB::table('conversations')->where('id', $id)->value('control_state');
        $handoffs = fn (object $tenant) => DB::table('domain_outbox')->where('tenant_id', $tenant->id)
            ->where('event_type', 'CONVERSATION_HANDOFF_REQUESTED')->pluck('aggregate_id')->map(fn ($id) => (int) $id)->all();

        // A valid id of another tenant is not found under tenant A: no effect and no event in either tenant.
        $this->assertFalse(InboundMessageService::handOffOrphanedBotConversation($a->id, $convB));
        $this->assertSame('SKIPPED_NOT_BOT', app(AgentCoordinator::class)->handle($a->id, $convB, 1));
        $this->assertSame('AI_ACTIVE', $state($convB));
        $this->assertSame([[], []], [$handoffs($a), $handoffs($b)]);

        // The platform sweep hands off each tenant's own conversation under its own tenant, and skips the advisor's.
        $this->artisan('everprop:conversations:reconcile')->assertSuccessful();
        $this->assertSame(['WAITING_HUMAN', 'WAITING_HUMAN', 'HUMAN_ACTIVE'], [$state($convA), $state($convB), $state($humanB)]);
        $this->assertSame([[$convA], [$convB]], [$handoffs($a), $handoffs($b)]);
    }

    public function test_a_reply_key_is_never_matched_against_another_tenants_jobs(): void
    {
        $open = function (): array {
            ['tenant' => $tenant, 'integration' => $integration] = $this->tenantWithIntegration('WEB');
            $channel = $this->webChannel($tenant->id, $integration);
            $token = $this->withHeaders($this->tenantHeaders($tenant))->postJson('/api/v1/public/chat/sessions', ['widget_id' => $channel['public_id']])->json('data.token');
            $this->withToken($token)->postJson('/api/v1/public/chat/messages', ['client_message_id' => (string) Str::uuid(), 'text' => 'Hola'])->assertCreated();
            $this->flushHeaders();
            $conversation = DB::table('conversations')->where('tenant_id', $tenant->id)->first(['id', 'public_id']);

            return [$tenant, $this->user($tenant, RoleCode::SALES_MANAGER), $conversation];
        };
        $reply = function (object $tenant, object $advisor, object $conversation, string $text, string $key) {
            $this->app['auth']->forgetGuards();
            $this->actingAs($advisor)->withHeaders($this->tenantHeaders($tenant))->postJson("/api/v1/admin/conversations/{$conversation->public_id}/takeover")->assertOk();
            $response = $this->postJson("/api/v1/admin/conversations/{$conversation->public_id}/messages", ['text' => $text, 'idempotency_key' => $key]);
            $this->flushHeaders();

            return $response;
        };
        [$a, $advisorA, $convA] = $open();
        [$b, $advisorB, $convB] = $open();

        // Tenant B holds a job whose internal key is exactly the one tenant A's reply will produce, for other text.
        $reply($b, $advisorB, $convB, 'Texto de B', 'kb-0001-abcdefgh')->assertStatus(202);
        DB::table('outbound_jobs')->where('tenant_id', $b->id)->where('requested_by_user_id', $advisorB->id)
            ->update(['idempotency_key' => 'user:'.$advisorA->id.':c'.$convA->id.':same-key-0001-abcdefgh']);

        // Looked up without the tenant, this would be a 409 (other text) or a replay of B's message.
        $reply($a, $advisorA, $convA, 'Buen día', 'same-key-0001-abcdefgh')->assertStatus(202)->assertJsonPath('data.replayed', false);
        $this->assertSame(1, DB::table('messages')->where('tenant_id', $a->id)->where('text_body', 'Buen día')->count());
    }
}
