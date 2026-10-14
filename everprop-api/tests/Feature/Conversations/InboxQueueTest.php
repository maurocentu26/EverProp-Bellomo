<?php

namespace Tests\Feature\Conversations;

use App\Domain\AgentRuntime\Llm\LlmClient;
use App\Domain\Identity\Enums\RoleCode;
use App\Domain\Tenancy\Models\Tenant;
use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Tests\Feature\AgentRuntime\ScriptedLlm;
use Tests\TestCase;

/**
 * EVP-15: the "waiting" queue puts the oldest wait first and marks what arrived outside business hours, and the
 * thread shows what the assistant gathered before handing off. Rows are committed (the agent flow needs it) and
 * cleaned up.
 */
final class InboxQueueTest extends TestCase
{
    use ConversationTestSupport;

    /** Weekdays 9–18, tenant clock America/Argentina/Salta (UTC−3). 2026-10-10 is a Saturday. */
    private const WEEK = ['mon' => [['09:00', '18:00']], 'tue' => [['09:00', '18:00']], 'wed' => [['09:00', '18:00']],
        'thu' => [['09:00', '18:00']], 'fri' => [['09:00', '18:00']], 'sat' => [], 'sun' => []];

    /** @var list<int> */
    private array $tenants = [];

    /** @var array<string, string> conversation public id => visitor token */
    private array $tokens = [];

    protected function setUp(): void
    {
        parent::setUp();
        config(['conversations.web_rate_limit_per_minute' => 10_000, 'conversations.ai_enabled' => false]);
    }

    protected function tearDown(): void
    {
        $this->deleteSyntheticTenants($this->tenants);
        parent::tearDown();
    }

    /** @return array{tenant: Tenant, widget: string} */
    private function tenant(bool $ai = false): array
    {
        ['tenant' => $tenant, 'integration' => $integration] = $this->tenantWithIntegration('WEB');
        $this->tenants[] = (int) $tenant->id;
        $tenant->update(['timezone' => 'America/Argentina/Salta',
            'settings_json' => ['conversations' => ['business_hours' => self::WEEK, 'ai_enabled' => $ai]]]);
        DB::table('pipeline_stages')->insert(['tenant_id' => $tenant->id, 'code' => 'NEW', 'name' => 'New', 'category' => 'OPEN', 'position' => 1, 'is_active' => true]);

        return ['tenant' => $tenant, 'widget' => $this->webChannel($tenant->id, $integration)['public_id']];
    }

    private function at(string $local): void
    {
        $this->travelTo(CarbonImmutable::parse($local, 'America/Argentina/Salta'));
    }

    /**
     * New web visitor writing $text now; returns the conversation public id.
     *
     * @param  array{tenant: Tenant, widget: string}  $t
     */
    private function visitor(array $t, string $text): string
    {
        $token = (string) $this->withHeaders($this->tenantHeaders($t['tenant']))
            ->postJson('/api/v1/public/chat/sessions', ['widget_id' => $t['widget']])->assertCreated()->json('data.token');
        $this->withToken($token)->postJson('/api/v1/public/chat/messages', ['client_message_id' => (string) Str::uuid(), 'text' => $text])->assertCreated();
        $this->flushHeaders();

        $id = (string) DB::table('conversations')->where('tenant_id', $t['tenant']->id)->orderByDesc('id')->value('public_id');
        $this->tokens[$id] = $token;

        return $id;
    }

    /** @return list<array<string, mixed>> */
    private function list(Tenant $tenant, string $query = ''): array
    {
        $rows = $this->actingAs($this->user($tenant, RoleCode::TENANT_ADMIN))->withHeaders($this->tenantHeaders($tenant))
            ->getJson('/api/v1/admin/conversations'.$query)->assertOk()->json('data');
        $this->flushHeaders();

        return $rows;
    }

