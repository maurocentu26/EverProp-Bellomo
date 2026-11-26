<?php

namespace App\Domain\AgentRuntime\Coordinator;

use App\Domain\AgentRuntime\Knowledge\KnowledgeService;
use App\Domain\AgentRuntime\Llm\LlmClient;
use App\Domain\AgentRuntime\Llm\LlmFailure;
use App\Domain\AgentRuntime\Llm\LlmResponse;
use App\Domain\AgentRuntime\Tools\ContactConfirmation;
use App\Domain\AgentRuntime\Tools\ToolContext;
use App\Domain\AgentRuntime\Tools\ToolGateway;
use App\Domain\Conversations\Exceptions\ConversationConflict;
use App\Domain\Conversations\Jobs\DispatchOutboundJob;
use App\Domain\Conversations\Services\BusinessHours;
use App\Domain\Conversations\Services\ConversationControl;
use App\Domain\Conversations\Services\InboundMessageService;
use App\Domain\Usage\QuotaExceeded;
use App\Domain\Usage\UsageLedger;
use Carbon\CarbonImmutable;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Sleep;
use Illuminate\Support\Str;
use Throwable;

/**
 * S10. One AI coordinator per turn (ADR D07): answers the latest inbound message of a conversation
 * under bot control, with at most `max_llm_calls` model calls (+1 retry), closed tools, a budget
 * reservation before every call and the control epoch captured at the start. Anything it produces
 * is a proposal: ConversationControl drops it if an advisor took over meanwhile (STALE_CONTROL).
 * Any failure ends in a human handoff, never in silence and never in an invented answer.
 */
final class AgentCoordinator
{
    public const AGENT_NAME = 'Asistente Eversys';

    /** Copilot drafts only read: registering interest, visits and handoffs stay with the advisor. */
    public const COPILOT_TOOLS = ['buscar_propiedades', 'consultar_propiedad'];

    public function __construct(
        private readonly LlmClient $llm,
        private readonly ToolGateway $tools,
        private readonly KnowledgeService $knowledge,
        private readonly UsageLedger $ledger,
        private readonly ConversationControl $control,
        private readonly PromptBuilder $prompts,
        private readonly OutputGuard $guard,
    ) {}

    /** Monotonic start of the current turn or draft, and its deadline: a retry wait never pushes a call past it. */
    private float $startedAt = 0.0;

    private int $deadline = 0;

    /** @return string outcome code (for logs/tests) */
    public function handle(int $tenantId, int $conversationId, int $inputSequence): string
    {
        $this->startedAt = hrtime(true) / 1e9;
        $this->deadline = (int) config('agent.turn_deadline_seconds');
        $conversation = DB::table('conversations as c')
            ->join('channel_accounts as ca', fn ($j) => $j->on('ca.id', '=', 'c.channel_account_id')->on('ca.tenant_id', '=', 'c.tenant_id'))
            ->where('c.tenant_id', $tenantId)->where('c.id', $conversationId)
            ->first(['c.id', 'c.contact_id', 'c.channel_account_id', 'c.control_state', 'c.control_epoch', 'ca.channel_type']);
        if ($conversation === null || ! in_array($conversation->control_state, ConversationControl::BOT_STATES, true)) {
            return 'SKIPPED_NOT_BOT';
        }
        // A turn queued before the assistant was switched off must not call the model.
        if (! InboundMessageService::aiEnabled($tenantId)) {
            InboundMessageService::handOffOrphanedBotConversation($tenantId, $conversationId);

            return 'SKIPPED_AI_DISABLED';
        }
        // EVP-115: only a newer text message has its own turn (InboundMessageService); a photo or audio sent
        // right after a question must not leave the question unanswered. A message waiting longer than
        // agent.burst_max_wait_seconds is answered anyway, so a sustained burst never postpones the reply forever.
        $messages = fn () => DB::table('messages')->where('tenant_id', $tenantId)->where('conversation_id', $conversationId)->where('direction', 'INBOUND');
        $latestInbound = (int) $messages()->where('message_type', 'TEXT')->whereRaw(InboundMessageService::HAS_TEXT_SQL)->max('sequence');
        if ($latestInbound > $inputSequence && $messages()->where('sequence', $inputSequence)
            ->where('created_at', '>=', CarbonImmutable::now('UTC')->subSeconds((int) config('agent.burst_max_wait_seconds'))->format('Y-m-d H:i:s.v'))->exists()) {
            return 'SKIPPED_SUPERSEDED'; // the newer message's turn answers both
        }

        $epoch = (int) $conversation->control_epoch;
        // Errors here (no run row yet) propagate to RunAgentJob::failed(), which hands off.
        $runId = $this->startRun($tenantId, $conversationId, $epoch, $inputSequence);
        if ($runId === null) {
            return 'SKIPPED_DUPLICATE';
        }

        $context = new ToolContext($tenantId, $conversationId, (int) $conversation->contact_id, (int) $conversation->channel_account_id,
            (string) $conversation->channel_type, $runId, $epoch, $inputSequence, (string) Str::uuid());
        $trace = ['calls' => 0, 'tools' => [], 'sources' => [], 'guard' => []];
        $usage = ['input' => 0, 'output' => 0, 'micros' => 0];

        try {
            $confirmed = app(ContactConfirmation::class)->receive($context);
            if ($confirmed !== null) {
                // Consent selects the server snapshot, never a second interpretation by the model.
                $result = $this->tools->execute($context, $confirmed['tool'], $confirmed['arguments']);
                $trace['tools'][] = ['name' => $confirmed['tool'], 'ok' => $result['ok'], 'code' => $result['error']['code'] ?? null,
                    'replayed' => $result['meta']['replayed'] ?? false];
                if (! $result['ok']) {
                    return $this->failToHuman($context, $result['error']['code'], $trace, $usage);
                }
                $text = '¡Listo! Ya guardé tu consulta. Un asesor puede ayudarte a seguir con la búsqueda.';
            } else {
                $text = $this->converse($context, (string) $conversation->channel_type, $trace, $usage);
            }
            [$text, $violations] = $this->screen($text, $context, $trace);
            if ($text === '' || $violations !== []) {
                $trace['guard'] = $violations === [] ? ['EMPTY_REPLY'] : $violations;
                $context->handoff ??= ['reason' => 'NO_EVIDENCE', 'summary' => 'Respuesta descartada por control de salida.'];
                $text = $this->prompts->guardedNotice($this->back($tenantId));
            }
            $decision = $this->deliver($context, $text);
            $this->finish($context, $decision === 'HANDOFF' ? 'HANDOFF' : 'REPLY', 'SUCCEEDED', null, $trace, $usage);

            return $decision;
        } catch (ConversationConflict $e) {
            // An advisor took over (or closed) while we were thinking: discard silently.
            $this->finish($context, 'IGNORE', 'CANCELLED', $e->code_, $trace, $usage);
            if ($e->code_ === 'AI_DISABLED') {
                // Switched off mid-turn: nobody else would answer, so a human takes it now (the sweep is the backstop).
                InboundMessageService::handOffOrphanedBotConversation($tenantId, $conversationId);
            }

            return 'STALE';
        } catch (QuotaExceeded|LlmFailure $e) {
            $code = $e instanceof QuotaExceeded ? 'QUOTA_EXCEEDED' : $e->errorCode;

            return $this->failToHuman($context, $code, $trace, $usage);
        } catch (Throwable $e) {
            report($e);

            return $this->failToHuman($context, 'INTERNAL_ERROR', $trace, $usage);
        }
    }

