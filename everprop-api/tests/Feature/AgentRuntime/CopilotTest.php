<?php

namespace Tests\Feature\AgentRuntime;

use App\Console\Commands\ConversationKpis;
use App\Domain\AgentRuntime\Coordinator\AgentCoordinator;
use App\Domain\AgentRuntime\Llm\LlmClient;
use App\Domain\Conversations\Services\ConversationControl;
use App\Domain\Identity\Enums\RoleCode;
use App\Domain\Tenancy\Models\Tenant;
use App\Models\User;
use Illuminate\Http\Response;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Illuminate\Testing\TestResponse;
use Tests\Feature\Conversations\ConversationTestSupport;
use Tests\TestCase;

/**
 * Copilot: the advisor in control asks for a draft. Nothing reaches the client, nothing changes in the
 * conversation, and the draft can only read. Commits (like AgentTurnTest); synthetic tenants removed in tearDown.
 */
final class CopilotTest extends TestCase
{
    use ConversationTestSupport;

    /** @var list<int> */
    private array $tenants = [];

    protected function setUp(): void
    {
        parent::setUp();
        config(['conversations.web_rate_limit_per_minute' => 10_000, 'conversations.ai_enabled' => false,
            'conversations.copilot_enabled' => true, 'agent.llm_provider' => 'anthropic']);
    }

    protected function tearDown(): void
    {
        $this->deleteSyntheticTenants($this->tenants);
        parent::tearDown();
    }

    /** @return array{tenant: Tenant, conversation: string, id: int, advisor: User, property: string} */
    private function inControl(): array
    {
        ['tenant' => $tenant, 'integration' => $integration] = $this->tenantWithIntegration('WEB');
        $this->tenants[] = (int) $tenant->id;
        $property = (string) Str::uuid();
        DB::table('properties')->insert(['tenant_id' => $tenant->id, 'public_id' => $property, 'code' => 'L-101', 'title' => 'Lote L-101',
            'operation' => 'SALE', 'category' => 'LOT', 'status' => 'AVAILABLE', 'price' => '85000.00', 'currency_code' => 'USD',
            'city' => 'San Salvador de Jujuy', 'province' => 'Jujuy']);
        $widget = $this->webChannel($tenant->id, $integration);
        $token = (string) $this->withHeaders($this->tenantHeaders($tenant))
            ->postJson('/api/v1/public/chat/sessions', ['widget_id' => $widget['public_id']])->json('data.token');
        $this->withToken($token)->postJson('/api/v1/public/chat/messages', ['client_message_id' => (string) Str::uuid(), 'text' => '¿Cuánto sale el L-101?'])->assertCreated();
        $this->flushHeaders();
        $conversation = (string) DB::table('conversations')->where('tenant_id', $tenant->id)->value('public_id');
        $advisor = $this->user($tenant, RoleCode::SALES_ADVISOR);
        // Service, not HTTP: an acting user would leak into the next fixture's visitor requests.
        $this->assertSame('HUMAN_ACTIVE', app(ConversationControl::class)->takeover((int) $tenant->id,
            (int) DB::table('conversations')->where('public_id', $conversation)->value('id'), $advisor)['state']);

        return ['tenant' => $tenant, 'conversation' => $conversation, 'advisor' => $advisor, 'property' => $property,
            'id' => (int) DB::table('conversations')->where('public_id', $conversation)->value('id')];
    }

    /** @return TestResponse<Response> */
    private function suggest(User $user, Tenant $tenant, string $conversation): TestResponse
    {
        return $this->actingAs($user)->withHeaders($this->tenantHeaders($tenant))->postJson("/api/v1/admin/conversations/$conversation/suggestion");
    }

    /** @param list<\Closure> $steps */
    private function llm(array $steps): ScriptedLlm
    {
        $llm = new ScriptedLlm($steps);
        $this->app->instance(LlmClient::class, $llm);

        return $llm;
    }

    /** @param array<string, mixed> $f
     * @return array<string, mixed> */
    private function snapshot(array $f): array
    {
        return [
            'conversation' => (array) DB::table('conversations')->where('id', $f['id'])->first(['control_state', 'control_epoch', 'controlled_by_user_id', 'last_activity_at']),
            'messages' => DB::table('messages')->where('conversation_id', $f['id'])->count(),
            'jobs' => DB::table('outbound_jobs')->where('tenant_id', $f['tenant']->id)->count(),
            'leads' => DB::table('lead_properties')->where('tenant_id', $f['tenant']->id)->count(),
            'active_bot_sessions' => DB::table('chatbot_sessions')->where('conversation_id', $f['id'])->where('status', 'ACTIVE')->count(),
        ];
    }

