<?php

namespace Tests\Feature\AgentRuntime;

use App\Domain\AgentRuntime\Coordinator\PromptBuilder;
use App\Domain\AgentRuntime\Llm\LlmClient;
use App\Domain\AgentRuntime\Llm\LlmFailure;
use App\Domain\Tenancy\Models\Tenant;
use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Tests\Feature\Conversations\ConversationTestSupport;
use Tests\TestCase;

/**
 * EVP-L10: outside business hours the assistant keeps helping, collects what an advisor needs before handing off and
 * tells the visitor, with a fixed text, when a person answers. Rows are committed (the lead SP needs it) and cleaned up.
 */
final class OutOfHoursAssistantTest extends TestCase
{
    use ConversationTestSupport;

    private const BACK = 'a partir del lunes a las 9:00';

    private const WEEK = ['mon' => [['09:00', '18:00']], 'tue' => [['09:00', '18:00']], 'wed' => [['09:00', '18:00']],
        'thu' => [['09:00', '18:00']], 'fri' => [['09:00', '18:00']], 'sat' => [], 'sun' => []];

    /** @var list<int> */
    private array $tenants = [];

    protected function setUp(): void
    {
        parent::setUp();
        config(['conversations.web_rate_limit_per_minute' => 10_000, 'conversations.ai_enabled' => true]);
    }

    protected function tearDown(): void
    {
        $this->deleteSyntheticTenants($this->tenants);
        parent::tearDown();
    }

    /**
     * @param  array<string, mixed>|null  $hours
     * @return array{tenant: Tenant, channel: array{id: int, public_id: string}, token: string}
     */
    private function chat(?array $hours, string $localNow): array
    {
        ['tenant' => $tenant, 'integration' => $integration] = $this->tenantWithIntegration('WEB');
        $this->tenants[] = (int) $tenant->id;
        $tenant->update(['timezone' => 'America/Argentina/Salta', 'settings_json' => $hours === null ? null : ['conversations' => ['business_hours' => $hours]]]);
        DB::table('pipeline_stages')->insert(['tenant_id' => $tenant->id, 'code' => 'NEW', 'name' => 'New', 'category' => 'OPEN', 'position' => 1, 'is_active' => true]);
        $channel = $this->webChannel($tenant->id, $integration);
        $this->travelTo(CarbonImmutable::parse($localNow, 'America/Argentina/Salta'));
        $token = (string) $this->withHeaders($this->tenantHeaders($tenant))
            ->postJson('/api/v1/public/chat/sessions', ['widget_id' => $channel['public_id']])->assertCreated()->json('data.token');

        return ['tenant' => $tenant, 'channel' => $channel, 'token' => $token];
    }

    /** @param array{tenant: Tenant, token: string} $chat */
    private function says(array $chat, string $text): void
    {
        $this->withHeaders($this->tenantHeaders($chat['tenant']))->withToken($chat['token'])
            ->postJson('/api/v1/public/chat/messages', ['client_message_id' => (string) Str::uuid(), 'text' => $text])->assertCreated();
        $this->flushHeaders();
    }

    /**
     * @param  array{tenant: Tenant, token: string}  $chat
     * @return list<string>
     */
    private function visible(array $chat): array
    {
        $texts = array_column($this->withHeaders($this->tenantHeaders($chat['tenant']))->withToken($chat['token'])
            ->getJson('/api/v1/public/chat/messages')->assertOk()->json('data'), 'text');
        $this->flushHeaders();

        return $texts;
    }

    /** @param list<\Closure> $steps */
    private function llm(array $steps): ScriptedLlm
    {
        $llm = new ScriptedLlm($steps);
        $this->app->instance(LlmClient::class, $llm);

        return $llm;
    }

    public function test_out_of_hours_the_assistant_knows_the_hours_and_how_to_hand_off(): void
    {
        $chat = $this->chat(self::WEEK, '2026-10-10 14:00'); // Saturday
        $llm = $this->llm([ScriptedLlm::text('Hola, ¿en qué te ayudo?')]);

        $this->says($chat, 'hola');

        $system = $llm->calls[0]['system'];
        $this->assertStringContainsString('Horario de atención del equipo: lunes a viernes de 9:00 a 18:00.', $system);
        $this->assertStringContainsString('FUERA de horario', $system);
        $this->assertStringContainsString('vuelven '.self::BACK, $system);
        $this->assertStringContainsString('pedilo antes de derivar', $system, 'on the web chat it asks for a phone or email first');
        $this->assertSame('AI_ACTIVE', DB::table('conversations')->where('tenant_id', $chat['tenant']->id)->value('control_state'), 'it keeps helping');
    }

