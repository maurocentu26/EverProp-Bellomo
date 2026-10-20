<?php

namespace App\Console\Commands;

use App\Domain\CRM\Notifications\FollowUpNotification;
use App\Models\User;
use Carbon\CarbonImmutable;
use Illuminate\Console\Command;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;

/**
 * EVP-50: hourly follow-up alerts for open leads (days 2, 5, 8 and 10 since the last contact, managers from day 8)
 * and one warm nudge per day to advisors who have not opened the panel in 1 to 3 days. Every alert is claimed with
 * a unique row (or an atomic UPDATE for nudges) before notifying, so overlapping runs never send it twice.
 */
final class SendFollowUpAlerts extends Command
{
    protected $signature = 'everprop:leads:follow-up-alerts';

    protected $description = 'Notify advisors and managers about leads without follow-up and nudge inactive advisors';

    /** Lead alert level by minimum days since the last contact, highest first. */
    private const LEVELS = [10 => 'DAY10', 8 => 'DAY8', 5 => 'DAY5', 2 => 'DAY2'];

    /** Leads quiet for longer than this are past the 10-day cycle and are not alerted again. */
    private const WINDOW_DAYS = 11;

    /** Above this many new alerts in one run an advisor gets one summary instead of one alert per lead. */
    private const MAX_SINGLE_ALERTS = 3;

    public const FOLLOW_UP_URL = '/admin/leads?seguimiento=1';

    public function handle(): int
    {
        $now = CarbonImmutable::now('UTC');
        $sent = 0;
        foreach (DB::table('tenants')->where('status', 'ACTIVE')->get(['id', 'timezone']) as $tenant) {
            $sent += $this->leadAlerts((int) $tenant->id, $now);
            $sent += $this->nudges((int) $tenant->id, (string) $tenant->timezone, $now);
        }
        $this->info("Follow-up notifications sent: {$sent}.");

        return self::SUCCESS;
    }

    private function leadAlerts(int $tenantId, CarbonImmutable $now): int
    {
        // Same clock as the panel (lead-follow-up.ts): the last commercial contact the advisor logged (notes do not
        // count), or the lead's creation when there is none. A client writing again does not restart it.
        $contacts = DB::table('lead_follow_ups')->where('tenant_id', $tenantId)->where('type', '<>', 'note')
            ->groupBy('tenant_id', 'lead_id')->selectRaw('tenant_id, lead_id, MAX(occurred_at) AS contacted_at');
        $leads = DB::table('leads as l')
            ->join('users as u', fn ($j) => $j->on('u.tenant_id', '=', 'l.tenant_id')->on('u.id', '=', 'l.assigned_user_id'))
            ->leftJoin('contacts as c', fn ($j) => $j->on('c.tenant_id', '=', 'l.tenant_id')->on('c.id', '=', 'l.contact_id'))
            ->leftJoinSub($contacts, 'f', fn ($j) => $j->on('f.tenant_id', '=', 'l.tenant_id')->on('f.lead_id', '=', 'l.id'))
            ->where('l.tenant_id', $tenantId)->where('l.is_open', 1)->whereNull('l.deleted_at')
            ->where('u.status', 'ACTIVE')->whereNull('u.deleted_at')
            ->whereRaw('COALESCE(f.contacted_at, l.created_at) BETWEEN ? AND ?', [$now->subDays(self::WINDOW_DAYS), $now->subDays(2)])
            ->orderBy('l.id')
            ->selectRaw('l.id, l.public_id, l.assigned_user_id, u.display_name AS advisor, c.display_name, COALESCE(f.contacted_at, l.created_at) AS touch_at')
            ->get();

        $byAdvisor = [];
        $forManagers = [];
        foreach ($leads as $lead) {
            $days = (int) floor(CarbonImmutable::parse($lead->touch_at, 'UTC')->diffInDays($now));
            $level = collect(self::LEVELS)->first(fn (string $level, int $min) => $days >= $min);
            if ($level === null || ! $this->claim($tenantId, (int) $lead->id, (int) $lead->assigned_user_id, $level, $lead->touch_at)) {
                continue;
            }
            $byAdvisor[(int) $lead->assigned_user_id][] = [$lead, $level];
            if (in_array($level, ['DAY8', 'DAY10'], true)) {
                $forManagers[] = [$lead, $level];
            }
        }

        $sent = 0;
        $users = $this->users($tenantId, array_keys($byAdvisor));
        foreach ($byAdvisor as $userId => $alerts) {
            if (! $user = $users->get($userId)) {
                continue;
            }
            if (count($alerts) > self::MAX_SINGLE_ALERTS) {
                $count = count($alerts);
                $user->notify(new FollowUpNotification('FOLLOW_UP_SUMMARY', "Tenés {$count} leads sin seguimiento",
                    "Hay {$count} leads que necesitan tu contacto. Revisalos desde la bandeja y retomá los más antiguos primero.",
                    "Tenés {$count} leads esperando tu contacto. Entrá y retomalos.", self::FOLLOW_UP_URL));
                $sent++;

                continue;
            }
            foreach ($alerts as [$lead, $level]) {
                $user->notify($this->leadNotification($lead, $level));
                $sent++;
            }
        }

        return $sent + $this->managerAlerts($tenantId, $forManagers);
    }

