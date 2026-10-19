<?php

namespace Tests\Feature\Conversations;

use App\Domain\AgentRuntime\Coordinator\AgentCoordinator;
use App\Domain\AgentRuntime\Coordinator\CopilotFailure;
use App\Domain\AgentRuntime\Jobs\RunAgentJob;
use App\Domain\AgentRuntime\Tools\ToolContext;
use App\Domain\AgentRuntime\Tools\ToolError;
use App\Domain\AgentRuntime\Tools\ToolExecutions;
use App\Domain\Conversations\Exceptions\ConversationConflict;
use App\Domain\Conversations\Services\ConversationControl;
use App\Domain\Conversations\Services\InboundMessageService;
use App\Domain\Identity\Enums\RoleCode;
use App\Domain\Tenancy\Models\Tenant;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Queue;
use Illuminate\Support\Str;
use Tests\TestCase;

/** EVP-L01: per-tenant switch for the assistant and the copilot, off by default, without a redeploy. */
final class AiSettingsTest extends TestCase
{
    use ConversationTestSupport, DatabaseTransactions;

    protected function setUp(): void
    {
        parent::setUp();
        config(['conversations.web_rate_limit_per_minute' => 10_000, 'conversations.ai_enabled' => true,
            'conversations.copilot_enabled' => true, 'agent.llm_provider' => 'anthropic']);
        Queue::fake(); // the assistant's turn is not under test here
    }

    /** @param array<string, mixed>|null $settings */
    private function tenant(?array $settings = null): Tenant
    {
        return Tenant::factory()->create(['settings_json' => $settings]);
    }

    /** @return array{conversation: string, token: string} */
    private function webConversation(Tenant $tenant, bool $withMessage = true): array
    {
        $integration = (int) DB::table('integration_connections')->insertGetId([
            'tenant_id' => $tenant->id, 'public_id' => (string) Str::uuid(), 'provider' => 'WEB', 'name' => 'Web', 'status' => 'ACTIVE',
        ]);
        $widget = $this->webChannel($tenant->id, $integration);
        $token = (string) $this->withHeaders($this->tenantHeaders($tenant))
            ->postJson('/api/v1/public/chat/sessions', ['widget_id' => $widget['public_id']])->assertCreated()->json('data.token');
        if ($withMessage) {
            $this->withToken($token)->postJson('/api/v1/public/chat/messages', ['client_message_id' => (string) Str::uuid(), 'text' => 'Hola'])->assertCreated();
        }

        return ['conversation' => (string) DB::table('conversations')->where('tenant_id', $tenant->id)->latest('id')->value('public_id'), 'token' => $token];
    }

    /** @return array<string, mixed> */
    private function on(): array
    {
        return ['conversations' => ['ai_enabled' => true, 'copilot_enabled' => true]];
    }

    public function test_mode_changes_are_atomic_audited_and_preserve_unrelated_settings(): void
    {
        $tenant = $this->tenant(['branding' => ['name' => 'Demo'], 'conversations' => ['other' => 'keep']]);
        $admin = $this->user($tenant, RoleCode::TENANT_ADMIN);
        foreach (['AUTONOMOUS' => [true, true], 'COPILOT' => [false, true], 'DISABLED' => [false, false]] as $mode => [$ai, $copilot]) {
            $this->actingAs($admin)->withHeaders($this->tenantHeaders($tenant))
                ->putJson('/api/v1/admin/conversations-ai', ['mode' => $mode])->assertOk()
                ->assertJsonPath('data.mode', $mode)->assertJsonPath('data.ai_enabled', $ai)->assertJsonPath('data.copilot_enabled', $copilot);
            $settings = json_decode(DB::table('tenants')->where('id', $tenant->id)->value('settings_json'), true);
            $this->assertSame('Demo', $settings['branding']['name']);
            $this->assertSame('keep', $settings['conversations']['other']);
        }
        $this->assertSame(3, DB::table('audit_logs')->where('tenant_id', $tenant->id)->where('action_code', 'CONVERSATIONS_AI_SETTINGS_UPDATED')->count());
    }

