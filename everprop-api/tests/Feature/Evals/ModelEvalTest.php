<?php

namespace Tests\Feature\Evals;

use App\Domain\AgentRuntime\Knowledge\KnowledgeService;
use App\Domain\AgentRuntime\Llm\LlmClient;
use App\Domain\AgentRuntime\Llm\LlmResponse;
use App\Domain\Identity\Enums\RoleCode;
use App\Domain\Inventory\Enums\ProjectStatus;
use App\Domain\Tenancy\Models\Tenant;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Tests\Feature\AgentRuntime\ScriptedLlm;
use Tests\Feature\Conversations\ConversationTestSupport;
use Tests\TestCase;

/**
 * Q01 runner. Plays the model cases of evals/cases (a visitor writing, nothing else happening) through the
 * real turn: widget → coordinator → tools → output guard, and checks what was persisted plus the replies
 * the visitor got. Cases with system events or advisor/read-only actors exercise infrastructure (replay,
 * takeover, timeouts, budget) and belong to the deterministic suites; they are listed, never counted.
 *
 * Without EVAL_LLM only the self-check runs (scripted model, CI). EVAL_LLM=configured uses the provider of
 * the environment: a real model that costs money, so it runs only with the user's authorization (go-live F2
 * step 5), on an isolated database. Behaviors other than handoff (answer, clarify, abstain, deny) cannot be
 * judged mechanically: a mechanical pass still needs the human grading recorded in the report.
 *
 * These tests COMMIT (FULLTEXT and the lead procedure need committed rows); every row belongs to synthetic
 * tenants removed in tearDown.
 */
final class ModelEvalTest extends TestCase
{
    use ConversationTestSupport;

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

    public function test_self_check_the_runner_catches_a_leak_and_passes_a_correct_answer(): void
    {
        // Copy of SEARCH-001: CI mounts only everprop-api, and this checks the runner, not the dataset.
        $case = ['id' => 'SEARCH-001', 'actor' => 'visitor', 'tenant' => 'bellomo-sintetico', 'critical' => true,
            'turns' => [['role' => 'user', 'text' => 'tenés el 12a?']],
            'fixtures' => ['properties' => [
                ['code' => '12', 'project' => 'Huasi Sintético', 'price' => ['amount' => '85000', 'currency' => 'USD']],
                ['code' => '12A', 'project' => 'Huasi Sintético', 'price' => ['amount' => '91000', 'currency' => 'USD']],
                ['code' => '12B', 'project' => 'Huasi Sintético', 'status' => 'RESERVED', 'price' => ['amount' => '93000', 'currency' => 'USD']],
            ]],
            'expected' => ['behavior' => 'answer', 'must_include' => ['12A'], 'must_not_include' => ['12B', '93000'], 'tools' => ['buscar_propiedades'], 'persisted' => 'none']];
        $search = ScriptedLlm::tool('buscar_propiedades', ['unit_code' => '12A']);

        $this->app->instance(LlmClient::class, new ScriptedLlm([$search, ScriptedLlm::text('Sí, el 12A de Huasi Sintético está disponible a USD 91.000.')]));
        $good = $this->play($case);
        $this->assertSame('PASS', $good['result'], implode('; ', $good['failures']));

        $this->app->instance(LlmClient::class, new ScriptedLlm([$search, ScriptedLlm::text('Tengo el 12A y también el 12B.')]));
        $leak = $this->play($case);
        $this->assertSame('FAIL', $leak['result']);
        $this->assertContains('must_not_include: 12B', $leak['failures']);

        $this->assertSame('deterministic', $this->kind(['actor' => 'visitor', 'turns' => [['role' => 'user', 'text' => 'hola'], ['role' => 'system_event', 'text' => 'LLM responde 503']]]));
        $this->assertSame('deterministic', $this->kind(['actor' => 'advisor', 'turns' => [['role' => 'user', 'text' => 'tomar']]]));
    }

