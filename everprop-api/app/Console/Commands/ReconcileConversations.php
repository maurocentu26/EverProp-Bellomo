<?php

namespace App\Console\Commands;

use App\Domain\AgentRuntime\Coordinator\PromptBuilder;
use App\Domain\Conversations\Exceptions\ConversationConflict;
use App\Domain\Conversations\Jobs\DispatchOutboundJob;
use App\Domain\Conversations\Jobs\ProcessMetaWebhookReceipt;
use App\Domain\Conversations\Services\ConversationControl;
use App\Domain\Conversations\Services\InboundMessageService;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;

/**
 * Recovery sweep (S03/S07): Redis is not the source of truth. Platform job: it intentionally
 * sweeps every tenant; it only moves states forward and dispatches by (tenant_id, id).
 * - PROCESSING jobs whose lease expired become UNKNOWN (the worker may have died after the HTTP
 *   call); they are never resent automatically.
 * - PENDING/RETRY jobs that are due are re-enqueued (lost queue message, Redis restart).
 */
final class ReconcileConversations extends Command
{
    protected $signature = 'everprop:conversations:reconcile';

    protected $description = 'Mark expired dispatch leases UNKNOWN, re-enqueue due outbound jobs and WhatsApp webhook receipts, and hand off stuck assistant turns';

