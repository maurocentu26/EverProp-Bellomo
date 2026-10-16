<?php

namespace App\Console\Commands;

use App\Domain\Collections\CollectionEmail;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\Schema;
use Throwable;

final class EmailCollection extends Command
{
    protected $signature = 'everprop:collections:email {tenant : Trusted tenant slug} {installment : Public installment UUID} {--send : Send one approved reminder; default is preview only}';

    protected $description = 'Preview one collection email; delivery requires explicitly provisioned SMTP and --send';

    public function handle(CollectionEmail $email): int
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
        $mailer = config('collections_mail.mailer');
        if (! $preview['deliveryEnabled'] || ! filter_var($preview['sender'], FILTER_VALIDATE_EMAIL)
            || ! filter_var(config('collections_mail.reply_to'), FILTER_VALIDATE_EMAIL)
            || config("mail.mailers.{$mailer}.transport") !== 'smtp'
            || ! config("mail.mailers.{$mailer}.host") || ! Schema::hasTable('collection_email_attempts')) {
            $this->error('Delivery is disabled or SMTP, sender, reply-to or audit schema is not provisioned.');

            return self::FAILURE;
        }
        // Same tenant lock used by payment/reversal mutations: recheck before claiming.
        $claim = DB::transaction(function () use ($tenant, $row, $email) {
            $active = DB::table('tenants')->where('id', $tenant->id)->lockForUpdate()->first();
            if (! $active || $active->status !== 'ACTIVE'
                || DB::table('collection_email_attempts')->where('tenant_id', $tenant->id)
                    ->where('installment_id', $row->id)->whereIn('status', ['SENDING', 'UNKNOWN'])->exists()) {
                return null;
            }
            $fresh = $email->query($tenant->id)->where('i.id', $row->id)->first();
            $preview = $fresh ? $email->preview($fresh, $tenant) : null;
            if (! $preview || ! $preview['eligible']) {
                return null;
            }
            $inserted = DB::table('collection_email_attempts')->insertOrIgnore([
                'tenant_id' => $tenant->id, 'installment_id' => $row->id, 'business_date' => $preview['businessDate'],
                'status' => 'SENDING', 'recipient' => $preview['recipient'], 'sender' => $preview['sender'],
                'remaining_amount' => $preview['amountRemaining'],
            ]);

            return $inserted ? $preview : null;
        });
        if (! $claim) {
            $this->warn('Not eligible, already attempted today, or an unresolved attempt exists. No email sent.');

            return self::SUCCESS;
        }
        $attempt = DB::table('collection_email_attempts')->where('tenant_id', $tenant->id)
            ->where('installment_id', $row->id)->where('business_date', $claim['businessDate']);
        try {
            $sent = Mail::mailer($mailer)->raw($claim['body'], function ($message) use ($claim) {
                $message->to($claim['recipient'])->from($claim['sender'], config('collections_mail.from_name'))
                    ->replyTo(config('collections_mail.reply_to'))->subject($claim['subject']);
            });
            if (! $sent) {
                throw new \RuntimeException('Transport did not acknowledge submission.');
            }
            $attempt->update(['status' => 'SENT', 'sent_at' => now()]);
            $this->info('SMTP accepted the reminder. Inbox delivery is not confirmed.');

            return self::SUCCESS;
        } catch (Throwable) {
            // SMTP timeout can mean accepted: do not retry automatically or log credentials/PII.
            $attempt->update(['status' => 'UNKNOWN']);
            $this->error('Delivery outcome unknown. Review provider logs before any further attempt.');

            return self::FAILURE;
        }
    }
}