    /**
     * Copilot: a draft for the advisor who controls the conversation. Same prompt, knowledge, output guard and
     * budget as a turn, but read-only tools; nothing is sent, queued or changed in the conversation. Only the run
     * is stored (cost and audit); the advisor edits the text and sends it as an ordinary reply.
     *
     * @return array{text: string, suggestion_id: string}
     *
     * @throws CopilotFailure
     */
    public function suggest(int $tenantId, int $conversationId): array
    {
        $this->startedAt = hrtime(true) / 1e9;
        $this->deadline = (int) config('agent.copilot_deadline_seconds'); // the advisor's HTTP request (php-fpm cuts at 35 s)
        if (! InboundMessageService::copilotEnabled($tenantId)) {
            throw new CopilotFailure('COPILOT_DISABLED');
        }
        $conversation = DB::table('conversations as c')
            ->join('channel_accounts as ca', fn ($j) => $j->on('ca.id', '=', 'c.channel_account_id')->on('ca.tenant_id', '=', 'c.tenant_id'))
            ->where('c.tenant_id', $tenantId)->where('c.id', $conversationId)
            ->first(['c.contact_id', 'c.channel_account_id', 'c.control_state', 'c.control_epoch', 'ca.channel_type']);
        if ($conversation?->control_state !== 'HUMAN_ACTIVE') {
            throw new CopilotFailure('NOT_IN_CONTROL');
        }
        $thread = fn () => DB::table('messages')->where('tenant_id', $tenantId)->where('conversation_id', $conversationId);
        if (! $thread()->where('direction', 'INBOUND')->exists()) {
            throw new CopilotFailure('NOTHING_TO_ANSWER');
        }
        // The draft answers the customer's latest message: the history must end on their turn (and notes never reach the model).
        $inputSequence = (int) $thread()->where('direction', 'INBOUND')->max('sequence');
        $drafts = fn () => DB::table('chatbot_runs')->where('tenant_id', $tenantId)->where('provider_run_id', 'like', 'suggest:%');
        if ($drafts()->where('conversation_id', $conversationId)->where('input_sequence', $inputSequence)->count() >= (int) config('conversations.copilot_drafts_per_message')) {
            throw new CopilotFailure('TOO_MANY_DRAFTS');
        }
        // Own monthly ceiling, so drafts can never starve the assistant's turns of the shared budget (D14).
        if ((float) $drafts()->where('started_at', '>=', CarbonImmutable::now('UTC')->startOfMonth())->sum('estimated_cost')
            >= (float) config('conversations.copilot_monthly_usd')) {
            throw new CopilotFailure('QUOTA_EXCEEDED');
        }

        $suggestionId = (string) Str::uuid();
        $runId = $this->startRun($tenantId, $conversationId, (int) $conversation->control_epoch, $inputSequence, 'suggest:'.$suggestionId)
            ?? throw new CopilotFailure('INTERNAL_ERROR');
        $context = new ToolContext($tenantId, $conversationId, (int) $conversation->contact_id, (int) $conversation->channel_account_id,
            (string) $conversation->channel_type, $runId, (int) $conversation->control_epoch, $inputSequence, (string) Str::uuid());
        $trace = ['mode' => 'COPILOT', 'calls' => 0, 'tools' => [], 'sources' => [], 'guard' => []];
        $usage = ['input' => 0, 'output' => 0, 'micros' => 0];

        try {
            $text = $this->converse($context, (string) $conversation->channel_type, $trace, $usage, copilot: true);
            [$text, $violations] = $this->screen($text, $context, $trace, draft: true);
            if ($text === '' || $violations !== []) {
                $trace['guard'] = $violations === [] ? ['EMPTY_REPLY'] : $violations;
                $this->finish($context, 'BLOCK', 'SUCCEEDED', 'UNSAFE_DRAFT', $trace, $usage);

                throw new CopilotFailure('UNSAFE_DRAFT');
            }
            // Only a hash: the acceptance check compares the sent text with it; the draft itself stays out of the trace.
            $this->finish($context, 'REPLY', 'SUCCEEDED', null, $trace + ['draft_sha256' => hash('sha256', trim($text))], $usage);

            return ['text' => $text, 'suggestion_id' => $suggestionId];
        } catch (CopilotFailure $e) {
            if ($e->errorCode === 'ACTION_NEEDED') {
                $this->finish($context, 'IGNORE', 'SUCCEEDED', 'ACTION_NEEDED', $trace, $usage);
            }

            throw $e;
        } catch (QuotaExceeded|LlmFailure $e) {
            $code = $e instanceof QuotaExceeded ? 'QUOTA_EXCEEDED' : $e->errorCode;
            $this->finish($context, 'IGNORE', 'FAILED', $code, $trace, $usage);

            throw new CopilotFailure($code === 'QUOTA_EXCEEDED' ? $code : 'MODEL_UNAVAILABLE');
        } catch (Throwable $e) {
            report($e);
            $this->finish($context, 'IGNORE', 'FAILED', 'INTERNAL_ERROR', $trace, $usage);

            throw new CopilotFailure('INTERNAL_ERROR');
        }
    }