    private function leadNotification(object $lead, string $level): FollowUpNotification
    {
        $name = trim((string) $lead->display_name) ?: 'este cliente';
        [$title, $message, $push] = match ($level) {
            'DAY2' => ['Un lead espera tu contacto', "Pasaron 2 días sin seguimiento con {$name}. Un mensaje hoy puede hacer la diferencia.",
                'Pasaron 2 días sin seguimiento con un lead. Un mensaje hoy puede hacer la diferencia.'],
            'DAY5' => ['Este lead se está enfriando', "Van 5 días sin seguimiento con {$name}. Retomalo antes de que se pierda.",
                'Van 5 días sin seguimiento con un lead. Retomalo antes de que se pierda.'],
            'DAY8' => ['Quedan 2 días de seguimiento', "{$name} lleva 8 días sin contacto. En 2 días vence el plazo de seguimiento.",
                'Un lead lleva 8 días sin contacto. En 2 días vence el plazo de seguimiento.'],
            default => ['Venció el seguimiento', "Pasaron 10 días sin contacto con {$name}. Retomalo hoy o pedí que lo reasignen.",
                'Venció el plazo de seguimiento de un lead. Retomalo hoy.'],
        };

        return new FollowUpNotification('FOLLOW_UP_'.$level, $title, $message, $push, "/admin/leads/{$lead->public_id}", (string) $lead->public_id);
    }

    /** @param list<array{object, string}> $alerts */
    private function managerAlerts(int $tenantId, array $alerts): int
    {
        if ($alerts === []) {
            return 0;
        }
        $managers = User::query()->where('tenant_id', $tenantId)->where('role_code', 'SALES_MANAGER')
            ->where('status', 'ACTIVE')->whereNull('deleted_at')->get();
        $sent = 0;
        foreach ($managers as $manager) {
            $counts = [];
            foreach ($alerts as [$lead, $level]) {
                if ($this->claim($tenantId, (int) $lead->id, (int) $manager->id, 'MANAGER_'.$level, $lead->touch_at)) {
                    $counts[(string) $lead->advisor][$level] = ($counts[(string) $lead->advisor][$level] ?? 0) + 1;
                }
            }
            if ($counts === []) {
                continue;
            }
            $lines = collect($counts)->map(fn (array $byLevel, string $advisor) => $advisor.': '.collect([
                'DAY8' => fn (int $n) => $n === 1 ? '1 por vencer' : "{$n} por vencer",
                'DAY10' => fn (int $n) => $n === 1 ? '1 vencido' : "{$n} vencidos",
            ])->filter(fn ($label, $level) => isset($byLevel[$level]))->map(fn ($label, $level) => $label($byLevel[$level]))->implode(' y '));
            $manager->notify(new FollowUpNotification('FOLLOW_UP_TEAM', 'Seguimientos de tu equipo',
                'Leads sin contacto en tu equipo. '.$lines->implode(' · ').'.',
                'Hay leads de tu equipo por vencer o vencidos. Revisá el seguimiento.', self::FOLLOW_UP_URL));
            $sent++;
        }

        return $sent;
    }