    public function test_copilot_mode_never_dispatches_an_autonomous_turn_and_keeps_the_inbound_message(): void
    {
        $tenant = $this->tenant($this->on());
        $this->actingAs($this->user($tenant, RoleCode::TENANT_ADMIN))->withHeaders($this->tenantHeaders($tenant))
            ->putJson('/api/v1/admin/conversations-ai', ['mode' => 'COPILOT'])->assertOk();
        $this->webConversation($tenant);
        $this->assertSame('WAITING_HUMAN', DB::table('conversations')->where('tenant_id', $tenant->id)->value('control_state'));
        $this->assertSame(1, DB::table('messages')->where('tenant_id', $tenant->id)->where('direction', 'INBOUND')->count());
        $this->assertTrue(InboundMessageService::copilotEnabled($tenant->id));
        Queue::assertNotPushed(RunAgentJob::class);
    }

    public function test_autonomous_mode_dispatches_a_turn_but_copilot_switch_fences_a_queued_turn(): void
    {
        $tenant = $this->tenant();
        $admin = $this->user($tenant, RoleCode::TENANT_ADMIN);
        $this->actingAs($admin)->withHeaders($this->tenantHeaders($tenant))
            ->putJson('/api/v1/admin/conversations-ai', ['mode' => 'AUTONOMOUS'])->assertOk();
        $this->webConversation($tenant);
        Queue::assertPushed(RunAgentJob::class, fn ($job) => $job->tenantId === $tenant->id);
        $row = DB::table('conversations')->where('tenant_id', $tenant->id)->first(['id', 'next_sequence']);
        $this->actingAs($admin)->withHeaders($this->tenantHeaders($tenant))
            ->putJson('/api/v1/admin/conversations-ai', ['mode' => 'COPILOT'])->assertOk();
        $this->assertSame('SKIPPED_NOT_BOT', app(AgentCoordinator::class)->handle($tenant->id, (int) $row->id, (int) $row->next_sequence - 1));
        $this->assertSame(0, DB::table('chatbot_runs')->where('tenant_id', $tenant->id)->count());
    }

    public function test_invalid_or_ambiguous_mode_and_cross_tenant_changes_are_rejected(): void
    {
        [$a, $b] = [$this->tenant(), $this->tenant()];
        $admin = $this->user($a, RoleCode::TENANT_ADMIN);
        foreach ([['mode' => 'invalid'], ['mode' => 'COPILOT', 'ai_enabled' => true], ['mode' => 'AUTONOMOUS', 'copilot_enabled' => false]] as $payload) {
            $this->actingAs($admin)->withHeaders($this->tenantHeaders($a))
                ->putJson('/api/v1/admin/conversations-ai', $payload)->assertUnprocessable();
        }
        $this->actingAs($admin)->withHeaders($this->tenantHeaders($b))
            ->putJson('/api/v1/admin/conversations-ai', ['mode' => 'AUTONOMOUS'])->assertNotFound();
        $this->assertFalse(InboundMessageService::aiEnabled($a->id));
        $this->assertFalse(InboundMessageService::aiEnabled($b->id));
    }

    public function test_a_tenant_without_settings_has_the_assistant_and_copilot_off(): void
    {
        $tenant = $this->tenant();

        $this->assertFalse(InboundMessageService::aiEnabled($tenant->id));
        $this->assertFalse(InboundMessageService::copilotEnabled($tenant->id));
        $this->webConversation($tenant);
        $this->assertSame('WAITING_HUMAN', DB::table('conversations')->where('tenant_id', $tenant->id)->value('control_state'));
        Queue::assertNothingPushed();
    }

