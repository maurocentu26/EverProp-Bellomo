<?php

namespace Tests\Feature\Conversations;

use App\Domain\AgentRuntime\Llm\LlmClient;
use App\Domain\Identity\Enums\RoleCode;
use App\Domain\Tenancy\Models\Tenant;
use Carbon\CarbonImmutable;
use Illuminate\Http\Response;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Illuminate\Testing\TestResponse;
use Tests\Feature\AgentRuntime\ScriptedLlm;
use Tests\TestCase;

/**
 * EVP-23: the tenant admin sees this tenant's AI spend against its own cap, per day in its clock, and how many
 * replies the cap stopped. Never another tenant's numbers. Rows are committed (the agent flow needs it) and cleaned up.
 */
final class AssistantUsageTest extends TestCase
{
    use ConversationTestSupport;

    /** @var list<int> */
    private array $tenants = [];

    protected function setUp(): void
    {
        parent::setUp();
        config(['conversations.web_rate_limit_per_minute' => 10_000, 'conversations.ai_enabled' => true,
            'usage.global_cap_micros' => 1_000_000_000, 'conversations.copilot_monthly_usd' => 10.0]);
    }

    protected function tearDown(): void
    {
        DB::table('usage_ledger')->whereIn('tenant_id', $this->tenants)->delete();
        $this->deleteSyntheticTenants($this->tenants);
        parent::tearDown();
    }

    /** @return array{tenant: Tenant, widget: string} */
    private function tenant(int $capMicros = 10_000_000): array
    {
        ['tenant' => $tenant, 'integration' => $integration] = $this->tenantWithIntegration('WEB');
        $this->tenants[] = (int) $tenant->id;
        $tenant->update(['timezone' => 'America/Argentina/Salta',
            'settings_json' => ['conversations' => ['ai_enabled' => true], 'usage' => ['monthly_cap_micros' => $capMicros]]]);
        DB::table('pipeline_stages')->insert(['tenant_id' => $tenant->id, 'code' => 'NEW', 'name' => 'New', 'category' => 'OPEN', 'position' => 1, 'is_active' => true]);

        return ['tenant' => $tenant, 'widget' => $this->webChannel($tenant->id, $integration)['public_id']];
    }

    private function ledger(Tenant $tenant, string $utc, string $status, int $reserved, ?int $actual = null): void
    {
        DB::table('usage_ledger')->insert(['tenant_id' => $tenant->id, 'operation_key' => 'test:'.Str::uuid(), 'category' => 'LLM',
            'period' => substr($utc, 0, 7), 'reserved_micros' => $reserved, 'actual_micros' => $actual, 'status' => $status,
            'created_at' => $utc.'.000']);
    }

    /** @param array{tenant: Tenant, widget: string} $t */
    private function visitor(array $t, string $text): void
    {
        $token = (string) $this->withHeaders($this->tenantHeaders($t['tenant']))
            ->postJson('/api/v1/public/chat/sessions', ['widget_id' => $t['widget']])->assertCreated()->json('data.token');
        $this->withToken($token)->postJson('/api/v1/public/chat/messages', ['client_message_id' => (string) Str::uuid(), 'text' => $text])->assertCreated();
        $this->flushHeaders();
    }

    /** @return TestResponse<Response> */
    private function usage(Tenant $tenant, RoleCode $role = RoleCode::TENANT_ADMIN, string $query = '', ?Tenant $host = null): TestResponse
    {
        $response = $this->actingAs($this->user($tenant, $role))->withHeaders($this->tenantHeaders($host ?? $tenant))
            ->getJson('/api/v1/admin/assistant/usage'.$query);
        $this->flushHeaders();

        return $response;
    }

    public function test_the_admin_sees_only_this_tenant_spend_against_its_own_cap_per_local_day(): void
    {
        [$a, $b] = [$this->tenant()['tenant'], $this->tenant()['tenant']];
        $this->travelTo(CarbonImmutable::parse('2026-10-20 12:00', 'UTC'));
        // 02:00 UTC on the 15th is still the 14th in Salta (UTC−3).
        $this->ledger($a, '2026-10-15 02:00:00', 'COMMITTED', 50_000, 1_000_000);
        $this->ledger($a, '2026-10-15 15:00:00', 'COMMITTED', 50_000, 500_000);
        $this->ledger($a, '2026-10-16 15:00:00', 'RESERVED', 500_000);
        $this->ledger($a, '2026-10-16 16:00:00', 'RELEASED', 900_000, 0);
        $this->ledger($a, '2026-09-30 15:00:00', 'COMMITTED', 50_000, 7_000_000); // last month
        $this->ledger($b, '2026-10-15 15:00:00', 'COMMITTED', 50_000, 9_000_000); // another tenant

        $this->usage($a)->assertOk()
            ->assertJsonPath('data.period', '2026-10')
            ->assertJsonPath('data.spent_usd', 2)
            ->assertJsonPath('data.cap_usd', 10)
            ->assertJsonPath('data.used_pct', 20)
            ->assertJsonPath('data.open_reservations_usd', 0.5)
            ->assertJsonPath('data.by_day', [['date' => '2026-10-14', 'usd' => 1], ['date' => '2026-10-15', 'usd' => 0.5], ['date' => '2026-10-16', 'usd' => 0.5]]);
        $this->usage($a, query: '?period=2026-09')->assertOk()->assertJsonPath('data.spent_usd', 7);
        $this->usage($b)->assertOk()->assertJsonPath('data.spent_usd', 9)->assertJsonPath('data.used_pct', 90);
    }

