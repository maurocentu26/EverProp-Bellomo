<?php

namespace Tests\Feature\AgentRuntime;

use App\Domain\AgentRuntime\Coordinator\AgentCoordinator;
use App\Domain\AgentRuntime\Tools\ToolContext;
use App\Domain\AgentRuntime\Tools\ToolGateway;
use App\Domain\Identity\Enums\RoleCode;
use App\Domain\Tenancy\Models\Tenant;
use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Tests\Feature\Conversations\ConversationTestSupport;
use Tests\TestCase;

final class RegistrarContactoTest extends TestCase
{
    use ConversationTestSupport;

    /** @var list<int> */
    private array $tenants = [];

    protected function setUp(): void
    {
        parent::setUp();
        config(['conversations.ai_enabled' => true]);
    }

    protected function tearDown(): void
    {
        $this->deleteSyntheticTenants($this->tenants);
        parent::tearDown();
    }

    /** @return array{tenant: Tenant, advisor: User, conversation_id: int, contact_id: int, channel_id: int, public_id: string, run_id: int} */
    private function setupConversation(): array
    {
        ['tenant' => $tenant, 'integration' => $integration] = $this->tenantWithIntegration('WEB');
        $this->tenants[] = (int) $tenant->id;
        $tenant->update(['settings_json' => ['conversations' => ['ai_enabled' => true]]]);

        $advisor = User::factory()->create([
            'tenant_id' => $tenant->id,
            'role_code' => RoleCode::SALES_ADVISOR->value,
            'status' => 'ACTIVE',
        ]);

        DB::table('pipeline_stages')->insert([
            'tenant_id' => $tenant->id,
            'code' => 'NEW',
            'name' => 'New',
            'category' => 'OPEN',
            'position' => 1,
            'is_active' => true,
        ]);

        $poolId = (int) DB::table('assignment_pools')->insertGetId([
            'tenant_id' => $tenant->id,
            'name' => 'Default Pool',
            'purpose_code' => 'NEW_LEADS',
            'strategy' => 'ROUND_ROBIN',
            'is_default' => 1,
            'status' => 'ACTIVE',
        ]);

        DB::table('assignment_pool_members')->insert([
            'tenant_id' => $tenant->id,
            'pool_id' => $poolId,
            'user_id' => $advisor->id,
            'position' => 1,
            'status' => 'ACTIVE',
        ]);

        $contactId = (int) DB::table('contacts')->insertGetId([
            'tenant_id' => $tenant->id,
            'public_id' => (string) Str::uuid(),
            'display_name' => 'Visitante Web',
            'first_seen_at' => now(),
            'last_seen_at' => now(),
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $channelId = (int) DB::table('channel_accounts')->insertGetId([
            'tenant_id' => $tenant->id,
            'integration_id' => $integration,
            'public_id' => (string) Str::uuid(),
            'channel_type' => 'WEB_CHAT',
            'provider_account_id' => 'web-test',
            'display_name' => 'Web Chat',
        ]);

        $convPublicId = (string) Str::uuid();
        $conversationId = (int) DB::table('conversations')->insertGetId([
            'tenant_id' => $tenant->id,
            'public_id' => $convPublicId,
            'contact_id' => $contactId,
            'channel_account_id' => $channelId,
            'provider_thread_id' => 'web:'.$convPublicId,
            'status' => 'OPEN',
            'bot_mode' => 'BOT_FIRST',
            'control_state' => 'AI_ACTIVE',
            'control_epoch' => 1,
            'next_sequence' => 2,
            'last_activity_at' => now(),
        ]);

        $sessionId = (int) DB::table('chatbot_sessions')->insertGetId([
            'tenant_id' => $tenant->id,
            'chatbot_agent_id' => DB::table('chatbot_agents')->insertGetId([
                'tenant_id' => $tenant->id,
                'public_id' => (string) Str::uuid(),
                'name' => AgentCoordinator::AGENT_NAME,
                'mode' => 'AI',
                'status' => 'ACTIVE',
                'prompt_version' => 'test',
            ]),
            'conversation_id' => $conversationId,
            'status' => 'ACTIVE',
            'started_at' => now(),
            'last_activity_at' => now(),
        ]);

        $inputMsgId = (int) DB::table('messages')->insertGetId([
            'tenant_id' => $tenant->id,
            'conversation_id' => $conversationId,
            'channel_account_id' => $channelId,
            'sequence' => 1,
            'direction' => 'INBOUND',
            'sender_type' => 'CONTACT',
            'message_type' => 'TEXT',
            'text_body' => 'Hola',
            'occurred_at' => now(),
        ]);

        $runId = (int) DB::table('chatbot_runs')->insertGetId([
            'tenant_id' => $tenant->id,
            'session_id' => $sessionId,
            'conversation_id' => $conversationId,
            'control_epoch' => 1,
            'input_sequence' => 1,
            'input_message_id' => $inputMsgId,
            'provider_run_id' => 'turn:'.$conversationId.':1',
            'model_provider' => 'gemini',
            'model_name' => 'gemini-3.1-flash-lite',
            'prompt_version' => 'test',
            'decision' => 'REPLY',
            'status' => 'STARTED',
            'started_at' => now(),
        ]);

        return [
            'tenant' => $tenant,
            'advisor' => $advisor,
            'conversation_id' => $conversationId,
            'contact_id' => $contactId,
            'channel_id' => $channelId,
            'public_id' => $convPublicId,
            'run_id' => $runId,
        ];
    }

    public function test_creates_lead_without_property_and_assigns_conversation_to_advisor(): void
    {
        $setup = $this->setupConversation();
        $tenantId = (int) $setup['tenant']->id;
        $context = new ToolContext(
            $tenantId,
            $setup['conversation_id'],
            $setup['contact_id'],
            $setup['channel_id'],
            'WEB_CHAT',
            $setup['run_id'],
            1,
            1,
            (string) Str::uuid()
        );

        $gateway = app(ToolGateway::class);
        $result = $gateway->execute($context, 'registrar_contacto', [
            'contact_name' => 'Juan Pérez',
            'contact_phone' => '+54 9 388 555 1234',
            'notes' => 'Busca departamento de 2 dormitorios',
        ]);

        $this->assertTrue($result['ok']);
        $this->assertSame('PERSISTED', $result['data']['status']);

        // Lead exists and is associated
        $lead = DB::table('leads')->where('tenant_id', $tenantId)->where('public_id', $result['data']['lead_id'])->first();
        $this->assertNotNull($lead);
        $this->assertSame($setup['advisor']->id, (int) $lead->assigned_user_id);

        // Conversation assigned to lead owner while remaining in AI_ACTIVE
        $conv = DB::table('conversations')->where('tenant_id', $tenantId)->where('id', $setup['conversation_id'])->first();
        $this->assertSame($setup['advisor']->id, (int) $conv->assigned_user_id);
        $this->assertSame('AI_ACTIVE', $conv->control_state);

        // Session and outbox recorded
        $session = DB::table('chatbot_sessions')->where('tenant_id', $tenantId)->where('conversation_id', $setup['conversation_id'])->first();
        $this->assertSame((int) $lead->id, (int) $session->lead_id);

        $outbox = DB::table('domain_outbox')->where('tenant_id', $tenantId)->where('event_type', 'LEAD_CONTACT_CAPTURED')->first();
        $this->assertNotNull($outbox);

        // Advisor can see the conversation in the inbox
        $this->actingAs($setup['advisor'])
            ->withHeaders($this->tenantHeaders($setup['tenant']))
            ->getJson('/api/v1/admin/conversations')
            ->assertOk()
            ->assertJsonFragment(['id' => $setup['public_id']]);
    }

    public function test_replay_is_idempotent(): void
    {
        $setup = $this->setupConversation();
        $tenantId = (int) $setup['tenant']->id;
        $context = new ToolContext(
            $tenantId,
            $setup['conversation_id'],
            $setup['contact_id'],
            $setup['channel_id'],
            'WEB_CHAT',
            $setup['run_id'],
            1,
            1,
            (string) Str::uuid()
        );

        $gateway = app(ToolGateway::class);
        $args = [
            'contact_name' => 'María Gomez',
            'contact_phone' => '+54 9 388 444 5678',
        ];

        $res1 = $gateway->execute($context, 'registrar_contacto', $args);
        $this->assertTrue($res1['ok']);
        $this->assertFalse($res1['meta']['replayed']);

        $res2 = $gateway->execute($context, 'registrar_contacto', $args);
        $this->assertTrue($res2['ok']);
        $this->assertTrue($res2['meta']['replayed']);
        $this->assertSame($res1['data']['lead_id'], $res2['data']['lead_id']);

        $this->assertSame(1, DB::table('leads')->where('tenant_id', $tenantId)->count());
    }

    public function test_does_not_override_existing_assigned_user(): void
    {
        $setup = $this->setupConversation();
        $tenantId = (int) $setup['tenant']->id;

        $otherAdvisor = User::factory()->create([
            'tenant_id' => $tenantId,
            'role_code' => RoleCode::SALES_ADVISOR->value,
            'status' => 'ACTIVE',
        ]);

        DB::table('conversations')->where('tenant_id', $tenantId)->where('id', $setup['conversation_id'])
            ->update(['assigned_user_id' => $otherAdvisor->id]);

        $context = new ToolContext(
            $tenantId,
            $setup['conversation_id'],
            $setup['contact_id'],
            $setup['channel_id'],
            'WEB_CHAT',
            $setup['run_id'],
            1,
            1,
            (string) Str::uuid()
        );

        $gateway = app(ToolGateway::class);
        $result = $gateway->execute($context, 'registrar_contacto', [
            'contact_phone' => '+54 9 388 111 2222',
        ]);

        $this->assertTrue($result['ok']);

        $conv = DB::table('conversations')->where('tenant_id', $tenantId)->where('id', $setup['conversation_id'])->first();
        $this->assertSame($otherAdvisor->id, (int) $conv->assigned_user_id);
    }

    public function test_requires_reachable_contact_on_web_chat(): void
    {
        $setup = $this->setupConversation();
        $tenantId = (int) $setup['tenant']->id;

        $context = new ToolContext(
            $tenantId,
            $setup['conversation_id'],
            $setup['contact_id'],
            $setup['channel_id'],
            'WEB_CHAT',
            $setup['run_id'],
            1,
            1,
            (string) Str::uuid()
        );

        $gateway = app(ToolGateway::class);
        $result = $gateway->execute($context, 'registrar_contacto', [
            'contact_name' => 'Solo Nombre',
        ]);

        $this->assertFalse($result['ok']);
        $this->assertSame('VALIDATION_ERROR', $result['error']['code']);
    }
}
