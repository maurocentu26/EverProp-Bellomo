<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;

/**
 * EVP-148: domain_outbox is the transactional outbox (ADR D10) kept for its future consumer (D20, signed events for
 * n8n/webhooks) and, meanwhile, an idempotency ledger (reopen keys, webhook dedupe). Nothing consumes it yet, so
 * rows past the retention are deleted daily. In-flight rows (PROCESSING, RETRY) are never touched.
 */
final class PruneDomainOutbox extends Command
{
    /** Shorter than this would reopen the idempotency windows that still read the table (reopen retries, Meta redeliveries). */
    public const MIN_RETENTION_DAYS = 7;

    protected $signature = 'everprop:outbox:prune {--days= : Retention in days (defaults to conversations.outbox_retention_days)}';

    protected $description = 'Delete domain_outbox events older than the retention (pending, published or dead-letter only)';

    public function handle(): int
    {
        $days = (int) ($this->option('days') ?? config('conversations.outbox_retention_days'));
        if ($days < self::MIN_RETENTION_DAYS) {
            $this->error('Retention must be at least '.self::MIN_RETENTION_DAYS.' days.');

            return self::FAILURE;
        }
        // created_at has no index: find the boundary once, then delete in small batches inside that primary key range.
        // The date is checked again per row: ids follow insertion, but a recent row below the boundary must survive.
        $cutoff = now('UTC')->subDays($days)->format('Y-m-d H:i:s.v');
        $boundary = DB::table('domain_outbox')->where('created_at', '<', $cutoff)->max('id');
        $deleted = 0;
        if ($boundary !== null) {
            do {
                $batch = DB::table('domain_outbox')->where('id', '<=', $boundary)->where('created_at', '<', $cutoff)
                    ->whereIn('status', ['PENDING', 'PUBLISHED', 'DEAD_LETTER'])->orderBy('id')->limit(1000)->delete();
                $deleted += $batch;
            } while ($batch === 1000);
        }
        $this->info("Deleted {$deleted} outbox events older than {$days} days.");

        return self::SUCCESS;
    }
}
