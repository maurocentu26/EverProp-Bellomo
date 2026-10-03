<?php

namespace App\Domain\Conversations\Jobs;

use App\Domain\Conversations\Services\MetaWebhookProcessor;
use Carbon\CarbonImmutable;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Support\Facades\DB;
use Throwable;

/**
 * Applies a WhatsApp webhook change stored durably before the 200 (Plan W6, invariant 7). The change
 * is idempotent, so a redelivery or a reconciler requeue never duplicates messages or statuses.
 */
final class ProcessMetaWebhookReceipt implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable;

    /** While PROCESSING, next_attempt_at is the lease: the reconciler only takes it back after it expires. */
    public const LEASE_MINUTES = 15;

    /** A processed change is already in `messages`; the receipt keeps only its digest (no client text). */
    public const REDACTED = '{"redacted":true}';

    public int $tries = 5;

    public function __construct(public readonly int $tenantId, public readonly int $receiptId) {}

    /** @return list<int> */
    public function backoff(): array
    {
        return [5, 30, 120, 300];
    }

    public function handle(MetaWebhookProcessor $processor): void
    {
        $receipt = DB::transaction(function (): ?object {
            $row = DB::table('webhook_receipts')->where('tenant_id', $this->tenantId)->where('id', $this->receiptId)
                ->where('provider', 'META')->lockForUpdate()->first(['raw_payload', 'processing_status', 'integration_id']);
            // Only RECEIVED/RETRY are claimable: a receipt another worker holds (PROCESSING) is left alone.
            if ($row === null || ! in_array($row->processing_status, ['RECEIVED', 'RETRY'], true)) {
                return null;
            }
            DB::table('webhook_receipts')->where('tenant_id', $this->tenantId)->where('id', $this->receiptId)->update([
                'processing_status' => 'PROCESSING', 'attempt_count' => DB::raw('attempt_count + 1'),
                'next_attempt_at' => CarbonImmutable::now('UTC')->addMinutes(self::LEASE_MINUTES)->format('Y-m-d H:i:s.v'),
            ]);

            return $row;
        });
        if ($receipt === null) {
            return;
        }

        try {
            $stored = json_decode((string) $receipt->raw_payload, true, 64, JSON_THROW_ON_ERROR);
            // A receipt that is not what the controller stored must surface (RETRY → DEAD_LETTER), never "process" as empty.
            if (! is_array($stored) || ! is_array($stored['value'] ?? null)) {
                throw new \UnexpectedValueException('INVALID_RECEIPT');
            }
            // The number may have changed hands since the receipt was stored: never apply it to another tenant.
            $phone = $stored['value']['metadata']['phone_number_id'] ?? null;
            $channel = $processor->channelFor(is_scalar($phone) ? (string) $phone : '');
            if ($channel === null || (int) $channel->tenant_id !== $this->tenantId || (int) $channel->integration_id !== (int) $receipt->integration_id) {
                $this->mark('REJECTED', 'CHANNEL_CHANGED', null, ['PROCESSING']);

                return;
            }
            if (! $processor->messages($stored['value'], is_string($stored['waba_id'] ?? null) ? $stored['waba_id'] : null, $this->tenantId, (int) $receipt->integration_id)) {
                $this->mark('REJECTED', 'CHANNEL_CHANGED', null, ['PROCESSING']);

                return;
            }
        } catch (Throwable $error) {
            $this->mark('RETRY', class_basename($error), CarbonImmutable::now('UTC')->addSeconds($this->backoff()[min($this->attempts() - 1, 3)] ?? 300), ['PROCESSING']);
            throw $error;
        }
        $this->mark('PROCESSED', null, null, ['PROCESSING']);
    }

    public function failed(?Throwable $error): void
    {
        $this->mark('DEAD_LETTER', $error === null ? 'FAILED' : class_basename($error), null, ['PROCESSING', 'RETRY']);
    }

    /** @param list<string> $from transitions are conditional, so a late RETRY/DEAD_LETTER never overwrites PROCESSED */
    private function mark(string $status, ?string $errorCode, ?CarbonImmutable $nextAttempt, array $from): void
    {
        $changes = [
            'processing_status' => $status,
            'last_error_code' => $errorCode === null ? null : mb_substr($errorCode, 0, 80),
            'next_attempt_at' => $nextAttempt?->format('Y-m-d H:i:s.v'),
        ];
        if ($status === 'PROCESSED') {
            $changes['processed_at'] = CarbonImmutable::now('UTC')->format('Y-m-d H:i:s.v');
        }
        if (in_array($status, ['PROCESSED', 'REJECTED'], true)) {
            $changes['raw_payload'] = self::REDACTED;
        }
        DB::table('webhook_receipts')->where('tenant_id', $this->tenantId)->where('id', $this->receiptId)
            ->whereIn('processing_status', $from)->update($changes);
    }
}