    public function test_the_admin_switches_one_tenant_without_touching_another_and_it_is_audited(): void
    {
        [$a, $b] = [$this->tenant(), $this->tenant()];
        $admin = $this->user($a, RoleCode::TENANT_ADMIN);

        $this->actingAs($admin)->withHeaders($this->tenantHeaders($a))->putJson('/api/v1/admin/conversations-ai', ['ai_enabled' => true])
            ->assertOk()->assertJsonPath('data.ai_enabled', true)->assertJsonPath('data.copilot_enabled', false)->assertJsonPath('data.ai_available', true);

        $this->assertTrue(InboundMessageService::aiEnabled($a->id));
        $this->assertFalse(InboundMessageService::aiEnabled($b->id), 'another tenant keeps its own switch');
        $this->webConversation($a);
        $this->assertSame('AI_ACTIVE', DB::table('conversations')->where('tenant_id', $a->id)->value('control_state'));

        $audit = DB::table('audit_logs')->where('tenant_id', $a->id)->where('action_code', 'CONVERSATIONS_AI_SETTINGS_UPDATED')->get();
        $this->assertCount(1, $audit);
        $this->assertSame($admin->id, (int) $audit[0]->actor_user_id);
        $this->assertFalse(json_decode($audit[0]->before_json, true)['ai_enabled']);
        $this->assertTrue(json_decode($audit[0]->after_json, true)['ai_enabled']);

        // Same value again: no write, no second audit row.
        $this->actingAs($admin)->withHeaders($this->tenantHeaders($a))->putJson('/api/v1/admin/conversations-ai', ['ai_enabled' => true])->assertOk();
        $this->assertSame(1, DB::table('audit_logs')->where('tenant_id', $a->id)->where('action_code', 'CONVERSATIONS_AI_SETTINGS_UPDATED')->count());
        $this->assertSame(0, DB::table('audit_logs')->where('tenant_id', $b->id)->where('action_code', 'CONVERSATIONS_AI_SETTINGS_UPDATED')->count());
    }

    public function test_only_a_tenant_admin_reads_or_changes_the_switch_and_only_for_their_own_tenant(): void
    {
        [$a, $b] = [$this->tenant(), $this->tenant()];
        foreach ([RoleCode::SALES_ADVISOR, RoleCode::SALES_MANAGER, RoleCode::BOT_OPERATOR, RoleCode::READ_ONLY, RoleCode::ROTATOR] as $role) {
            $user = $this->user($a, $role);
            $this->actingAs($user)->withHeaders($this->tenantHeaders($a))->getJson('/api/v1/admin/conversations-ai')->assertForbidden();
            $this->actingAs($user)->withHeaders($this->tenantHeaders($a))->putJson('/api/v1/admin/conversations-ai', ['ai_enabled' => true])->assertForbidden();
        }
        // An admin of A pointed at B's host neither reads nor changes B.
        $adminA = $this->user($a, RoleCode::TENANT_ADMIN);
        $this->actingAs($adminA)->withHeaders($this->tenantHeaders($b))->getJson('/api/v1/admin/conversations-ai')->assertNotFound(); // generic, like every cross-tenant read
        $this->actingAs($adminA)->withHeaders($this->tenantHeaders($b))->putJson('/api/v1/admin/conversations-ai', ['ai_enabled' => true])->assertNotFound();
        $this->assertFalse(InboundMessageService::aiEnabled($b->id));
        $this->assertFalse(InboundMessageService::aiEnabled($a->id));
    }

    public function test_the_platform_switch_still_wins_over_the_tenant(): void
    {
        $tenant = $this->tenant($this->on());
        config(['conversations.ai_enabled' => false, 'agent.llm_provider' => 'disabled']);

        $this->assertFalse(InboundMessageService::aiEnabled($tenant->id));
        $this->assertFalse(InboundMessageService::copilotEnabled($tenant->id));
        $this->actingAs($this->user($tenant, RoleCode::TENANT_ADMIN))->withHeaders($this->tenantHeaders($tenant))
            ->getJson('/api/v1/admin/conversations-ai')->assertOk()
            ->assertJsonPath('data.ai_enabled', true)->assertJsonPath('data.ai_available', false)->assertJsonPath('data.copilot_available', false);
    }

