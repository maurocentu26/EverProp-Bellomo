<?php

namespace App\Console\Commands;

use App\Jobs\SendWebPush;
use App\Models\User;
use Carbon\CarbonImmutable;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;

final class NotifyCollections extends Command
{
    protected $signature = 'everprop:collections:notify {tenant? : Trusted tenant slug; omitted = every ACTIVE tenant}';

    protected $description = 'Persist due/overdue advisor notifications once per installment, recipient and business day';

    public function handle(): int
    {
        $tenants = DB::table('tenants')->where('status', 'ACTIVE')
            ->when($this->argument('tenant') !== null, fn ($q) => $q->where('slug', $this->argument('tenant')))
            ->orderBy('id')->get();
        if ($this->argument('tenant') !== null && $tenants->isEmpty()) {
            $this->error('Active tenant not found.');

            return self::FAILURE;
        }
        $failed = false;
        foreach ($tenants as $tenant) {
            // One broken tenant must not stop notifications for the others.
            try {
                $this->notifyTenant($tenant);
            } catch (\Throwable $e) {
                report($e);
                $this->error("{$tenant->slug}: notifications failed.");
                $failed = true;
            }
        }

        return $failed ? self::FAILURE : self::SUCCESS;
    }

    private function notifyTenant(object $tenant): void
    {
        $now = CarbonImmutable::now($tenant->timezone);
        $today = $now->toDateString();
        // Push only for installments due in the last 10 days, fixed on purpose: widening the email window must never
        // turn the first run into a burst of pushes for months of backlog (the bell still lists them all).
        $pushFrom = $now->subDays(10)->toDateString();
        $paid = DB::table('installment_payments')->where('tenant_id', $tenant->id)->whereNull('reversed_at')
            ->selectRaw('installment_id, SUM(amount) as paid')->groupBy('installment_id');
        $query = DB::table('installments as i')->where('i.tenant_id', $tenant->id)
            ->join('payment_agreements as a', function ($join) {
                $join->on('a.id', '=', 'i.agreement_id')->on('a.tenant_id', '=', 'i.tenant_id');
            })->join('leads as l', function ($join) {
                $join->on('l.id', '=', 'a.lead_id')->on('l.tenant_id', '=', 'a.tenant_id');
            })->join('users as u', function ($join) {
                $join->on('u.id', '=', 'l.assigned_user_id')->on('u.tenant_id', '=', 'a.tenant_id');
            })->leftJoinSub($paid, 'p', 'p.installment_id', '=', 'i.id')
            ->where('a.status', 'ACTIVE')->whereNull('i.cancelled_at')->whereNull('l.deleted_at')
            ->where('u.status', 'ACTIVE')->whereNull('u.deleted_at')
            ->whereIn('u.role_code', ['SALES_ADVISOR', 'SALES_MANAGER', 'TENANT_ADMIN'])
            ->where('i.due_date', '<=', $today)->whereRaw('i.amount_expected > COALESCE(p.paid,0)')
            ->select('i.id', 'i.due_date', 'i.installment_number', 'l.public_id as lead_public_id', 'u.id as user_id');
        $count = 0;
        foreach ($query->orderBy('i.id')->cursor() as $row) {
            $overdue = $row->due_date < $today;
            // Deterministic primary key makes concurrent workers and scheduler retries safe. EVP-53: once per
            // installment, advisor and stage (due today, then overdue), not again every day: a bell that repeats
            // the same debt daily stops being read. Cobranzas keeps the live list.
            $stage = $overdue ? 'overdue' : 'due_today';
            $hash = md5("collections:{$tenant->id}:{$row->id}:{$row->user_id}:{$stage}");
            $id = self::uuid($hash);
            // ponytail: deploy-day bridge. The old key was per day; if today's run already stored one with it, do not
            // add a second alert (and push) for the same installment. Harmless and removable after the first day.
            $legacy = self::uuid(md5("collections:{$tenant->id}:{$row->id}:{$row->user_id}:{$today}"));
            if (DB::table('notifications')->where('id', $legacy)->exists()) {
                continue;
            }
            $inserted = DB::table('notifications')->insertOrIgnore([
                'id' => $id, 'type' => 'collections.installment', 'notifiable_type' => User::class,
                'notifiable_id' => $row->user_id,
                'data' => json_encode([
                    'tenant_id' => $tenant->id, 'title' => $overdue ? 'Cuota en mora' : 'Cuota vence hoy',
                    'message' => "Cuota {$row->installment_number}: vencimiento ".CarbonImmutable::parse($row->due_date)->format('d/m/Y').'. Consultá el saldo actualizado en Cobranzas.',
                    'lead_id' => $row->lead_public_id, 'event_type' => $overdue ? 'installment_overdue' : 'installment_due_today',
                    'action_url' => '/admin/cobranzas?status='.($overdue ? 'overdue' : 'dueToday'),
                ], JSON_THROW_ON_ERROR), 'created_at' => now(), 'updated_at' => now(),
            ]);
            $count += $inserted;
            // Rows are written directly (deterministic ids), so the NotificationSent listener never fires: queue the
            // push here. Only for recent due dates, so the first run never buzzes phones with months of backlog.
            if ($inserted > 0 && $row->due_date >= $pushFrom && config('webpush.private_key')) {
                try {
                    SendWebPush::dispatch((int) $tenant->id, (int) $row->user_id, $id)->onConnection(config('webpush.connection'));
                } catch (\Throwable $error) {
                    report($error); // the bell entry is already stored; a queue outage must not stop the run
                }
            }
        }
        $this->info("{$tenant->slug}: created {$count} notifications.");
    }

    private static function uuid(string $hash): string
    {
        return substr($hash, 0, 8).'-'.substr($hash, 8, 4).'-'.substr($hash, 12, 4).'-'.substr($hash, 16, 4).'-'.substr($hash, 20);
    }
}