    /**
     * @param  array<string, mixed>  $trace
     * @param  array{input: int, output: int, micros: int}  $usage
     */
    private function converse(ToolContext $context, string $channelType, array &$trace, array &$usage, bool $copilot = false): string
    {
        $maxIn = (int) config('agent.max_input_tokens');
        $maxOut = (int) config('agent.max_output_tokens');
        $history = $this->history($context);
        // The client's newest message, and the one before for follow-ups ("¿y en cuotas?"); search weighs them apart.
        [$query, $previous] = $this->clientMessages($context) + ['', ''];
        $sources = $this->knowledge->search($context->tenantId, $query, ['PUBLIC'], (int) config('agent.knowledge_top_k'), $previous);
        $trace['sources'] = array_column($sources, 'source_id');
        // Evidence is what the model saw of each approved source: its heading and its excerpt (EVP-113).
        $trace['knowledge'] = array_map(fn (array $s): string => $s['title'].': '.$s['excerpt'], $sources);
        $trace['facts'] = [];

        $tenantName = (string) DB::table('tenants')->where('id', $context->tenantId)->value('name');
        // A draft is for an advisor who is already here: business hours only shape the assistant's own turn.
        $timezone = rescue(fn () => app(BusinessHours::class)->settings($context->tenantId)['timezone'], 'America/Argentina/Buenos_Aires');
        $system = $this->prompts->system($tenantName, $channelType, CarbonImmutable::now($timezone)->toDateString(), $sources, $copilot,
            $copilot ? null : $this->hours($context->tenantId));
        $definitions = $this->tools->definitions();
        if ($copilot) {
            $definitions = array_values(array_filter($definitions, fn (array $d): bool => in_array($d['name'], self::COPILOT_TOOLS, true)));
        }
        $messages = $this->fit($system, $definitions, $history, $maxIn);

        $response = $this->call($context, $system, $messages, $definitions, $maxOut, true, $trace, $usage);
        $toolUses = $response->toolUses();
        if ($toolUses === []) {
            return $this->finalText($response);
        }

        $results = [];
        foreach ($toolUses as $i => $use) {
            $envelope = match (true) {
                // Enforced here too: the model may name a tool it was not offered.
                $copilot && ! in_array($use['name'], self::COPILOT_TOOLS, true) => ['ok' => false, 'error' => ['code' => 'FORBIDDEN',
                    'message' => 'En modo borrador solo podés consultar; esa acción la hace el asesor.', 'retryable' => false]],
                $i < (int) config('agent.max_tool_calls') => $this->tools->execute($context, $use['name'], $use['input']),
                default => ['ok' => false, 'error' => ['code' => 'VALIDATION_ERROR', 'message' => 'Límite de herramientas por turno.', 'retryable' => false]],
            };
            $trace['tools'][] = ['name' => mb_substr($use['name'], 0, 64), 'ok' => $envelope['ok'], 'code' => $envelope['error']['code'] ?? null,
                'replayed' => $envelope['meta']['replayed'] ?? false];
            if (! $copilot && ($summary = app(ContactConfirmation::class)->summary($context)) !== null) {
                // A failed registration request must display the exact server-owned snapshot.
                return $summary;
            }
            $json = json_encode($envelope, JSON_THROW_ON_ERROR | JSON_UNESCAPED_UNICODE);
            $this->collectFacts($use['name'], is_array($use['input'] ?? null) ? $use['input'] : [], $envelope, $trace);
            if ($use['name'] === 'solicitar_visita' && $envelope['ok']) {
                $trace['visit_requested'] = true;
            }
            $results[] = ['type' => 'tool_result', 'tool_use_id' => $use['id'], 'content' => $json, 'is_error' => ! $envelope['ok']];
        }
        $refused = array_values(array_filter($trace['tools'], fn (array $t): bool => $t['code'] === 'FORBIDDEN'));
        if ($copilot && $refused !== []) {
            // The model wanted to act: say which action the advisor should take instead of paying for a second
            // call that could pretend it was done.
            throw new CopilotFailure('ACTION_NEEDED', $refused[0]['name']);
        }
        if ($context->handoff !== null && $response->text() === '') {
            // No need for a second call just to say goodbye.
            return $this->prompts->handoffNotice($this->back($context->tenantId));
        }

        $messages[] = ['role' => 'assistant', 'content' => $response->content];
        $messages[] = ['role' => 'user', 'content' => $results];
        $final = $this->call($context, $system, $messages, $definitions, $maxOut, false, $trace, $usage);

        return $this->finalText($final);
    }