    public function test_the_draft_reads_live_inventory_and_nothing_reaches_the_client(): void
    {
        $f = $this->inControl();
        $this->actingAs($f['advisor'])->withHeaders($this->tenantHeaders($f['tenant']))->postJson("/api/v1/admin/conversations/{$f['conversation']}/notes",
            ['text' => 'CANARIO-NOTA-7731: cliente difícil', 'idempotency_key' => 'copilot-note-0000001'])->assertCreated();
        $before = $this->snapshot($f);
        $llm = $this->llm([
            ScriptedLlm::tool('buscar_propiedades', ['unit_code' => 'L-101']),
            ScriptedLlm::text('El lote L-101 está disponible y sale USD 85.000. ¿Querés que te pase más info?'),
        ]);

        $draft = $this->suggest($f['advisor'], $f['tenant'], $f['conversation'])->assertOk()
            ->assertJsonPath('data.text', 'El lote L-101 está disponible y sale USD 85.000. ¿Querés que te pase más info?');

        $this->assertSame($before, $this->snapshot($f), 'a draft sends, queues and changes nothing');
        $this->assertSame(AgentCoordinator::COPILOT_TOOLS, $llm->calls[0]['tools'], 'only read-only tools are offered');
        $this->assertStringContainsString('Modo borrador', $llm->calls[0]['system']);
        $this->assertStringNotContainsString('CANARIO-NOTA-7731', json_encode($llm->calls, JSON_UNESCAPED_UNICODE), 'internal notes never reach the model');
        $run = DB::table('chatbot_runs')->where('tenant_id', $f['tenant']->id)->sole();
        $this->assertSame(['suggest:'.$draft->json('data.suggestion_id'), 'SUCCEEDED', 'COPILOT'],
            [$run->provider_run_id, $run->status, json_decode((string) $run->trace_json, true)['mode']]);
        $this->assertSame(2, DB::table('usage_ledger')->where('tenant_id', $f['tenant']->id)->where('status', 'COMMITTED')->count(), 'every call is in the budget');

        // The advisor sends it as is: the run records the acceptance and points to the sent message.
        $this->actingAs($f['advisor'])->withHeaders($this->tenantHeaders($f['tenant']))->postJson("/api/v1/admin/conversations/{$f['conversation']}/messages", [
            'text' => $draft->json('data.text'), 'idempotency_key' => 'copilot-reply-000001', 'suggestion_id' => $draft->json('data.suggestion_id'),
        ])->assertStatus(202);
        $run = DB::table('chatbot_runs')->where('id', $run->id)->first();
        $this->assertSame('SENT_AS_IS', json_decode((string) $run->trace_json, true)['advisor']);
        $this->assertSame(['drafts' => 1, 'blocked' => 0, 'sent_as_is' => 1, 'sent_edited' => 0],
            app(ConversationKpis::class)->compute((int) $f['tenant']->id, now()->subDay()->toImmutable(), now()->addDay()->toImmutable())['copilot']);
        $this->assertSame((int) DB::table('messages')->where('conversation_id', $f['id'])->where('direction', 'OUTBOUND')->value('id'), (int) $run->output_message_id);
    }

    public function test_the_server_decides_if_a_draft_was_edited_and_only_for_this_conversation(): void
    {
        $f = $this->inControl();
        $g = $this->inControl();
        $this->llm([ScriptedLlm::text('Hola, sí, el L-101 sigue disponible.'), ScriptedLlm::text('Hola, sí, el L-101 sigue disponible.')]);
        $mine = $this->suggest($f['advisor'], $f['tenant'], $f['conversation'])->assertOk()->json('data.suggestion_id');
        $theirs = $this->suggest($g['advisor'], $g['tenant'], $g['conversation'])->assertOk()->json('data.suggestion_id');
        $reply = fn (string $text, string $suggestion, string $key) => $this->actingAs($f['advisor'])->withHeaders($this->tenantHeaders($f['tenant']))
            ->postJson("/api/v1/admin/conversations/{$f['conversation']}/messages", ['text' => $text, 'idempotency_key' => $key, 'suggestion_id' => $suggestion])->assertStatus(202);
        $advisor = fn (string $suggestion) => json_decode((string) DB::table('chatbot_runs')->where('provider_run_id', 'suggest:'.$suggestion)->value('trace_json'), true)['advisor'] ?? null;

        $reply('Hola, sí. Te mando fotos del L-101 ahora.', $mine, 'copilot-reply-000010');
        $reply('Otro texto cualquiera', $theirs, 'copilot-reply-000011');

        $this->assertSame('SENT_EDITED', $advisor($mine), 'judged by the server, whatever the client claims');
        $this->assertNull($advisor($theirs), "another conversation's draft is untouched");
        $this->assertArrayNotHasKey('text', json_decode((string) DB::table('chatbot_runs')->where('provider_run_id', 'suggest:'.$mine)->value('trace_json'), true));
    }