    public function test_switching_a_tenant_off_hands_its_bot_conversations_to_humans_and_leaves_others_alone(): void
    {
        [$on, $off] = [$this->tenant($this->on()), $this->tenant($this->on())];
        $this->webConversation($on);
        $this->webConversation($off);
        DB::table('tenants')->where('id', $off->id)->update(['settings_json' => json_encode(['conversations' => ['ai_enabled' => false]])]);

        $this->artisan('everprop:conversations:reconcile')->assertSuccessful();

        $this->assertSame('AI_ACTIVE', DB::table('conversations')->where('tenant_id', $on->id)->value('control_state'));
        $this->assertSame('WAITING_HUMAN', DB::table('conversations')->where('tenant_id', $off->id)->value('control_state'));
    }

    public function test_a_reply_prepared_before_the_switch_went_off_is_not_sent(): void
    {
        $tenant = $this->tenant($this->on());
        $this->webConversation($tenant);
        $row = DB::table('conversations')->where('tenant_id', $tenant->id)->first(['id', 'control_epoch']);
        DB::table('tenants')->where('id', $tenant->id)->update(['settings_json' => json_encode(['conversations' => ['ai_enabled' => false]])]);

        try {
            app(ConversationControl::class)->proposeBotReply($tenant->id, (int) $row->id, (int) $row->control_epoch, 'Hola, te ayudo', 'turn-1');
            $this->fail('the reply should have been rejected');
        } catch (ConversationConflict $e) {
            $this->assertSame('AI_DISABLED', $e->code_);
        }
        $this->assertSame(0, DB::table('outbound_jobs')->where('tenant_id', $tenant->id)->count());
    }

    public function test_the_inbox_reports_the_tenant_switches(): void
    {
        $tenant = $this->tenant(['conversations' => ['ai_enabled' => false, 'copilot_enabled' => true]]);
        ['conversation' => $conversation] = $this->webConversation($tenant);

        $this->actingAs($this->user($tenant, RoleCode::TENANT_ADMIN))->withHeaders($this->tenantHeaders($tenant))
            ->getJson("/api/v1/admin/conversations/$conversation/messages")->assertOk()
            ->assertJsonPath('conversation.ai_enabled', false)->assertJsonPath('conversation.copilot_enabled', true);
    }

    public function test_turning_it_off_hands_bot_conversations_to_humans_and_drops_queued_bot_replies(): void
    {
        $tenant = $this->tenant($this->on());
        $this->webConversation($tenant);
        $row = DB::table('conversations')->where('tenant_id', $tenant->id)->first(['id', 'control_epoch']);
        $reply = app(ConversationControl::class)->proposeBotReply($tenant->id, (int) $row->id, (int) $row->control_epoch, 'Hola, te ayudo', 'turn-1');

        $this->actingAs($this->user($tenant, RoleCode::TENANT_ADMIN))->withHeaders($this->tenantHeaders($tenant))
            ->putJson('/api/v1/admin/conversations-ai', ['ai_enabled' => false])->assertOk()->assertJsonPath('data.ai_enabled', false);

        $after = DB::table('conversations')->where('id', $row->id)->first(['control_state', 'control_epoch']);
        $this->assertSame('WAITING_HUMAN', $after->control_state);
        $this->assertGreaterThan((int) $row->control_epoch, (int) $after->control_epoch, 'the epoch fences whatever the turn still does');
        $this->assertSame('CANCELLED', DB::table('outbound_jobs')->where('id', $reply['job_id'])->value('status'), 'a queued bot reply never goes out');
    }