    /**
     * One billable call with its own reservation; one retry across the whole turn.
     *
     * @param  list<array<string, mixed>>  $messages
     * @param  list<array<string, mixed>>  $definitions
     * @param  array<string, mixed>  $trace
     * @param  array{input: int, output: int, micros: int}  $usage
     */
    private function call(ToolContext $context, string $system, array $messages, array $definitions, int $maxOut, bool $allowTools, array &$trace, array &$usage): LlmResponse
    {
        $inRate = (float) config('agent.input_micros_per_token');
        $outRate = (float) config('agent.output_micros_per_token');
        $reservation = (int) ceil((int) config('agent.max_input_tokens') * $inRate + $maxOut * $outRate);

        while (true) {
            if ($trace['calls'] >= (int) config('agent.max_llm_calls') + (int) config('agent.max_retries')) {
                throw new LlmFailure('CALL_BUDGET_EXHAUSTED', retryable: false, billable: false);
            }
            $trace['calls']++;
            $key = 'llm:'.$context->runId.':'.$trace['calls'];
            $this->ledger->reserve($context->tenantId, $key, 'LLM', $reservation);
            try {
                $response = $this->llm->complete($system, $messages, $definitions, $maxOut, $allowTools);
            } catch (Throwable $e) {
                if (! $e instanceof LlmFailure) {
                    // Unknown client error: the request may have left; keep the reservation as UNKNOWN.
                    $this->ledger->markUnknown($context->tenantId, $key);
                    throw $e;
                }
                $e->billable ? $this->ledger->markUnknown($context->tenantId, $key) : $this->ledger->release($context->tenantId, $key);
                $retriesUsed = $trace['retries'] ?? 0;
                $wait = ! $e->billable && $e->retryable && $retriesUsed < (int) config('agent.max_retries') ? $this->retryWait($e) : null;
                if ($wait !== null) {
                    $trace['retries'] = $retriesUsed + 1;
                    $trace['retry_wait_ms'] = $wait;
                    Sleep::for($wait)->milliseconds(); // the rejected request's reservation was released before waiting

                    continue;
                }
                throw $e;
            }
            $micros = (int) ceil($response->inputTokens * $inRate + $response->outputTokens * $outRate);
            $this->ledger->commit($context->tenantId, $key, $micros);
            $usage['input'] += $response->inputTokens;
            $usage['output'] += $response->outputTokens;
            $usage['micros'] += $micros;

            return $response;
        }
    }

    /**
     * EVP-115: wait before the single retry so a momentary limit does not become a handoff. Honors the
     * provider's Retry-After plus jitter; without one, a jittered base. Null (no retry) when the provider asks
     * for longer than agent.retry_max_wait_seconds or the retried call could outlive the turn deadline (which
     * stays below the job timeout and the turn lock).
     */
    private function retryWait(LlmFailure $e): ?int
    {
        $base = $e->retryAfter !== null ? $e->retryAfter * 1000 : max(0, (int) config('agent.retry_base_wait_ms'));
        $maxWait = max(0, (int) config('agent.retry_max_wait_seconds') * 1000);
        if ($base > $maxWait) {
            return null;
        }
        $wait = $base + random_int(0, min($maxWait - $base, max(0, (int) config('agent.retry_jitter_ms'))));
        $elapsed = hrtime(true) / 1e9 - $this->startedAt;
        $worstCall = (int) config('agent.timeout_seconds') + 5; // + connect timeout of the clients

        return $elapsed + $wait / 1000 + $worstCall <= $this->deadline ? $wait : null;
    }