    public function test_the_draft_cannot_register_interest_request_visits_or_hand_off(): void
    {
        $f = $this->inControl();
        $before = $this->snapshot($f);
        $llm = $this->llm([
            ScriptedLlm::tool('registrar_interes', ['unit_code' => 'L-101', 'interest_level' => 'HIGH', 'contact_phone' => '+54 9 388 555-1234']),
        ]);

        $this->suggest($f['advisor'], $f['tenant'], $f['conversation'])->assertStatus(422)
            ->assertJsonPath('error.code', 'ACTION_NEEDED')->assertJsonPath('error.action', 'registrar_interes');
        $this->assertCount(1, $llm->calls, 'no second (billable) call that could pretend the action was done');

        $this->assertSame($before, $this->snapshot($f));
        $trace = json_decode((string) DB::table('chatbot_runs')->where('tenant_id', $f['tenant']->id)->value('trace_json'), true);
        $this->assertSame('FORBIDDEN', $trace['tools'][0]['code']);
        $this->assertSame(0, DB::table('tool_executions')->where('tenant_id', $f['tenant']->id)->count());

        // And a draft that claims an action anyway is refused.
        $this->llm([ScriptedLlm::text('Listo, ya anoté tu interés en el L-101 y un asesor te llama.')]);
        $this->suggest($f['advisor'], $f['tenant'], $f['conversation'])->assertStatus(422)->assertJsonPath('error.code', 'UNSAFE_DRAFT');
        $this->assertSame($before, $this->snapshot($f));
    }

    public function test_drafts_are_capped_per_customer_message(): void
    {
        $f = $this->inControl();
        $this->llm(array_fill(0, 3, ScriptedLlm::text('Hola, sí, está disponible.')));
        foreach (range(1, 3) as $_) {
            $this->suggest($f['advisor'], $f['tenant'], $f['conversation'])->assertOk();
        }
        $this->suggest($f['advisor'], $f['tenant'], $f['conversation'])->assertStatus(429)->assertJsonPath('error.code', 'TOO_MANY_DRAFTS');
    }

    public function test_unsafe_or_unavailable_drafts_are_refused_and_only_the_controller_can_ask(): void
    {
        $f = $this->inControl();
        $this->llm([ScriptedLlm::text('Te lo dejo en USD 50.000 si cerrás hoy.')]);
        $this->suggest($f['advisor'], $f['tenant'], $f['conversation'])->assertStatus(422)->assertJsonPath('error.code', 'UNSAFE_DRAFT');
        $this->assertSame('BLOCK', DB::table('chatbot_runs')->where('tenant_id', $f['tenant']->id)->value('decision'));

        $llm = $this->llm([]);
        config(['conversations.copilot_enabled' => false]);
        $this->suggest($f['advisor'], $f['tenant'], $f['conversation'])->assertStatus(409)->assertJsonPath('error.code', 'COPILOT_DISABLED');
        config(['conversations.copilot_enabled' => true]);
        $this->suggest($this->user($f['tenant'], RoleCode::SALES_ADVISOR), $f['tenant'], $f['conversation'])->assertNotFound(); // assigned to someone else
        $this->suggest($this->user($f['tenant'], RoleCode::READ_ONLY), $f['tenant'], $f['conversation'])->assertForbidden();
        ['tenant' => $other] = $this->tenantWithIntegration('WEB');
        $this->tenants[] = (int) $other->id;
        $this->suggest($this->user($other, RoleCode::TENANT_ADMIN), $other, $f['conversation'])->assertNotFound();
        $manager = $this->user($f['tenant'], RoleCode::SALES_MANAGER);
        $this->suggest($manager, $f['tenant'], $f['conversation'])->assertStatus(409)->assertJsonPath('error.code', 'NOT_IN_CONTROL'); // the advisor has it
        DB::table('conversations')->where('id', $f['id'])->update(['control_state' => 'WAITING_HUMAN']);
        $this->suggest($f['advisor'], $f['tenant'], $f['conversation'])->assertStatus(409)->assertJsonPath('error.code', 'NOT_IN_CONTROL');
        $this->assertSame([], $llm->calls, 'refusals never call the model');
    }

    public function test_a_stuck_draft_never_hands_the_conversation_off(): void
    {
        $f = $this->inControl();
        $this->llm([ScriptedLlm::text('Hola, sí, está disponible.')]);
        $this->suggest($f['advisor'], $f['tenant'], $f['conversation'])->assertOk();
        DB::table('chatbot_runs')->where('tenant_id', $f['tenant']->id)->update(['status' => 'STARTED', 'started_at' => now()->subMinutes(10)]);

        $this->artisan('everprop:conversations:reconcile')->assertSuccessful();

        $this->assertSame(['FAILED', 'IGNORE'], array_values((array) DB::table('chatbot_runs')->where('tenant_id', $f['tenant']->id)->first(['status', 'decision'])));
        $this->assertSame('HUMAN_ACTIVE', DB::table('conversations')->where('id', $f['id'])->value('control_state'));
        $this->assertSame(0, DB::table('outbound_jobs')->where('tenant_id', $f['tenant']->id)->count());
    }
}