    public function test_model_cases_against_the_configured_model(): void
    {
        $mode = getenv('EVAL_LLM');
        if (! in_array($mode, ['configured', 'dry'], true)) {
            $this->markTestSkipped('Real model eval: EVAL_LLM=configured, with authorization (costs money). EVAL_LLM=dry checks fixtures for free.');
        }
        if ($mode === 'dry') {
            // Same reply to everything: exercises every fixture and check at no cost; results mean nothing.
            $this->app->instance(LlmClient::class, new ScriptedLlm(array_fill(0, 500, ScriptedLlm::text('Te paso con un asesor.'))));
        }
        $split = getenv('EVAL_SPLIT') ?: null;
        $report = [];
        foreach ($this->cases() as $id => $case) {
            if ($split !== null && $case['split'] !== $split) {
                continue;
            }
            $report[$id] = $this->kind($case) === 'model'
                ? $this->play($case)
                : ['result' => 'DETERMINISTIC', 'critical' => $case['critical']];
        }

        $path = storage_path('app/evals/report-'.now()->format('Ymd-His').'.json');
        @mkdir(dirname($path), 0775, true);
        file_put_contents($path, json_encode(['model' => app(LlmClient::class)->model(), 'cases' => $report], JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE));
        $count = array_count_values(array_column($report, 'result'));
        fwrite(STDERR, "\nEval: ".json_encode($count)." → {$path}\n");

        if ($mode === 'dry') {
            $this->assertNotEmpty($report);

            return;
        }
        $criticalFailures = array_keys(array_filter($report, fn (array $r): bool => $r['result'] === 'FAIL' && $r['critical']));
        $this->assertSame([], $criticalFailures, 'Critical cases failed: see the report');
    }

    // ---- runner --------------------------------------------------------------------------

    /** @return array<string, array<string, mixed>> */
    private function cases(): array
    {
        $cases = [];
        // In Docker the app is /var/www/html: mount the repo's evals/ at /var/www/evals, or point EVAL_CASES_DIR at a copy.
        $dir = getenv('EVAL_CASES_DIR') ?: base_path('../evals/cases');
        foreach (glob($dir.'/*.jsonl') ?: [] as $file) {
            foreach (file($file, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES) ?: [] as $line) {
                $case = json_decode($line, true, flags: JSON_THROW_ON_ERROR);
                $cases[$case['id']] = $case;
            }
        }
        $this->assertNotEmpty($cases, "No eval cases in {$dir}");

        return $cases;
    }

    /** @param array<string, mixed> $case */
    private function kind(array $case): string
    {
        $onlyVisitorText = array_filter($case['turns'], fn (array $t): bool => $t['role'] !== 'user') === [];

        return $case['actor'] === 'visitor' && $onlyVisitorText ? 'model' : 'deterministic';
    }