    /**
     * EVP-192: the property facts the inventory tools returned this turn are evidence for the OutputGuard (counts,
     * surface, code, place, category and the listing text). An inventory answer (items, an empty list or NOT_FOUND)
     * also lets the reply say a unit is not available, and a unit code asked for and not found (NOT_FOUND, or a search
     * by that code with no results) is the only one the reply may call sold; a failed or refused call proves nothing.
     *
     * @param  array<string, mixed>  $input
     * @param  array<string, mixed>  $envelope
     * @param  array<string, mixed>  $trace
     */
    private function collectFacts(string $tool, array $input, array $envelope, array &$trace): void
    {
        if (! in_array($tool, self::COPILOT_TOOLS, true)) {
            return;
        }
        if ($envelope['ok'] || ($envelope['error']['code'] ?? null) === 'NOT_FOUND') {
            $trace['inventory_checked'] = true;
        }
        $code = is_string($input['unit_code'] ?? null) ? mb_substr(trim($input['unit_code']), 0, 80) : '';
        $data = $envelope['data'] ?? null;
        if ($code !== '' && preg_match('/^[a-z0-9\-\/.\s]{1,32}$/i', $code) === 1
            && (($envelope['error']['code'] ?? null) === 'NOT_FOUND' || ($envelope['ok'] && is_array($data) && ($data['items'] ?? null) === []))) {
            $trace['not_found'][] = $code;
        }
        if (! $envelope['ok'] || ! is_array($data)) {
            return;
        }
        foreach (is_array($data['items'] ?? null) ? $data['items'] : [$data] as $item) {
            if (is_array($item) && isset($item['id'])) {
                $trace['facts'][] = array_intersect_key($item, array_flip(['code', 'bedrooms', 'bathrooms', 'area_m2', 'city', 'province',
                    'neighborhood', 'project', 'category', 'description']));
            }
        }
    }

    /**
     * EVP-192: the tenant's own place names (inventory, projects and the imported localities catalogue), so the guard
     * recognizes a location in the reply. Always scoped to the run's tenant.
     *
     * @return list<string>
     */
    private function locations(int $tenantId): array
    {
        // One round trip; UNION drops duplicates. ponytail: reads the tenant's inventory rows on every screened reply
        // (milliseconds at ~3.600 properties, per the EVP-192 review); past that, cache per tenant and inventory version.
        $column = fn (string $table, string $name) => DB::table($table)->where('tenant_id', $tenantId)->whereNull('deleted_at')
            ->whereNotNull($name)->select($name.' as name');
        $names = $column('properties', 'city')->union($column('properties', 'province'))->union($column('properties', 'neighborhood'))
            ->union($column('projects', 'city'))->union($column('projects', 'province'))
            ->union(DB::table('legacy_localities')->where('tenant_id', $tenantId)->whereNotNull('label')->select('label as name'))
            ->pluck('name')->all();

        return array_values(array_unique(array_filter(array_map(fn (mixed $n): string => is_string($n) ? trim($n) : '', $names))));
    }