    public function test_a_queued_turn_of_a_tenant_switched_off_never_calls_the_model(): void
    {
        $tenant = $this->tenant($this->on());
        $this->webConversation($tenant);
        $row = DB::table('conversations')->where('tenant_id', $tenant->id)->first(['id', 'next_sequence']);
        DB::table('tenants')->where('id', $tenant->id)->update(['settings_json' => json_encode(['conversations' => ['ai_enabled' => false]])]);

        $outcome = app(AgentCoordinator::class)->handle($tenant->id, (int) $row->id, (int) $row->next_sequence - 1);

        $this->assertSame('SKIPPED_AI_DISABLED', $outcome);
        $this->assertSame(0, DB::table('chatbot_runs')->where('tenant_id', $tenant->id)->count(), 'no run, no reservation, no model call');
        $this->assertSame('WAITING_HUMAN', DB::table('conversations')->where('id', $row->id)->value('control_state'));
    }

    public function test_mutating_tools_stop_when_the_tenant_switches_off_mid_turn(): void
    {
        $tenant = $this->tenant($this->on());
        $this->webConversation($tenant);
        $c = DB::table('conversations')->where('tenant_id', $tenant->id)->first(['id', 'contact_id', 'channel_account_id', 'control_epoch', 'next_sequence']);
        $context = new ToolContext($tenant->id, (int) $c->id, (int) $c->contact_id, (int) $c->channel_account_id, 'WEB_CHAT',
            0, (int) $c->control_epoch, (int) $c->next_sequence - 1, (string) Str::uuid());
        DB::table('tenants')->where('id', $tenant->id)->update(['settings_json' => json_encode(['conversations' => ['ai_enabled' => false]])]);

        $ran = false;
        try {
            app(ToolExecutions::class)->once($context, 'registrar_interes', ['x' => 1], function () use (&$ran): array {
                $ran = true;

                return [];
            });
            $this->fail('the tool should have been stopped');
        } catch (ToolError $e) {
            $this->assertSame('STALE_CONTROL', $e->errorCode);
        }
        $this->assertFalse($ran);
        $this->assertSame(0, DB::table('tool_executions')->where('tenant_id', $tenant->id)->count());
    }

    public function test_copilot_and_resume_follow_the_tenant_switch(): void
    {
        $tenant = $this->tenant(['conversations' => ['ai_enabled' => false, 'copilot_enabled' => false]]);
        $this->webConversation($tenant);
        $id = (int) DB::table('conversations')->where('tenant_id', $tenant->id)->value('id');

        try {
            app(AgentCoordinator::class)->suggest($tenant->id, $id);
            $this->fail('copilot should be off for this tenant');
        } catch (CopilotFailure $e) {
            $this->assertSame('COPILOT_DISABLED', $e->errorCode);
        }
        try {
            app(ConversationControl::class)->resume($tenant->id, $id, $this->user($tenant, RoleCode::TENANT_ADMIN), 'volver a la IA');
            $this->fail('resume should be refused with the assistant off');
        } catch (ConversationConflict $e) {
            $this->assertSame('AI_DISABLED', $e->code_);
        }
    }

    public function test_a_malformed_tenant_setting_reads_as_off_and_can_be_fixed_by_the_admin(): void
    {
        $tenant = $this->tenant(['conversations' => 'legacy']);
        $this->assertFalse(InboundMessageService::aiEnabled($tenant->id));

        $this->actingAs($this->user($tenant, RoleCode::TENANT_ADMIN))->withHeaders($this->tenantHeaders($tenant) + ['X-Request-Id' => "bad\nid"])
            ->putJson('/api/v1/admin/conversations-ai', ['ai_enabled' => true])->assertOk()->assertJsonPath('data.ai_enabled', true);
        $this->assertNull(DB::table('audit_logs')->where('tenant_id', $tenant->id)->value('request_id'), 'an invalid request id is not stored');
    }
}