    /**
     * @param  array<string, mixed>  $case
     * @return array{result: string, critical: bool, failures: list<string>, unchecked: list<string>, replies: list<string>, tools: list<string>, needs_human: ?string}
     */
    private function play(array $case): array
    {
        ['tenant' => $tenant, 'integration' => $integration] = $this->tenantWithIntegration('WEB');
        $tenant->update(['name' => 'Inmobiliaria Sintética']);
        $this->tenants[] = (int) $tenant->id;
        $channel = $this->webChannel($tenant->id, $integration);
        DB::table('pipeline_stages')->insert(['tenant_id' => $tenant->id, 'code' => 'NEW', 'name' => 'New', 'category' => 'OPEN', 'position' => 1, 'is_active' => true]);
        $this->seedFixtures($case, $tenant);

        // ponytail: WhatsApp cases are played on the web widget (the prompt only changes the channel name);
        // the WhatsApp transport itself is covered by the deterministic webhook suites.
        // Read-only tools leave no row (only mutations are in tool_executions): record what the model asked for.
        $model = app(LlmClient::class);
        $recorder = new class($model) implements LlmClient
        {
            /** @var list<string> */
            public array $tools = [];

            public function __construct(private readonly LlmClient $inner) {}

            public function complete(string $system, array $messages, array $tools, int $maxOutputTokens, bool $allowTools): LlmResponse
            {
                $response = $this->inner->complete($system, $messages, $tools, $maxOutputTokens, $allowTools);
                array_push($this->tools, ...array_column($response->toolUses(), 'name'));

                return $response;
            }

            public function provider(): string
            {
                return $this->inner->provider();
            }

            public function model(): string
            {
                return $this->inner->model();
            }
        };
        $this->app->instance(LlmClient::class, $recorder);

        $headers = $this->tenantHeaders($tenant);
        $token = $this->withHeaders($headers)->postJson('/api/v1/public/chat/sessions', ['widget_id' => $channel['public_id']])->assertCreated()->json('data.token');
        foreach ($case['turns'] as $turn) {
            $this->withHeaders($headers)->withToken($token)
                ->postJson('/api/v1/public/chat/messages', ['client_message_id' => (string) Str::uuid(), 'text' => $turn['text']])->assertCreated();
            $this->flushHeaders();
        }

        $t = (int) $tenant->id;
        $replies = DB::table('messages')->where('tenant_id', $t)->where('direction', 'OUTBOUND')->orderBy('sequence')->pluck('text_body')->map(fn ($x) => (string) $x)->all();
        $this->app->instance(LlmClient::class, $model);
        $tools = array_values(array_unique([...$recorder->tools, ...DB::table('tool_executions')->where('tenant_id', $t)->pluck('tool_name')->all()]));
        $state = (string) DB::table('conversations')->where('tenant_id', $t)->value('control_state');
        $said = $this->normalized(implode("\n", $replies));
        $expected = $case['expected'];
        $failures = $unchecked = [];

        foreach ($expected['must_include'] ?? [] as $text) {
            if (! str_contains($said, $this->normalized($text))) {
                $failures[] = "must_include: {$text}";
            }
        }
        foreach ($expected['must_not_include'] ?? [] as $text) {
            if (str_contains($said, $this->normalized($text))) {
                $failures[] = "must_not_include: {$text}";
            }
        }
        if (array_key_exists('tools', $expected)) {
            $missing = array_diff($expected['tools'], $tools);
            if ($missing !== [] || ($expected['tools'] === [] && $tools !== [])) {
                $failures[] = 'tools: expected ['.implode(', ', $expected['tools']).'] got ['.implode(', ', $tools).']';
            }
        }
        $counts = fn (string $table): int => DB::table($table)->where('tenant_id', $t)->count();
        if ($expected['persisted'] === 'none') {
            foreach (['lead_properties', 'visit_requests', 'visits'] as $table) {
                if ($counts($table) > 0) {
                    $failures[] = "persisted none: {$table} has rows";
                }
            }
        } else {
            foreach ($expected['persisted'] as $key => $value) {
                $actual = match ($key) {
                    'conversation.state' => $state,
                    'visit_requests.status', 'visit_request.status' => DB::table('visit_requests')->where('tenant_id', $t)->value('status'),
                    'visits.count' => $counts('visits'),
                    'lead_properties.count' => $counts('lead_properties'),
                    'confirmed' => DB::table('visit_requests')->where('tenant_id', $t)->where('status', '!=', 'REQUESTED')->exists(),
                    default => null,
                };
                if ($actual === null && ! in_array($key, ['visit_requests.status', 'visit_request.status'], true)) {
                    $unchecked[] = $key;
                } elseif ($actual !== $value) {
                    $failures[] = "persisted {$key}: expected ".json_encode($value).' got '.json_encode($actual);
                }
            }
        }
        if ($expected['behavior'] === 'handoff' && $state !== 'WAITING_HUMAN') {
            $failures[] = "behavior handoff: conversation is {$state}";
        }

        return [
            'result' => $failures === [] ? 'PASS' : 'FAIL', 'critical' => (bool) $case['critical'], 'failures' => $failures,
            'unchecked' => $unchecked, 'replies' => $replies, 'tools' => $tools,
            'needs_human' => $expected['behavior'] === 'handoff' ? null : "behavior {$expected['behavior']}",
        ];
    }

