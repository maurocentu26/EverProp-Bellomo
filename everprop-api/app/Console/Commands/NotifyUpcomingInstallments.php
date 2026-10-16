<?php

namespace App\Console\Commands;

use App\Domain\Collections\CollectionEmail;
use App\Domain\Collections\CollectionMailer;
use Carbon\CarbonImmutable;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;

/**
 * EVP-31: emails each client once, a few days before an installment falls due (like a utility's digital invoice).
 * Runs hourly for the one tenant this deployment provisioned; it acts from the configured local hour on, and since
 * every installment is notified at most once, later runs the same day only pick up what is left.
 */
final class NotifyUpcomingInstallments extends Command
{
    protected $signature = 'everprop:collections:notify-upcoming {--dry-run : List what would be sent; nothing is sent or stored}';

    protected $description = 'Email upcoming-installment notices for the provisioned tenant (at most once per installment)';

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
        $until = $now->addDays(max(0, (int) config('collections_mail.upcoming_days')))->toDateString();
        // Candidates only; eligibility (balance, state, email) is decided again under lock when claiming. Paid
        // installments and contacts without an email are filtered here too: skipped rows leave no audit trail, so
        // they would come back first on every run and use up the cap ahead of installments that do need a notice.
        $ids = $email->query($tenant->id)->whereNull('i.cancelled_at')->where('a.status', 'ACTIVE')
            ->whereRaw('i.amount_expected > COALESCE(p.paid, 0)')->whereNotNull('c.email')->where('c.email', '<>', '')
            ->whereBetween('i.due_date', [$now->toDateString(), $until])
            ->whereNotExists(fn ($q) => $q->from('collection_email_attempts as e')->whereColumn('e.tenant_id', 'i.tenant_id')
                ->whereColumn('e.installment_id', 'i.id')->where('e.kind', CollectionEmail::UPCOMING))
            ->orderBy('i.due_date')->orderBy('i.id')->limit($limit)
            ->pluck('i.id');

        $counts = [CollectionMailer::SENT => 0, CollectionMailer::UNKNOWN => 0, CollectionMailer::SKIPPED => 0];
        foreach ($ids as $id) {
            if ($dryRun) {
                $row = $email->query($tenant->id)->where('i.id', $id)->first();
                $preview = $row ? $email->preview($row, $tenant, CollectionEmail::UPCOMING) : null;
                $this->line(($preview['eligible'] ?? false) ? "would send: {$preview['subject']}" : 'skip: '.($preview['reason'] ?? 'not found'));

                continue;
            }
            $counts[$mailer->deliver($tenant, (int) $id, CollectionEmail::UPCOMING)]++;
        }
        $this->info(sprintf('Upcoming notices: %d sent, %d unknown, %d skipped.', $counts[CollectionMailer::SENT],
            $counts[CollectionMailer::UNKNOWN], $counts[CollectionMailer::SKIPPED]));

        if (! $dryRun && $counts[CollectionMailer::SKIPPED] >= $limit) {
            // A whole run of rows that cannot be sent would starve the ones behind them: make it visible.
            $this->error('Every candidate in this run was skipped: review unresolved attempts and contact emails.');

            return self::FAILURE;
        }

        return $counts[CollectionMailer::UNKNOWN] > 0 ? self::FAILURE : self::SUCCESS;
    }
}
