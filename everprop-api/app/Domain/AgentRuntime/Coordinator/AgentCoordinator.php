<?php

namespace App\Domain\AgentRuntime\Coordinator;

use App\Domain\AgentRuntime\Knowledge\KnowledgeService;
use App\Domain\AgentRuntime\Llm\LlmClient;
use App\Domain\AgentRuntime\Llm\LlmFailure;
use App\Domain\AgentRuntime\Llm\LlmResponse;
use App\Domain\AgentRuntime\Tools\ToolContext;
use App\Domain\AgentRuntime\Tools\ToolGateway;
use App\Domain\Conversations\Exceptions\ConversationConflict;
use App\Domain\Conversations\Jobs\DispatchOutboundJob;
use App\Domain\Conversations\Services\ConversationControl;
use App\Domain\Conversations\Services\InboundMessageService;
use App\Domain\Usage\QuotaExceeded;
use App\Domain\Usage\UsageLedger;
use Carbon\CarbonImmutable;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Support\Facades\DB;
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

    /** @return string outcome code (for logs/tests) */
    public function handle(int $tenantId, int $conversationId, int $inputSequence): string
    {
        $conversation = DB::table('conversations as c')
            ->join('channel_accounts as ca', fn ($j) => $j->on('ca.id', '=', 'c.channel_account_id')->on('ca.tenant_id', '=', 'c.tenant_id'))
            ->where('c.tenant_id', $tenantId)->where('c.id', $conversationId)
            ->first(['c.id', 'c.contact_id', 'c.channel_account_id', 'c.control_state', 'c.control_epoch', 'ca.channel_type']);
        if ($conversation === null || ! in_array($conversation->control_state, ConversationControl::BOT_STATES, true)) {
            return 'SKIPPED_NOT_BOT';
        }
        // A turn queued before the assistant was switched off must not call the model.
        if (! InboundMessageService::aiEnabled()) {
            InboundMessageService::handOffOrphanedBotConversation($tenantId, $conversationId);

            return 'SKIPPED_AI_DISABLED';
        }
        $latestInbound = (int) DB::table('messages')->where('tenant_id', $tenantId)->where('conversation_id', $conversationId)
            ->where('direction', 'INBOUND')->max('sequence');
        if ($latestInbound > $inputSequence) {
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
            $text = $this->converse($context, (string) $conversation->channel_type, $trace, $usage);
            $violations = $this->guard->check($text, $trace['prices'] ?? [], $trace['knowledge'] ?? [], $trace['visit_requested'] ?? false);
            if ($text === '' || $violations !== []) {
                $trace['guard'] = $violations === [] ? ['EMPTY_REPLY'] : $violations;
                $context->handoff ??= ['reason' => 'NO_EVIDENCE', 'summary' => 'Respuesta descartada por control de salida.'];
                $text = $this->prompts->guardedNotice();
            }
            $decision = $this->deliver($context, $text);
            $this->finish($context, $decision === 'HANDOFF' ? 'HANDOFF' : 'REPLY', 'SUCCEEDED', null, $trace, $usage);

            return $decision;
        } catch (ConversationConflict $e) {
            // An advisor took over (or closed) while we were thinking: discard silently.
            $this->finish($context, 'IGNORE', 'CANCELLED', $e->code_, $trace, $usage);

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
        if (! config('conversations.copilot_enabled') || config('agent.llm_provider') === 'disabled') {
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
            $violations = $this->guard->check($text, $trace['prices'] ?? [], $trace['knowledge'] ?? [], draft: true);
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
        $query = implode(' ', array_slice(array_map(fn (array $m): string => $m['role'] === 'user' ? (string) $m['content'] : '', $history), -2));
        $sources = $this->knowledge->search($context->tenantId, $query, ['PUBLIC'], (int) config('agent.knowledge_top_k'));
        $trace['sources'] = array_column($sources, 'source_id');
        $trace['knowledge'] = array_map(fn (array $s): string => $s['excerpt'], $sources);
        $trace['prices'] = [];

        $tenantName = (string) DB::table('tenants')->where('id', $context->tenantId)->value('name');
        $system = $this->prompts->system($tenantName, $channelType, CarbonImmutable::now('America/Argentina/Buenos_Aires')->toDateString(), $sources, $copilot);
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
            $json = json_encode($envelope, JSON_THROW_ON_ERROR | JSON_UNESCAPED_UNICODE);
            $this->collectPrices($envelope, $trace);
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
            return $this->prompts->handoffNotice();
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
                if ($e->retryable && $retriesUsed < (int) config('agent.max_retries')) {
                    $trace['retries'] = $retriesUsed + 1;

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
     * Only prices the tools actually returned are evidence for the OutputGuard (never ids, dates or
     * other numbers from the payload).
     *
     * @param  array<string, mixed>  $envelope
     * @param  array<string, mixed>  $trace
     */
    private function collectPrices(array $envelope, array &$trace): void
    {
        if (! $envelope['ok']) {
            return;
        }
        $data = $envelope['data'];
        foreach (array_merge([$data], is_array($data['items'] ?? null) ? $data['items'] : []) as $item) {
            $price = is_array($item) ? ($item['price'] ?? null) : null;
            if (is_array($price) && isset($price['amount'], $price['currency'])) {
                $trace['prices'][] = ['amount' => (string) $price['amount'], 'currency' => (string) $price['currency']];
            }
        }
    }

    private function finalText(LlmResponse $response): string
    {
        $text = trim((string) preg_replace('/[ \t]+\n/', "\n", $response->text()));

        return mb_substr($text, 0, (int) config('agent.reply_max_chars'));
    }

    /**
     * Queues the reply under the run's epoch, or hands off with the reply as the notice.
     */
    private function deliver(ToolContext $context, string $text): string
    {
        $key = 'run:'.$context->runId;
        if ($context->handoff !== null) {
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
            $this->deliver($context, $this->prompts->unavailableNotice());
        } catch (ConversationConflict) {
            // Already under human control: nothing to hand off.
        }
        $this->finish($context, 'HANDOFF', 'FAILED', $code, $trace, $usage);

        return 'FAILED_HANDOFF';
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
        unset($trace['knowledge'], $trace['prices']); // content stays out of the run trace (ids and codes only)
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
     * Conversation up to the input message, as alternating user/assistant turns.
     *
     * @return list<array{role: string, content: string}>
     */
    private function history(ToolContext $context): array
    {
        $rows = DB::table('messages')->where('tenant_id', $context->tenantId)->where('conversation_id', $context->conversationId)
            ->where('sequence', '<=', $context->inputSequence)->whereNotNull('text_body')
            ->where(fn ($q) => $q->where('direction', 'INBOUND')->orWhere(fn ($o) => $o->where('direction', 'OUTBOUND')
                ->whereNotIn('delivery_status', ['CANCELLED', 'FAILED'])))
            ->orderByDesc('sequence')->limit((int) config('agent.history_messages'))->get(['direction', 'sender_type', 'text_body'])->reverse();

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
