<?php

namespace App\Domain\Conversations\Services;

use App\Domain\Conversations\Exceptions\DeliveryAmbiguous;
use App\Domain\Conversations\Transports\TransportRegistry;
use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Throwable;

/**
 * Sends one outbound job with fencing (ADR D10/D11):
 * 1. claim: under the conversation row lock, verify the job's epoch is still current and the
 *    conversation is under bot control (bot jobs) or human control (human jobs); set PROCESSING
 *    with a nonce and lease. A stale job is cancelled instead of sent.
 * 2. send: outside any transaction.
 * 3. settle: record SENT / RETRY / FAILED / UNKNOWN and complete a pending takeover.
 */
final class OutboundDispatcher
{
    public function __construct(
        private readonly TransportRegistry $transports,
        private readonly ConversationControl $control,
        private readonly ChannelPolicy $policy,
    ) {}

    /** @return string final job status after this attempt */
    public function dispatch(int $tenantId, int $jobId): string
    {
        $claim = DB::transaction(fn (): array => $this->claim($tenantId, $jobId), 3);
        if ($claim['status'] !== 'PROCESSING') {
            return $claim['status'];
        }

        try {
            $result = $this->transports->for($claim['channel']['channel_type'])
                ->send($claim['channel'], $claim['recipient'], $claim['text'], $claim['nonce'], $claim['media'], $claim['template']);
            $status = $result->accepted ? 'SENT' : ($result->retryable && $claim['attempt'] < $claim['max_attempts'] ? 'RETRY' : 'FAILED');
            $this->settle($tenantId, $claim, $status, $result->providerMessageId, $result->errorCode);
        } catch (DeliveryAmbiguous) {
            $status = 'UNKNOWN';
            $this->settle($tenantId, $claim, $status, null, 'DELIVERY_UNKNOWN');
        } catch (Throwable $e) {
            // Unexpected local failure before/while calling the provider: treat as ambiguous.
            report($e);
            $status = 'UNKNOWN';
            $this->settle($tenantId, $claim, $status, null, 'DELIVERY_UNKNOWN');
        }

        return $status;
    }

    /** @return array<string, mixed> */
    private function claim(int $tenantId, int $jobId): array
    {
        $job = DB::table('outbound_jobs')->where('tenant_id', $tenantId)->where('id', $jobId)->first();
        if ($job === null || ! in_array($job->status, ['PENDING', 'RETRY'], true)) {
            return ['status' => $job->status ?? 'MISSING'];
        }
        // Same lock order as ConversationControl: conversation first, then job.
        $conversation = $this->control->lock($tenantId, (int) $job->conversation_id);
        $job = DB::table('outbound_jobs')->where('tenant_id', $tenantId)->where('id', $jobId)->lockForUpdate()->first();
        if (! in_array($job->status, ['PENDING', 'RETRY'], true)) {
            return ['status' => $job->status];
        }

        $isBot = $job->control_epoch !== null;
        $allowed = $isBot
            ? (int) $job->control_epoch === (int) $conversation->control_epoch && (in_array($conversation->control_state, ConversationControl::BOT_STATES, true)
                // The handoff notice is written under the epoch that moved control to WAITING_HUMAN.
                || ($conversation->control_state === 'WAITING_HUMAN' && (json_decode((string) $job->payload_json, true)['handoff_notice'] ?? false) === true))
            : $conversation->control_state === 'HUMAN_ACTIVE' && (int) $conversation->controlled_by_user_id === (int) $job->requested_by_user_id
                // Re-check the author at send time: a deactivated or downgraded user no longer speaks for the tenant.
                && DB::table('users')->where('tenant_id', $tenantId)->where('id', $job->requested_by_user_id)->where('status', 'ACTIVE')
                    ->whereNull('deleted_at')->whereIn('role_code', ['TENANT_ADMIN', 'SALES_MANAGER', 'SALES_ADVISOR'])->exists();
        if (! $allowed) {
            DB::table('outbound_jobs')->where('tenant_id', $tenantId)->where('id', $jobId)->update(['status' => 'CANCELLED', 'last_error_code' => 'STALE_CONTROL']);
            DB::table('messages')->where('tenant_id', $tenantId)->where('id', $job->message_id)->update(['delivery_status' => 'CANCELLED']);

            return ['status' => 'CANCELLED'];
        }

        // Channel rules at send time (Plan W2): a job queued inside the WhatsApp window may outlive it.
        // Checked before PROCESSING, so an error here leaves the job retryable instead of UNKNOWN.
        $channel = (array) DB::table('channel_accounts')->where('tenant_id', $tenantId)->where('id', $job->channel_account_id)->first();
        $template = json_decode((string) $job->payload_json, true)['template'] ?? null;
        $blocked = $this->policy->check($tenantId, (int) $job->conversation_id, $channel, is_array($template) ? (string) $template['name'] : null);
        if ($blocked !== null) {
            $now = CarbonImmutable::now('UTC')->format('Y-m-d H:i:s.v');
            DB::table('outbound_jobs')->where('tenant_id', $tenantId)->where('id', $jobId)->update(['status' => 'FAILED', 'last_error_code' => $blocked]);
            DB::table('messages')->where('tenant_id', $tenantId)->where('id', $job->message_id)
                ->update(['delivery_status' => 'FAILED', 'failed_at' => $now, 'provider_error_code' => $blocked]);

            return ['status' => 'FAILED'];
        }

        $nonce = (string) Str::uuid();
        $now = CarbonImmutable::now('UTC');
        DB::table('outbound_jobs')->where('tenant_id', $tenantId)->where('id', $jobId)->update([
            'status' => 'PROCESSING', 'attempt_count' => DB::raw('attempt_count + 1'), 'dispatch_nonce' => $nonce,
            'locked_at' => $now->format('Y-m-d H:i:s.v'), 'locked_by' => gethostname() ?: 'worker',
            'lease_expires_at' => $now->addSeconds((int) config('conversations.dispatch_lease_seconds', 60))->format('Y-m-d H:i:s.v'),
        ]);

        // Reply to the exact identity of this thread, never to "the contact's latest number".
        $recipient = str_starts_with((string) $conversation->provider_thread_id, 'wa:')
            ? substr((string) $conversation->provider_thread_id, 3)
            : (string) $conversation->provider_thread_id;

        return [
            'status' => 'PROCESSING', 'job_id' => $jobId, 'nonce' => $nonce, 'conversation_id' => (int) $job->conversation_id,
            'message_id' => (int) $job->message_id, 'channel' => $channel, 'recipient' => $recipient,
            'text' => (string) DB::table('messages')->where('tenant_id', $tenantId)->where('id', $job->message_id)->value('text_body'),
            'media' => $this->media($tenantId, (int) $job->conversation_id, (int) $job->message_id),
            'template' => is_array($template) ? ['name' => (string) $template['name'], 'language' => (string) $template['language'],
                'params' => array_values(array_map('strval', (array) ($template['params'] ?? [])))] : null,
            'attempt' => (int) $job->attempt_count + 1, 'max_attempts' => (int) $job->max_attempts,
        ];
    }