    /**
     * The only way out for text, to the channel (deliver) or to the advisor (copilot draft). EVP-113: the model cites
     * [fuente: F1] as a sign of support, but ids are internal. The ORIGINAL text is sent (no NFKC copy): without
     * invisible characters and marks, then truncated; the guard checks exactly that text (it normalizes internally).
     * Aliases become source ids; a citation of anything not retrieved this turn, or a mark/source id left in the
     * text, is UNKNOWN_SOURCE. The trace keeps only the cited source ids of this turn.
     *
     * @param  array<string, mixed>  $trace
     * @return array{0: string, 1: list<string>} text to send and violation codes
     */
    private function screen(string $text, ToolContext $context, array &$trace, bool $draft = false): array
    {
        $sources = $trace['sources'] ?? [];
        [$clean, $cited, $unknown] = $this->guard->citations($text, $sources);
        $trace['cited'] = $cited;
        $visitor = $this->visitorMessages($context);
        $locations = $this->locations($context->tenantId);
        $facts = $trace['facts'] ?? [];
        // EVP-192: business hours are server text the model saw; their numbers ("de 9 a 18") are not invented.
        $hours = $draft ? null : $this->hours($context->tenantId);
        $allowed = array_values(array_filter([$hours['summary'] ?? null, $hours['back'] ?? null], is_string(...)));
        $tenant = DB::table('tenants')->where('id', $context->tenantId)->where('status', 'ACTIVE')->first(['slug', 'public_id']);
        $selectors = $tenant === null ? [] : [$tenant->slug, $tenant->public_id];
        // Tenant registry check: a slug may collide with another tenant's public id. Ambiguous hosts fail closed.
        $conflicts = DB::table('tenants')->where('id', '!=', $context->tenantId)->where('status', 'ACTIVE')
            ->where(fn ($q) => $q->whereIn('slug', $selectors)->orWhereIn('public_id', $selectors))->get(['slug', 'public_id']);
        if ($conflicts->isNotEmpty()) {
            $selectors = []; // SQL collation decides collisions; PHP string comparison must not undo that decision.
        }
        $hosts = $tenant === null ? [] : array_keys(array_filter((array) config('tenancy.hosts', []),
            fn ($selector): bool => is_string($selector) && in_array($selector, $selectors, true)));
        // Match the resolver's lowercase lookup exactly: an uppercase duplicate must not authorize another tenant.
        $hosts = array_values(array_filter($hosts, fn ($host): bool => is_string($host) && $host === strtolower($host)));
        $check = function (string $part, array $requested = [], ?string $factsText = null) use ($context, $trace, $draft, $visitor, $locations, $allowed, $hosts, &$facts): array {
            // EVP-200: no tool price is ever evidence; financingAllowed stays off until the per-project panel flag exists.
            return $this->guard->check($part, [], $trace['knowledge'] ?? [],
                $trace['visit_requested'] ?? false, $draft, outOfHours: ! $draft && $this->back($context->tenantId) !== null,
                visitorMessages: $visitor, requested: $requested, facts: $facts, inventoryChecked: $trace['inventory_checked'] ?? false,
                locations: $locations, notFound: $trace['not_found'] ?? [], serverTexts: $allowed, factsText: $factsText, allowedHosts: $hosts);
        };

        if (! $draft && $text === app(ContactConfirmation::class)->summary($context)) {
            // EVP-192: the summary's "Propiedad" line is server data (title and code), whatever turn the property came from.
            // It backs the code and title only, never availability (the unit may have been sold since).
            $propertyId = app(ContactConfirmation::class)->pendingPropertyId($context);
            $property = $propertyId === null ? null : DB::table('properties')->where('tenant_id', $context->tenantId)
                ->where('public_id', $propertyId)->first(['code', 'title']);
            if ($property !== null) {
                $facts[] = ['code' => $property->code, 'description' => $property->title, 'summary_only' => true];
            }
            // The contact summary is built by the server (notes and name already without marks) and goes out byte for
            // byte so bind() finds it. Only its "Consulta" value repeats the visitor's request: there, and only with
            // the visitor's messages of this turn and the previous one, their words back terms and amounts; it never
            // reads as an offer (COMMITMENT_CLAIM). The rest of the summary is checked like any reply.
            [$frame, $request] = ContactConfirmation::request($text);
            $unknown = $unknown || $cited !== [] || $this->guard->leftover($text, $sources);
            // The visitor's words back the request only when it reads as one ("Quiere…", "Consulta…", "¿…?").
            $asked = $this->guard->asks($request);
            // The visitor's own phone and email are their data, not property facts; check Nombre: separately without
            // locations so real surnames ("Lozano") pass while smuggled facts/dates/amenities/availability fail.
            $nameLine = preg_match('/^Nombre:.*$/mu', $frame, $nm) === 1 ? $nm[0] : '';
            $propertyFrame = preg_replace('/^(?:Nombre|Teléfono|Correo):.*$/mu', '', $frame) ?? $frame;
            $nameViolations = $nameLine === '' ? [] : $this->guard->check($nameLine, [], $trace['knowledge'] ?? [],
                visitorMessages: $visitor, facts: $facts, inventoryChecked: $trace['inventory_checked'] ?? false,
                locations: [], notFound: $trace['not_found'] ?? [], serverTexts: $allowed, allowedHosts: $hosts);
            $violations = [...$check($frame, factsText: $propertyFrame), ...$nameViolations,
                ...($this->guard->commits($request, $asked) ? ['COMMITMENT_CLAIM'] : []),
                ...$check($request, $asked ? array_slice($visitor, -2) : [])];
        } else {
            $text = mb_substr($clean, 0, (int) config('agent.reply_max_chars'));
            $unknown = $unknown || $this->guard->leftover($text, $sources);
            $violations = $check($text);
        }

        return [$text, array_values(array_unique($unknown ? [...$violations, 'UNKNOWN_SOURCE'] : $violations))];
    }

    /** Not truncated here: screen() cuts after removing citation marks, so a mark is never cut open. */
    private function finalText(LlmResponse $response): string
    {
        return trim((string) preg_replace('/[ \t]+\n/', "\n", $response->text()));
    }

    /**
     * Queues the reply under the run's epoch, or hands off with the reply as the notice.
     */
    private function deliver(ToolContext $context, string $text): string
    {
        $key = 'run:'.$context->runId;
        if ($context->handoff !== null) {
            // Out of hours (EVP-L10) the visitor always gets the fixed line saying when a person answers. The model's
            // own text (already checked by OutputGuard, including immediate promises) stays, so its help is not lost.
            $back = $this->back($context->tenantId);
            if ($back !== null && ! in_array($text, [$this->prompts->handoffNotice($back), $this->prompts->guardedNotice($back),
                $this->prompts->unavailableNotice($back)], true)) {
                $text = trim($text) === '' ? $this->prompts->handoffNotice($back) : trim($text).' '.$this->prompts->backLine($back);
            }
            // Suggest the lead owner only if they can still take conversations.
            $leadOwner = DB::table('chatbot_sessions as s')
                ->join('leads as l', fn ($j) => $j->on('l.id', '=', 's.lead_id')->on('l.tenant_id', '=', 's.tenant_id'))
                ->join('users as u', fn ($j) => $j->on('u.id', '=', 'l.assigned_user_id')->on('u.tenant_id', '=', 'l.tenant_id'))
                ->where('s.tenant_id', $context->tenantId)->where('s.conversation_id', $context->conversationId)->where('s.status', 'ACTIVE')
                ->where('u.status', 'ACTIVE')->whereNull('u.deleted_at')->whereIn('u.role_code', ['TENANT_ADMIN', 'SALES_MANAGER', 'SALES_ADVISOR'])
                ->value('u.id');
            $result = $this->control->requestHuman($context->tenantId, $context->conversationId, $context->epoch,
                $context->handoff['reason'].': '.$context->handoff['summary'], $text, $key, $leadOwner === null ? null : (int) $leadOwner);
            if ($result['notice_job_id'] !== null) {
                DispatchOutboundJob::dispatch($context->tenantId, $result['notice_job_id']);
            }

            return 'HANDOFF';
        }

        $reply = $this->control->proposeBotReply($context->tenantId, $context->conversationId, $context->epoch, $text, $key);
        app(ContactConfirmation::class)->bind($context, $text, $reply);
        DB::table('chatbot_runs')->where('tenant_id', $context->tenantId)->where('id', $context->runId)->update(['output_message_id' => $reply['message_id']]);
        DispatchOutboundJob::dispatch($context->tenantId, $reply['job_id']);

        return 'REPLIED';
    }