    private function nudges(int $tenantId, string $timezone, CarbonImmutable $now): int
    {
        $hour = $now->setTimezone($timezone)->hour;
        // Only during the working day: a nudge at night reads as pressure, not as an invitation.
        if ($hour < 10 || $hour >= 19) {
            return 0;
        }
        $advisors = DB::table('users as u')
            ->where('u.tenant_id', $tenantId)->where('u.role_code', 'SALES_ADVISOR')->where('u.status', 'ACTIVE')->whereNull('u.deleted_at')
            ->whereRaw('COALESCE(u.last_active_at, u.last_login_at, u.created_at) BETWEEN ? AND ?', [$now->subDays(4), $now->subDay()])
            ->selectRaw('u.id, COALESCE(u.last_active_at, u.last_login_at, u.created_at) AS active_at')
            ->selectSub(fn ($q) => $q->from('leads as l')->whereColumn('l.tenant_id', 'u.tenant_id')->whereColumn('l.assigned_user_id', 'u.id')
                ->where('l.is_open', 1)->whereNull('l.deleted_at')->selectRaw('COUNT(*)'), 'open_leads')
            ->get();

        $sent = 0;
        $users = $this->users($tenantId, $advisors->pluck('id')->map(fn ($id) => (int) $id)->all());
        foreach ($advisors as $advisor) {
            $days = (int) floor(CarbonImmutable::parse($advisor->active_at, 'UTC')->diffInDays($now));
            $leads = (int) $advisor->open_leads;
            if ($days < 1 || $days > 3 || $leads === 0 || ! ($user = $users->get((int) $advisor->id))) {
                continue;
            }
            // Atomic claim: one nudge per advisor per day even if two runs overlap.
            $claimed = DB::table('users')->where('tenant_id', $tenantId)->where('id', $advisor->id)
                ->where(fn ($q) => $q->whereNull('last_nudged_at')->orWhere('last_nudged_at', '<', $now->subHours(20)))
                ->update(['last_nudged_at' => $now]);
            if ($claimed !== 1) {
                continue;
            }
            [$title, $body] = self::nudgeCopy($days, $leads);
            $user->notify(new FollowUpNotification('REENGAGE', $title, $body, $body, self::FOLLOW_UP_URL));
            $sent++;
        }

        return $sent;
    }

    /** @return array{string, string} */
    public static function nudgeCopy(int $days, int $leads): array
    {
        $count = $leads === 1 ? '1 lead' : "{$leads} leads";

        return match ($days) {
            1 => [$leads === 1 ? 'Te espera 1 lead' : "Te esperan {$count}", 'Retomá donde lo dejaste. Son un par de minutos y tus clientes lo notan.'],
            2 => ['Tu seguimiento se está enfriando', "Hace 2 días que no entrás. Volvé hoy y ponete al día con tus {$count}."],
            default => ['Tus clientes siguen ahí', 'Pasaron 3 días. Entrá, mirá quién espera y arrancamos de nuevo.'],
        };
    }

    /**
     * Claimed before notifying: a crash between the two loses that one alert instead of ever sending it twice.
     * Deliberate: the bell and the next level still reach the advisor, a duplicate push would read as spam.
     */
    private function claim(int $tenantId, int $leadId, int $userId, string $level, string $touchAt): bool
    {
        return DB::table('lead_follow_up_alerts')->insertOrIgnore([
            'tenant_id' => $tenantId, 'lead_id' => $leadId, 'user_id' => $userId, 'level' => $level, 'touch_at' => $touchAt,
        ]) === 1;
    }

    /**
     * @param  list<int>  $ids
     * @return Collection<int, User>
     */
    private function users(int $tenantId, array $ids): Collection
    {
        return $ids === [] ? collect() : User::query()->where('tenant_id', $tenantId)->whereIn('id', $ids)
            ->where('status', 'ACTIVE')->whereNull('deleted_at')->get()->keyBy('id');
    }
}
