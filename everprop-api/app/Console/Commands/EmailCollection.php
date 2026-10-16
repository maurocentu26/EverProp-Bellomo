<?php

namespace App\Console\Commands;

use App\Domain\Collections\CollectionEmail;
use App\Domain\Collections\CollectionMailer;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;

final class EmailCollection extends Command
{
    protected $signature = 'everprop:collections:email {tenant : Trusted tenant slug} {installment : Public installment UUID} {--send : Send one approved reminder; default is preview only}';

    protected $description = 'Preview one overdue-installment reminder; delivery requires explicitly provisioned SMTP and --send';

    public function handle(CollectionEmail $email, CollectionMailer $mailer): int
    {
        $tenant = DB::table('tenants')->where('slug', $this->argument('tenant'))->where('status', 'ACTIVE')->first();
        if (! $tenant) {
            $this->error('Active tenant not found.');

            return self::FAILURE;
        }
        $row = $email->query($tenant->id)->where('i.public_id', $this->argument('installment'))->first();
        if (! $row) {
            $this->error('Installment not found in this tenant.');

            return self::FAILURE;
        }
        $preview = $email->preview($row, $tenant);
        if (! $this->option('send')) {
            $this->line($preview['subject']);
            $this->line($preview['body']);
            $this->info($preview['reason'] ?? 'Eligible. Preview only; no email sent.');

            return self::SUCCESS;
        }
        if ($blocker = $mailer->blocker($tenant)) {
            $this->error("Delivery is not possible: {$blocker}");

            return self::FAILURE;
        }

        return match ($mailer->deliver($tenant, (int) $row->id, CollectionEmail::OVERDUE)) {
            CollectionMailer::SENT => $this->done('SMTP accepted the reminder. Inbox delivery is not confirmed.'),
            CollectionMailer::UNKNOWN => $this->unknown(),
            default => $this->skipped(),
        };
    }

    private function done(string $message): int
    {
        $this->info($message);

        return self::SUCCESS;
    }

    private function unknown(): int
    {
        $this->error('Delivery outcome unknown. Review provider logs before any further attempt.');

        return self::FAILURE;
    }

    private function skipped(): int
    {
        $this->warn('Not eligible, already attempted today, or an unresolved attempt exists. No email sent.');

        return self::SUCCESS;
    }
}