    /**
     * @param  array<string, mixed>  $trace
     * @param  array{input: int, output: int, micros: int}  $usage
     */
    private function failToHuman(ToolContext $context, string $code, array $trace, array $usage): string
    {
        $context->handoff = ['reason' => 'TOOL_FAILURE', 'summary' => 'Asistente no disponible ('.$code.').'];
        try {
            $this->deliver($context, $this->prompts->unavailableNotice($this->back($context->tenantId)));
        } catch (ConversationConflict) {
            // Already under human control: nothing to hand off.
        }
        $this->finish($context, 'HANDOFF', 'FAILED', $code, $trace, $usage);

        return 'FAILED_HANDOFF';
    }

    /** When the team is back, only outside business hours; a failed read behaves as in hours (no claim made). */
    private function back(int $tenantId): ?string
    {
        return rescue(fn () => app(BusinessHours::class)->backPhrase($tenantId), null);
    }

    /** @return array{summary: string, back: ?string}|null */
    private function hours(int $tenantId): ?array
    {
        return rescue(function () use ($tenantId): ?array {
            $hours = app(BusinessHours::class);
            $summary = $hours->describe($tenantId);

            return $summary === null ? null : ['summary' => $summary, 'back' => $hours->backPhrase($tenantId)];
        }, null);
    }

    /** Idempotent per (conversation, inbound sequence): a redelivered job does not answer twice. */
    private function startRun(int $tenantId, int $conversationId, int $epoch, int $inputSequence, ?string $runRef = null): ?int
    {
        DB::table('chatbot_agents')->insertOrIgnore([
            'tenant_id' => $tenantId, 'public_id' => (string) Str::uuid(), 'name' => self::AGENT_NAME, 'mode' => 'AI', 'status' => 'ACTIVE',
            'model_provider' => $this->llm->provider(), 'model_name' => $this->llm->model(), 'prompt_version' => config('agent.prompt_version'),
        ]);
        $agentId = (int) DB::table('chatbot_agents')->where('tenant_id', $tenantId)->where('name', self::AGENT_NAME)->value('id');
        $now = CarbonImmutable::now('UTC')->format('Y-m-d H:i:s.v');
        $sessions = fn () => DB::table('chatbot_sessions')->where('tenant_id', $tenantId)->where('chatbot_agent_id', $agentId)->where('conversation_id', $conversationId);
        if (str_starts_with((string) $runRef, 'suggest:')) {
            // A draft never puts the bot back in the conversation: reuse its last session, or a closed one.
            $sessionId = (int) ($sessions()->max('id') ?? DB::table('chatbot_sessions')->insertGetId([
                'tenant_id' => $tenantId, 'chatbot_agent_id' => $agentId, 'conversation_id' => $conversationId, 'status' => 'COMPLETED',
                'started_at' => $now, 'last_activity_at' => $now, 'ended_at' => $now,
            ]));
        } else {
            DB::table('chatbot_sessions')->insertOrIgnore([
                'tenant_id' => $tenantId, 'chatbot_agent_id' => $agentId, 'conversation_id' => $conversationId, 'status' => 'ACTIVE',
                'started_at' => $now, 'last_activity_at' => $now,
            ]);
            $sessionId = (int) $sessions()->where('status', 'ACTIVE')->value('id');
        }
        $inputMessageId = DB::table('messages')->where('tenant_id', $tenantId)->where('conversation_id', $conversationId)
            ->where('sequence', $inputSequence)->value('id');

        try {
            return (int) DB::table('chatbot_runs')->insertGetId([
                'tenant_id' => $tenantId, 'session_id' => $sessionId, 'conversation_id' => $conversationId, 'control_epoch' => $epoch,
                'input_sequence' => $inputSequence, 'input_message_id' => $inputMessageId,
                'provider_run_id' => $runRef ?? 'turn:'.$conversationId.':'.$inputSequence, 'model_provider' => $this->llm->provider(),
                'model_name' => $this->llm->model(), 'prompt_version' => config('agent.prompt_version'), 'decision' => 'REPLY',
                'status' => 'STARTED', 'started_at' => $now,
            ]);
        } catch (UniqueConstraintViolationException) {
            return null;
        }
    }

