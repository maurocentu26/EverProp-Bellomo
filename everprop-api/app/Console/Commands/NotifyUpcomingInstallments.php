<?php

namespace App\Console\Commands;

use App\Domain\Collections\CollectionEmail;
use App\Domain\Collections\CollectionMailer;
use Carbon\CarbonImmutable;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;

/**
 * EVP-31 + EVP-53: the Ecogas-style sequence for each unpaid installment, each notice at most once: a few days before
 * (UPCOMING), on the due date (DUE_TODAY) and a few days after (PAST_DUE, only for recent due dates). Runs hourly for the
 * one tenant this deployment provisioned; it acts from the configured local hour on, and since every notice goes out at
 * most once, later runs the same day only pick up what is left.
 */
final class NotifyUpcomingInstallments extends Command
{
    protected $signature = 'everprop:collections:notify-upcoming {--dry-run : List what would be sent; nothing is sent or stored}';

    protected $description = 'Email the installment notice sequence (before, on and after the due date) for the provisioned tenant';

    public function handle(CollectionEmail $email, CollectionMailer $mailer): int
    {
        $slug = config('collections_mail.tenant');
        $tenant = $slug ? DB::table('tenants')->where('slug', $slug)->where('status', 'ACTIVE')->first() : null;
        if (! $tenant) {
            $this->line('No tenant provisioned for collection emails.');

            return self::SUCCESS;
        }
        $dryRun = (bool) $this->option('dry-run');
        if (! $dryRun && ($blocker = $mailer->blocker($tenant))) {
            $this->line("Not sending: {$blocker}");

            return self::SUCCESS;
        }
        $now = CarbonImmutable::now($tenant->timezone);
        if (! $dryRun && $now->hour < (int) config('collections_mail.upcoming_hour')) {
            return self::SUCCESS;
        }
        $limit = max(1, (int) config('collections_mail.max_per_run'));
        [$pastDueFrom, $pastDueUntil] = $email->pastDueWindow($now);
        $windows = [
            CollectionEmail::DUE_TODAY => [$now->toDateString(), $now->toDateString()],
            CollectionEmail::PAST_DUE => [$pastDueFrom, $pastDueUntil],
            CollectionEmail::UPCOMING => [$now->addDay()->toDateString(),
                $now->addDays(max(0, (int) config('collections_mail.upcoming_days')))->toDateString()],
        ];
        $counts = [CollectionMailer::SENT => 0, CollectionMailer::UNKNOWN => 0, CollectionMailer::SKIPPED => 0];
        $handled = 0;
        foreach ($windows as $kind => [$from, $until]) {
            if ($handled >= $limit) {
                break;
            }
            // Candidates only; eligibility (balance, state, email) is decided again under lock when claiming. Paid
            // installments and contacts without an email are filtered here too: skipped rows leave no audit trail, so
            // they would come back first on every run and use up the cap ahead of installments that do need a notice.
            $ids = $email->query($tenant->id)->whereNull('i.cancelled_at')->where('a.status', 'ACTIVE')
                ->whereRaw('i.amount_expected > COALESCE(p.paid, 0)')->whereNotNull('c.email')->where('c.email', '<>', '')
                ->whereBetween('i.due_date', [$from, $until])
                ->whereNotExists(fn ($q) => $q->from('collection_email_attempts as e')->whereColumn('e.tenant_id', 'i.tenant_id')
                    ->whereColumn('e.installment_id', 'i.id')->whereIn('e.kind', CollectionEmail::alreadyCovered($kind)))
                ->orderBy('i.due_date')->orderBy('i.id')->limit($limit - $handled)
                ->pluck('i.id');
            foreach ($ids as $id) {
                $handled++;
                if ($dryRun) {
                    $row = $email->query($tenant->id)->where('i.id', $id)->first();
                    $preview = $row ? $email->preview($row, $tenant, $kind) : null;
                    $this->line(($preview['eligible'] ?? false) ? "would send: {$preview['subject']}" : 'skip: '.($preview['reason'] ?? 'not found'));

                    continue;
                }
                $counts[$mailer->deliver($tenant, (int) $id, $kind)]++;
            }
        }
        $this->info(sprintf('Installment notices: %d sent, %d unknown, %d skipped.', $counts[CollectionMailer::SENT],
            $counts[CollectionMailer::UNKNOWN], $counts[CollectionMailer::SKIPPED]));

        if (! $dryRun && $counts[CollectionMailer::SKIPPED] >= $limit) {
            // A whole run of rows that cannot be sent would starve the ones behind them: make it visible.
            $this->error('Every candidate in this run was skipped: review unresolved attempts and contact emails.');

            return self::FAILURE;
        }

        return $counts[CollectionMailer::UNKNOWN] > 0 ? self::FAILURE : self::SUCCESS;
    }
}
