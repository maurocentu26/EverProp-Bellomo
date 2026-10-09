<?php

namespace App\Domain\AgentRuntime\Jobs;

use App\Domain\AgentRuntime\Coordinator\AgentCoordinator;
use App\Domain\AgentRuntime\Coordinator\PromptBuilder;
use App\Domain\Conversations\Exceptions\ConversationConflict;
use App\Domain\Conversations\Jobs\DispatchOutboundJob;
use App\Domain\Conversations\Services\ConversationControl;
use DateTimeInterface;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Throwable;

/**
 * One assistant turn. Turns of the same conversation never overlap (cache lock held longer than
 * the worst-case turn); a turn that finds the lock taken waits and retries until retryUntil(),
 * then skips if a newer message superseded it. The coordinator is idempotent per (conversation,
 * inbound sequence). If the job dies for any reason, failed() hands the conversation to a human:
 * a visitor is never left in AI_ACTIVE in silence.
 *
 * Ops: the queue's retry_after must exceed agent.turn_lock_seconds (see .env.example).
 */
final class RunAgentJob implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable;

    public int $maxExceptions = 1;

    public int $timeout = 150;

    public function __construct(public readonly int $tenantId, public readonly int $conversationId, public readonly int $inputSequence)
    {
        $this->afterCommit();
    }

    public function retryUntil(): DateTimeInterface
    {
        return now()->addMinutes(5);
    }

    public function handle(AgentCoordinator $coordinator): void
    {
        $lock = Cache::lock('agent-turn:'.$this->tenantId.':'.$this->conversationId, (int) config('agent.turn_lock_seconds', 180));
        if (! $lock->get()) {
            $this->release(10);

            return;
        }
        try {
            $coordinator->handle($this->tenantId, $this->conversationId, $this->inputSequence);
        } finally {
            $lock->release();
        }
    }

    public function failed(?Throwable $e): void
    {
        $conversation = DB::table('conversations')->where('tenant_id', $this->tenantId)->where('id', $this->conversationId)
            ->first(['control_state', 'control_epoch']);
        if ($conversation === null || ! in_array($conversation->control_state, ConversationControl::BOT_STATES, true)) {
            return;
        }
        try {
            $result = app(ConversationControl::class)->requestHuman($this->tenantId, $this->conversationId, (int) $conversation->control_epoch,
                'TOOL_FAILURE: turno del asistente no completado', app(PromptBuilder::class)->unavailableNotice(),
                'turn-failed:'.$this->conversationId.':'.$this->inputSequence);
            if ($result['notice_job_id'] !== null) {
                DispatchOutboundJob::dispatch($this->tenantId, $result['notice_job_id']);
            }
        } catch (ConversationConflict) {
            // Control moved meanwhile: someone else owns the conversation now.
        }
    }
}