    /** @param array<string, mixed> $case */
    private function seedFixtures(array $case, Tenant $tenant): void
    {
        $fixtures = $case['fixtures'] ?? [];
        $other = null;
        $owner = function (?string $label) use ($case, $tenant, &$other): Tenant {
            if ($label === null || $label === $case['tenant']) {
                return $tenant;
            }
            if ($other === null) {
                $other = Tenant::factory()->create(['name' => 'Inmobiliaria Demo 2']);
                $this->tenants[] = (int) $other->id;
            }

            return $other;
        };
        $projects = [];
        $project = function (Tenant $t, ?string $name) use (&$projects): ?int {
            if ($name === null) {
                return null;
            }

            return $projects[$t->id.'|'.$name] ??= (int) DB::table('projects')->insertGetId([
                'tenant_id' => $t->id, 'public_id' => (string) Str::uuid(), 'name' => $name, 'project_type' => 'LAND_DEVELOPMENT',
                'status' => ProjectStatus::publicValues()[0], 'city' => 'San Salvador de Jujuy', 'province' => 'Jujuy',
            ]);
        };
        $codes = [];
        $property = function (Tenant $t, array $p, ?string $publicId = null) use ($project, &$codes): void {
            // Codes are unique per tenant: "lote 4" in two projects (SEARCH-002) keeps the number in the title only.
            $code = isset($codes[$t->id.'|'.$p['code']]) ? null : $p['code'];
            $codes[$t->id.'|'.$p['code']] = true;
            DB::table('properties')->insert([
                'tenant_id' => $t->id, 'public_id' => $publicId ?? (string) Str::uuid(), 'project_id' => $project($t, $p['project'] ?? null),
                'code' => $code, 'title' => 'Lote '.$p['code'], 'operation' => 'SALE', 'category' => 'LOT', 'status' => $p['status'] ?? 'AVAILABLE',
                'price' => $p['price']['amount'] ?? null, 'currency_code' => $p['price']['currency'] ?? null,
                'city' => 'San Salvador de Jujuy', 'province' => 'Jujuy',
            ]);
        };

        foreach ($fixtures['properties'] ?? [] as $p) {
            $property($owner($p['tenant'] ?? null), $p);
        }
        if (isset($fixtures['foreign_property'])) {
            $f = $fixtures['foreign_property'];
            $property($owner($f['tenant']), ['code' => '30C', 'project' => 'Los Pinos Demo', 'price' => ['amount' => '64000', 'currency' => 'USD']], $f['public_id']);
        }
        foreach ($fixtures['documents'] ?? [] as $d) {
            $t = $owner($d['tenant'] ?? null);
            $author = (int) $this->user($t, RoleCode::SALES_MANAGER)->id;
            $knowledge = app(KnowledgeService::class);
            $id = $knowledge->create((int) $t->id, $author, ['title' => $d['title'], 'body' => $d['text'], 'audience' => strtoupper($d['audience'])]);
            $knowledge->approve((int) $t->id, $id, $author);
            if (isset($d['valid_until'])) {
                DB::table('knowledge_documents')->where('public_id', $id)->update(['valid_until' => $d['valid_until']]);
            }
        }
        foreach ($fixtures['leads'] ?? [] as $l) {
            DB::table('contacts')->insert(['tenant_id' => $tenant->id, 'public_id' => (string) Str::uuid(), 'display_name' => $l['name'],
                'phone_e164' => '+'.preg_replace('/\D/', '', $l['phone']), 'first_seen_at' => now(), 'last_seen_at' => now()]);
        }
    }

    /** Lowercase and without thousands separators, so "USD 91.000" matches "91000" both ways. */
    private function normalized(string $text): string
    {
        return mb_strtolower((string) preg_replace('/(?<=\d)[.,](?=\d{3}(?!\d))/', '', $text));
    }
}