    /**
     * @param  array<string, mixed>  $trace
     * @param  array{input: int, output: int, micros: int}  $usage
     */
    private function finish(ToolContext $context, string $decision, string $status, ?string $errorCode, array $trace, array $usage): void
    {
        unset($trace['knowledge'], $trace['facts']); // content stays out of the run trace (ids and codes only)
        // Only a run still STARTED: the reconciler may already have failed and handed it off.
        DB::table('chatbot_runs')->where('tenant_id', $context->tenantId)->where('id', $context->runId)->where('status', 'STARTED')->update([
            'decision' => $decision, 'status' => $status, 'error_code' => $errorCode,
            'input_tokens' => $usage['input'], 'output_tokens' => $usage['output'],
            'estimated_cost' => number_format($usage['micros'] / 1_000_000, 8, '.', ''), 'currency_code' => 'USD',
            'trace_json' => json_encode($trace + ['trace_id' => $context->traceId], JSON_THROW_ON_ERROR | JSON_UNESCAPED_UNICODE),
            'completed_at' => CarbonImmutable::now('UTC')->format('Y-m-d H:i:s.v'),
        ]);
    }

    /**
     * Visitor text up to the input message, using the same scoped history as the model.
     *
     * @return list<string>
     */
    private function visitorMessages(ToolContext $context): array
    {
        return array_column(array_filter($this->history($context), static fn (array $turn): bool => $turn['role'] === 'user'), 'content');
    }

    /**
     * The client's last two messages of this conversation up to the turn's input, newest first. Only INBOUND: never
     * the assistant, an advisor or an internal note.
     *
     * @return list<string>
     */
    private function clientMessages(ToolContext $context): array
    {
        return DB::table('messages')->where('tenant_id', $context->tenantId)->where('conversation_id', $context->conversationId)
            ->where('sequence', '<=', $context->inputSequence)->where('direction', 'INBOUND')->whereNotNull('text_body')
            ->orderByDesc('sequence')->limit(2)->pluck('text_body')->map(fn ($t): string => (string) $t)->all();
    }

    /** @return list<array{role: string, content: string}> */
    private function history(ToolContext $context): array
    {
        $rows = DB::table('messages')->where('tenant_id', $context->tenantId)->where('conversation_id', $context->conversationId)
            ->where('sequence', '<=', $context->inputSequence)->whereNotNull('text_body')
            ->where(fn ($q) => $q->where('direction', 'INBOUND')->orWhere(fn ($o) => $o->where('direction', 'OUTBOUND')
                ->whereNotIn('delivery_status', ['CANCELLED', 'FAILED'])))
            ->orderByDesc('sequence')->limit((int) config('agent.history_messages'))
            ->get(['sequence', 'direction', 'sender_type', 'text_body', 'occurred_at', 'created_at']);
        // EVP-142: Meta can deliver late, so client messages are put in real order, but only within the group each reply
        // answered (the client messages received before it). Replies never move and a late message never jumps over
        // one, so every turn reads as the model saw it; the unanswered group closes the turn.
        $group = PHP_INT_MAX;
        $keys = [];
        foreach ($rows as $m) { // newest first
            $outbound = $m->direction === 'OUTBOUND';
            $group = $outbound ? (int) $m->sequence : $group;
            $keys[$m->sequence] = [$group, (int) $outbound, $outbound ? '' : InboundMessageService::chronologicalAt($m)->format('Y-m-d H:i:s.u'), (int) $m->sequence];
        }
        $rows = $rows->sortBy(fn ($m): array => $keys[$m->sequence]);

        $turns = [];
        foreach ($rows as $row) {
            $role = $row->direction === 'INBOUND' ? 'user' : 'assistant';
            $text = mb_substr((string) $row->text_body, 0, 2000);
            if ($role === 'assistant' && $row->sender_type === 'USER') {
                $text = '[Asesor] '.$text;
            }
            if ($turns !== [] && $turns[array_key_last($turns)]['role'] === $role) {
                $turns[array_key_last($turns)]['content'] .= "\n".$text;
            } else {
                $turns[] = ['role' => $role, 'content' => $text];
            }
        }
        while ($turns !== [] && $turns[0]['role'] !== 'user') {
            array_shift($turns);
        }

        return $turns;
    }

    /**
     * Drops the oldest turns until the estimated prompt fits the input budget (~3.5 chars/token).
     *
     * @param  list<array<string, mixed>>  $definitions
     * @param  list<array{role: string, content: string}>  $history
     * @return list<array<string, mixed>>
     */
    private function fit(string $system, array $definitions, array $history, int $maxInputTokens): array
    {
        $estimate = fn (string $s): int => (int) ceil(mb_strlen($s) / 3.5);
        $fixed = $estimate($system) + $estimate(json_encode($definitions, JSON_THROW_ON_ERROR));
        // Leave room for tool results and the assistant's tool call in the second call.
        $budget = max(500, $maxInputTokens - $fixed - 1500);
        while (count($history) > 1 && array_sum(array_map(fn (array $t): int => $estimate($t['content']), $history)) > $budget) {
            array_shift($history);
            while ($history !== [] && $history[0]['role'] !== 'user') {
                array_shift($history);
            }
        }
        if ($history === []) {
            throw new LlmFailure('EMPTY_CONTEXT', retryable: false, billable: false);
        }

        return $history;
    }
}