    public function handle(): int
    {
        $expired = DB::table('outbound_jobs')->where('status', 'PROCESSING')->where('lease_expires_at', '<', now())
            ->update(['status' => 'UNKNOWN', 'last_error_code' => 'LEASE_EXPIRED', 'lease_expires_at' => null]);
        DB::table('messages as m')->join('outbound_jobs as j', fn ($j) => $j->on('j.message_id', '=', 'm.id')->on('j.tenant_id', '=', 'm.tenant_id'))
            ->where('j.status', 'UNKNOWN')->where('m.delivery_status', 'QUEUED')->update(['m.delivery_status' => 'UNKNOWN']);
        // A late SENT from a worker whose lease expired is still accepted by the dispatcher (same nonce).

        $due = DB::table('outbound_jobs')->whereIn('status', ['PENDING', 'RETRY'])->where('scheduled_at', '<=', now())
            ->whereNotNull('message_id')->orderBy('scheduled_at')->limit(500)->get(['id', 'tenant_id']);
        foreach ($due as $job) {
            DispatchOutboundJob::dispatch((int) $job->tenant_id, (int) $job->id);
        }

        // WhatsApp webhook receipts stored before the 200 whose job was lost, is due for retry, or whose worker died
        // (PROCESSING lease in next_attempt_at expired). Processing is idempotent; after 10 attempts → DEAD_LETTER.
        $whatsapp = fn () => DB::table('webhook_receipts')->where('provider', 'META')->where('provider_object', 'whatsapp_messages');
        $whatsapp()->whereIn('processing_status', ['RECEIVED', 'RETRY', 'PROCESSING'])->where('attempt_count', '>=', 10)
            ->update(['processing_status' => 'DEAD_LETTER', 'last_error_code' => 'MAX_ATTEMPTS']);
        $whatsapp()->where('processing_status', 'PROCESSING')->where('next_attempt_at', '<', now())
            ->update(['processing_status' => 'RETRY', 'last_error_code' => 'LEASE_EXPIRED']);
        $receipts = $whatsapp()
            ->where(fn ($q) => $q->where(fn ($q) => $q->where('processing_status', 'RECEIVED')->where('received_at', '<', now()->subMinutes(2)))
                ->orWhere(fn ($q) => $q->where('processing_status', 'RETRY')->where(fn ($q) => $q->whereNull('next_attempt_at')->orWhere('next_attempt_at', '<=', now()))))
            ->orderBy('received_at')->limit(200)->get(['id', 'tenant_id']);
        foreach ($receipts as $receipt) {
            ProcessMetaWebhookReceipt::dispatch((int) $receipt->tenant_id, (int) $receipt->id);
        }
        // Failed receipts keep the client text only until expires_at (30 days) for review.
        $whatsapp()->where('expires_at', '<', now())->where('raw_payload', '!=', DB::raw("CAST('".ProcessMetaWebhookReceipt::REDACTED."' AS JSON)"))
            ->update(['raw_payload' => ProcessMetaWebhookReceipt::REDACTED]);

        // Assistant turns that died mid-way (worker crash): fail them and hand the conversation to a human,
        // so a visitor is never left in AI_ACTIVE without an answer.
        $stuck = DB::table('chatbot_runs')->where('status', 'STARTED')->where('started_at', '<', now()->subMinutes(5))
            ->whereNotNull('conversation_id')->limit(200)->get(['id', 'tenant_id', 'conversation_id', 'control_epoch', 'provider_run_id']);
        foreach ($stuck as $run) {
            $copilot = str_starts_with((string) $run->provider_run_id, 'suggest:');
            $fail = fn () => DB::table('chatbot_runs')->where('tenant_id', $run->tenant_id)->where('id', $run->id)->where('status', 'STARTED')
                ->update(['status' => 'FAILED', 'decision' => $copilot ? 'IGNORE' : 'HANDOFF', 'error_code' => 'RUN_TIMEOUT', 'completed_at' => now()]);
            try {
                // Reservations of a dead run may have reached the provider: keep them as UNKNOWN (never silently freed).
                DB::table('usage_ledger')->where('tenant_id', $run->tenant_id)->where('operation_key', 'like', 'llm:'.$run->id.':%')
                    ->where('status', 'RESERVED')->update(['status' => 'UNKNOWN']);
                if ($copilot) {
                    $fail(); // a draft nobody received: the advisor already has the conversation

                    continue;
                }
                $result = app(ConversationControl::class)->requestHuman((int) $run->tenant_id, (int) $run->conversation_id, (int) $run->control_epoch,
                    'TOOL_FAILURE: turno del asistente vencido', app(PromptBuilder::class)->unavailableNotice(), 'run:'.$run->id);
                // Marked FAILED only after the handoff: if it errors, the next sweep retries it.
                $fail();
                if ($result['notice_job_id'] !== null) {
                    DispatchOutboundJob::dispatch((int) $run->tenant_id, $result['notice_job_id']);
                }
            } catch (ConversationConflict) {
                $fail(); // control already moved on (advisor or newer epoch)
            } catch (\Throwable $e) {
                report($e); // one bad row must not stop the sweep
            }
        }

        // Assistant switched off: OPEN conversations left under bot control with a recent unanswered visitor
        // go to humans. Bounded to recent activity: rows that predate the runtime got control_state AI_ACTIVE
        // by column default (forward 2026-09-29.002) and must not flood the inbox.
        $orphaned = 0;
        if (! InboundMessageService::aiEnabled()) {
            $candidates = DB::table('conversations')->whereIn('control_state', ConversationControl::BOT_STATES)
                ->where('status', 'OPEN')->whereNull('closed_at')
                ->where('last_inbound_at', '>=', now()->subHours((int) config('conversations.ai_off_sweep_hours', 72)))
                ->where(fn ($q) => $q->whereNull('last_outbound_at')->orWhereColumn('last_inbound_at', '>', 'last_outbound_at'))
                // ponytail: oldest unanswered first; >500 rows failing on every run would still starve the rest (then page by id).
                ->orderBy('last_inbound_at')->limit(500)->get(['id', 'tenant_id']);
            foreach ($candidates as $c) {
                try {
                    $orphaned += (int) InboundMessageService::handOffOrphanedBotConversation((int) $c->tenant_id, (int) $c->id);
                } catch (\Throwable $e) {
                    report($e); // one bad row must not stop the sweep
                }
            }
        }

        $this->info("expired={$expired} requeued={$due->count()} webhook_receipts={$receipts->count()} stuck_runs={$stuck->count()} ai_off_handoffs={$orphaned}");

        return self::SUCCESS;
    }
}