    /**
     * The attachment of the message, with its bytes, for transports that upload it (WhatsApp).
     *
     * @return array{kind: string, mime: string, name: string, contents: string}|null
     */
    private function media(int $tenantId, int $conversationId, int $messageId): ?array
    {
        $media = json_decode((string) DB::table('messages')->where('tenant_id', $tenantId)->where('id', $messageId)->value('media_json'), true);
        if (! is_array($media)) {
            return null;
        }
        $contents = app(ConversationAttachments::class)->contents($tenantId, $conversationId, $media);

        return ['kind' => (string) $media['kind'], 'mime' => (string) $media['mime'], 'name' => (string) $media['name'], 'contents' => $contents];
    }

    /** @param array<string, mixed> $claim */
    private function settle(int $tenantId, array $claim, string $status, ?string $providerMessageId, ?string $errorCode): void
    {
        DB::transaction(function () use ($tenantId, $claim, $status, $providerMessageId, $errorCode): void {
            $this->control->lock($tenantId, $claim['conversation_id']);
            $now = CarbonImmutable::now('UTC');
            // Only the holder of the current nonce may settle. A slow worker whose lease the reconciler
            // expired (UNKNOWN/LEASE_EXPIRED) still records the real outcome instead of losing it.
            $updated = DB::table('outbound_jobs')->where('tenant_id', $tenantId)->where('id', $claim['job_id'])
                ->where('dispatch_nonce', $claim['nonce'])
                ->where(fn ($q) => $q->where('status', 'PROCESSING')->orWhere(fn ($u) => $u->where('status', 'UNKNOWN')->where('last_error_code', 'LEASE_EXPIRED')))
                ->update([
                    'status' => $status, 'provider_message_id' => $providerMessageId, 'last_error_code' => $errorCode,
                    'sent_at' => $status === 'SENT' ? $now->format('Y-m-d H:i:s.v') : null,
                    'scheduled_at' => $status === 'RETRY' ? $now->addSeconds(min(300, 5 * (2 ** $claim['attempt'])))->format('Y-m-d H:i:s.v') : DB::raw('scheduled_at'),
                    'lease_expires_at' => null,
                ]);
            if ($updated === 0) {
                return;
            }
            DB::table('messages')->where('tenant_id', $tenantId)->where('id', $claim['message_id'])->update(array_filter([
                'delivery_status' => match ($status) {
                    'SENT' => 'SENT', 'FAILED' => 'FAILED', 'UNKNOWN' => 'UNKNOWN', default => 'QUEUED'
                },
                'provider_message_id' => $providerMessageId,
                'sent_at' => $status === 'SENT' ? $now->format('Y-m-d H:i:s.v') : null,
                'failed_at' => $status === 'FAILED' ? $now->format('Y-m-d H:i:s.v') : null,
                'provider_error_code' => $errorCode,
            ], fn ($v) => $v !== null));
            if ($status !== 'UNKNOWN') {
                $this->control->settleTransition($tenantId, $claim['conversation_id']);
            }
        }, 3);
    }

    /**
     * Manual, audited resolution of an UNKNOWN send (UNKNOWN_FINAL). Never resends; it only frees a
     * pending takeover. The advisor is warned the message may still arrive late.
     */
    public function resolveUnknown(int $tenantId, int $jobId, int $userId): void
    {
        DB::transaction(function () use ($tenantId, $jobId, $userId): void {
            $job = DB::table('outbound_jobs')->where('tenant_id', $tenantId)->where('id', $jobId)->first();
            if ($job === null || $job->status !== 'UNKNOWN') {
                return;
            }
            $this->control->lock($tenantId, (int) $job->conversation_id);
            DB::table('outbound_jobs')->where('tenant_id', $tenantId)->where('id', $jobId)->where('status', 'UNKNOWN')
                ->update(['status' => 'UNKNOWN_FINAL', 'last_error_message' => 'Resuelto manualmente por usuario '.$userId]);
            DB::table('audit_logs')->insert([
                'tenant_id' => $tenantId, 'actor_user_id' => $userId, 'actor_type' => 'USER', 'action_code' => 'OUTBOUND_UNKNOWN_FINAL',
                'entity_type' => 'OUTBOUND_JOB', 'entity_id' => $jobId, 'occurred_at' => now(),
            ]);
            $this->control->settleTransition($tenantId, (int) $job->conversation_id);
        }, 3);
    }
}