    public function test_the_waiting_queue_puts_the_oldest_wait_first_and_marks_what_arrived_out_of_hours(): void
    {
        $t = $this->tenant();
        $this->at('2026-10-10 14:00'); // Saturday: closed
        $night = $this->visitor($t, 'consulta del sábado');
        $this->at('2026-10-12 10:00'); // Monday: open
        $morning = $this->visitor($t, 'consulta del lunes');

        $queue = $this->list($t['tenant'], '?state=WAITING_HUMAN');
        $this->assertSame([$night, $morning], array_column($queue, 'id'), 'oldest wait first');
        $this->assertTrue($queue[0]['out_of_hours']);
        $this->assertSame(CarbonImmutable::parse('2026-10-10 14:00', 'America/Argentina/Salta')->utc()->toISOString(), $queue[0]['waiting_since']);
        $this->assertFalse($queue[1]['out_of_hours']);

        // The general view keeps its order (latest activity first).
        $this->assertSame([$morning, $night], array_column($this->list($t['tenant']), 'id'));
    }

    public function test_a_reopened_conversation_waits_from_the_new_message_not_the_answered_one(): void
    {
        $t = $this->tenant();
        $this->at('2026-10-09 17:30'); // Friday, open
        $id = $this->visitor($t, 'hola');
        $advisor = $this->user($t['tenant'], RoleCode::SALES_ADVISOR);
        $as = fn () => $this->actingAs($advisor)->withHeaders($this->tenantHeaders($t['tenant']));
        $as()->postJson("/api/v1/admin/conversations/{$id}/takeover")->assertOk();
        $as()->postJson("/api/v1/admin/conversations/{$id}/messages", ['text' => 'Hola, te ayudo', 'idempotency_key' => (string) Str::uuid()])->assertSuccessful();
        $as()->postJson("/api/v1/admin/conversations/{$id}/close")->assertOk();
        $this->flushHeaders();

        $this->at('2026-10-09 19:00'); // closed: the same visitor writes again and the conversation reopens
        $this->withHeaders($this->tenantHeaders($t['tenant']))->withToken($this->tokens[$id])
            ->postJson('/api/v1/public/chat/messages', ['client_message_id' => (string) Str::uuid(), 'text' => 'volví'])->assertCreated();
        $this->flushHeaders();

        $row = $this->list($t['tenant'], '?state=WAITING_HUMAN')[0];
        $this->assertSame($id, $row['id']);
        $this->assertSame(CarbonImmutable::parse('2026-10-09 19:00', 'America/Argentina/Salta')->utc()->toISOString(), $row['waiting_since'], 'the answered 17:30 message does not count');
        $this->assertTrue($row['out_of_hours']);
    }

    public function test_the_thread_shows_the_assistant_summary_and_only_to_its_tenant(): void
    {
        config(['conversations.ai_enabled' => true]);
        $t = $this->tenant(ai: true);
        $this->app->instance(LlmClient::class, new ScriptedLlm([
            ScriptedLlm::tool('derivar_a_asesor', ['reason' => 'USER_REQUEST', 'summary' => 'Quiere financiación del 12A; tel 3885550101'], 'Te paso.'),
            ScriptedLlm::text('Te paso con un asesor.'),
        ]));
        $this->at('2026-10-10 14:00');
        $id = $this->visitor($t, 'quiero hablar con alguien, mi tel es 3885550101');

        $thread = $this->actingAs($this->user($t['tenant'], RoleCode::SALES_ADVISOR))->withHeaders($this->tenantHeaders($t['tenant']))
            ->getJson("/api/v1/admin/conversations/{$id}/messages")->assertOk();
        $thread->assertJsonPath('conversation.state', 'WAITING_HUMAN')
            ->assertJsonPath('conversation.handoff.reason', 'USER_REQUEST')
            ->assertJsonPath('conversation.handoff.summary', 'Quiere financiación del 12A; tel 3885550101');
        $this->assertTrue($this->list($t['tenant'], '?state=WAITING_HUMAN')[0]['out_of_hours']);
        $this->flushHeaders();

        // Another tenant: the conversation does not exist for it and its queue is empty.
        $other = $this->tenant();
        $this->actingAs($this->user($other['tenant'], RoleCode::TENANT_ADMIN))->withHeaders($this->tenantHeaders($other['tenant']))
            ->getJson("/api/v1/admin/conversations/{$id}/messages")->assertNotFound();
        $this->flushHeaders();
        $this->assertSame([], $this->list($other['tenant'], '?state=WAITING_HUMAN'));
    }
}