    public function test_only_admins_read_it_and_never_through_another_tenant(): void
    {
        [$a, $b] = [$this->tenant()['tenant'], $this->tenant()['tenant']];
        foreach ([RoleCode::SALES_MANAGER, RoleCode::SALES_ADVISOR, RoleCode::READ_ONLY, RoleCode::ROTATOR, RoleCode::BOT_OPERATOR] as $role) {
            $this->usage($a, $role)->assertForbidden();
        }
        $this->usage($a, query: '?period=2026-13')->assertStatus(422);
        $this->usage($a, query: '?period=hola')->assertStatus(422);
        $this->usage($a, host: $b)->assertNotFound();
    }

    public function test_assistant_replies_and_replies_stopped_by_the_cap_are_counted(): void
    {
        $open = $this->tenant();
        $this->app->instance(LlmClient::class, new ScriptedLlm([ScriptedLlm::text('Hola, ¿en qué te ayudo?')]));
        $this->visitor($open, 'hola');
        $this->usage($open['tenant'])->assertOk()->assertJsonPath('data.assistant.runs', 1)
            ->assertJsonPath('data.assistant.blocked_by_cap', 0)->assertJsonPath('data.copilot.runs', 0);

        // A tenant whose cap cannot cover a single call: the turn is stopped and handed to a person.
        $broke = $this->tenant(capMicros: 1);
        $this->app->instance(LlmClient::class, new ScriptedLlm([ScriptedLlm::text('no debería salir')]));
        $this->visitor($broke, 'hola');
        $this->usage($broke['tenant'])->assertOk()->assertJsonPath('data.assistant.blocked_by_cap', 1);
        $this->assertSame('WAITING_HUMAN', DB::table('conversations')->where('tenant_id', $broke['tenant']->id)->value('control_state'));
        $this->usage($broke['tenant'])->assertJsonMissingPath('data.copilot.blocked_by_cap');
    }

    /** A run on the tenant's first assistant session (a real turn creates the agent, session and conversation). */
    private function addRun(Tenant $tenant, string $ref, string $startedUtc, float $cost, int $in = 1000, int $out = 100): void
    {
        $session = DB::table('chatbot_sessions')->where('tenant_id', $tenant->id)->orderBy('id')->first(['id', 'conversation_id']);
        DB::table('chatbot_runs')->insert(['tenant_id' => $tenant->id, 'session_id' => $session->id, 'conversation_id' => $session->conversation_id,
            'provider_run_id' => $ref, 'decision' => 'REPLY', 'status' => 'SUCCEEDED', 'input_tokens' => $in, 'output_tokens' => $out,
            'estimated_cost' => $cost, 'started_at' => $startedUtc]);
    }

    public function test_copilot_spend_month_edges_and_a_super_admin_stay_inside_the_resolved_tenant(): void
    {
        [$a, $b] = [$this->tenant(), $this->tenant()];
        foreach ([$a, $b] as $t) {
            $this->app->instance(LlmClient::class, new ScriptedLlm([ScriptedLlm::text('Hola')]));
            $this->travelTo(CarbonImmutable::parse('2026-09-15 12:00', 'UTC'));
            $this->visitor($t, 'hola'); // September run: outside October
        }
        $this->addRun($a['tenant'], 'suggest:a1', '2026-10-01 00:00:00.000', 0.25, 2000, 200);
        $this->addRun($a['tenant'], 'suggest:a2', '2026-10-31 23:59:59.999', 0.5);
        $this->addRun($a['tenant'], 'suggest:a3', '2026-11-01 00:00:00.000', 4.0); // next month
        $this->addRun($b['tenant'], 'suggest:b1', '2026-10-10 12:00:00.000', 3.0); // another tenant

        $this->travelTo(CarbonImmutable::parse('2026-10-20 12:00', 'UTC'));
        $this->usage($a['tenant'])->assertOk()
            ->assertJsonPath('data.copilot.runs', 2)
            ->assertJsonPath('data.copilot.spent_usd', 0.75)
            ->assertJsonPath('data.copilot.input_tokens', 3000)
            ->assertJsonPath('data.copilot.cap_usd', 10)
            ->assertJsonPath('data.assistant.runs', 0);
        $this->usage($b['tenant'])->assertOk()->assertJsonPath('data.copilot.spent_usd', 3);

        // A platform admin sees the tenant the host resolves, never a sum across tenants.
        $this->usage($a['tenant'], RoleCode::SUPER_ADMIN)->assertOk()->assertJsonPath('data.copilot.spent_usd', 0.75);
    }
}