    public function test_in_hours_or_without_hours_there_are_no_out_of_hours_rules(): void
    {
        $open = $this->chat(self::WEEK, '2026-10-12 10:00'); // Monday
        $llm = $this->llm([ScriptedLlm::text('Hola')]);
        $this->says($open, 'hola');
        $this->assertStringContainsString('Ahora el equipo está en horario.', $llm->calls[0]['system']);
        $this->assertStringNotContainsString('FUERA de horario', $llm->calls[0]['system']);

        $always = $this->chat(null, '2026-10-10 14:00');
        $llm = $this->llm([ScriptedLlm::text('Hola')]);
        $this->says($always, 'hola');
        $this->assertStringNotContainsString('Horario de atención', $llm->calls[0]['system']);

        // A copilot draft is for an advisor who is already here: never the out-of-hours rules.
        $draft = (new PromptBuilder)->system('Inmobiliaria', 'WEB_CHAT', '2026-10-10', [], true, null);
        $this->assertStringNotContainsString('Horario de atención', $draft);
    }

    public function test_out_of_hours_a_promise_of_someone_right_away_never_reaches_the_visitor(): void
    {
        $chat = $this->chat(self::WEEK, '2026-10-10 14:00');
        $this->llm([
            ScriptedLlm::tool('derivar_a_asesor', ['reason' => 'USER_REQUEST', 'summary' => 'Financiación del 12A, tel 3885550101'], 'Te paso con alguien.'),
            ScriptedLlm::text('Listo, ya te atiende Juan enseguida.'),
        ]);

        $this->says($chat, 'quiero hablar con un asesor, mi tel es 3885550101');

        $last = (string) last($this->visible($chat));
        $this->assertSame((new PromptBuilder)->guardedNotice(self::BACK), $last, 'OutputGuard rejects it and the fixed text says when');
        $this->assertSame('WAITING_HUMAN', DB::table('conversations')->where('tenant_id', $chat['tenant']->id)->value('control_state'));
    }

    public function test_out_of_hours_the_model_handoff_keeps_its_help_and_adds_when_a_person_answers(): void
    {
        $chat = $this->chat(self::WEEK, '2026-10-10 14:00');
        $this->llm([
            ScriptedLlm::tool('derivar_a_asesor', ['reason' => 'USER_REQUEST', 'summary' => 'Consulta por financiación'], 'Te paso con alguien.'),
            ScriptedLlm::text('Te paso con un asesor del equipo.'),
        ]);

        $this->says($chat, 'quiero hablar con un asesor, mi tel es 3885550101');

        $this->assertSame('Te paso con un asesor del equipo. '.(new PromptBuilder)->backLine(self::BACK), last($this->visible($chat)));
    }

    public function test_out_of_hours_a_normal_reply_cannot_promise_immediate_attention(): void
    {
        $chat = $this->chat(self::WEEK, '2026-10-10 14:00');
        $this->llm([ScriptedLlm::text('Un asesor te contacta a la brevedad.')]);

        $this->says($chat, 'me interesa el 12A');

        $this->assertSame((new PromptBuilder)->guardedNotice(self::BACK), last($this->visible($chat)));
    }

    public function test_in_hours_the_model_goodbye_stays(): void
    {
        $chat = $this->chat(self::WEEK, '2026-10-12 10:00');
        $this->llm([
            ScriptedLlm::tool('derivar_a_asesor', ['reason' => 'USER_REQUEST', 'summary' => 'Pide asesor'], 'Te paso con alguien.'),
            ScriptedLlm::text('Te paso con un asesor, te responde por acá.'),
        ]);

        $this->says($chat, 'quiero hablar con un asesor');

        $this->assertSame('Te paso con un asesor, te responde por acá.', last($this->visible($chat)));
    }

    public function test_out_of_hours_a_failure_tells_when_a_person_answers(): void
    {
        $chat = $this->chat(self::WEEK, '2026-10-10 14:00');
        $failure = fn () => new LlmFailure('TIMEOUT', retryable: false, billable: false);
        $this->llm([$failure, $failure]);

        $this->says($chat, 'hola');

        $this->assertSame((new PromptBuilder)->unavailableNotice(self::BACK), last($this->visible($chat)));
    }
}
