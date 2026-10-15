<?php

namespace App\Domain\Usage\Http;

use App\Domain\Conversations\Services\BusinessHours;
use App\Domain\Tenancy\TenantContext;
use App\Domain\Usage\UsageLedger;
use App\Http\Controllers\Controller;
use App\Models\User;
use Carbon\CarbonImmutable;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

/**
 * EVP-23: the Eversys team (SUPER_ADMIN) sees how much the AI spends this month for the tenant it is in, against that
 * tenant's cap. Model cost is the platform's, not the client's: tenant admins don't see it (decision 2026-10-15).
 * Only this tenant's numbers; a cross-tenant view would go through PlatformAccess (separate ticket).
 */
final class AdminUsageController extends Controller
{
    public function show(Request $request, UsageLedger $ledger): JsonResponse
    {
        /** @var User $user */
        $user = $request->user();
        abort_unless($user->role()->isPlatformAdministrator(), 403);
        $data = $request->validate(['period' => ['nullable', 'regex:/\A\d{4}-(0[1-9]|1[0-2])\z/']]);
        $tenantId = app(TenantContext::class)->id();
        $period = $data['period'] ?? CarbonImmutable::now('UTC')->format('Y-m');
        $from = CarbonImmutable::createFromFormat('!Y-m', $period, 'UTC');
        $to = $from->addMonth();
        $timezone = app(BusinessHours::class)->settings($tenantId)['timezone'];

        $spent = $ledger->spent($period, $tenantId);
        $cap = $ledger->tenantCap($tenantId);

        // Per day in the tenant's clock. ponytail: grouped in PHP over the month's rows; fine for pilot volumes,
        // a GROUP BY with a stored local date once a tenant makes tens of thousands of calls a month.
        $days = [];
        foreach (DB::table('usage_ledger')->where('tenant_id', $tenantId)->where('period', $period)
            ->whereIn('status', ['RESERVED', 'UNKNOWN', 'COMMITTED'])->get(['status', 'reserved_micros', 'actual_micros', 'created_at']) as $row) {
            $day = CarbonImmutable::parse($row->created_at, 'UTC')->setTimezone($timezone)->toDateString();
            $days[$day] = ($days[$day] ?? 0) + (int) ($row->status === 'COMMITTED' ? $row->actual_micros : $row->reserved_micros);
        }
        ksort($days);

        $runs = DB::table('chatbot_runs')->where('tenant_id', $tenantId)
            ->where('started_at', '>=', $from->format('Y-m-d H:i:s.v'))->where('started_at', '<', $to->format('Y-m-d H:i:s.v'))
            ->selectRaw("CASE WHEN provider_run_id LIKE 'suggest:%' THEN 'copilot' ELSE 'assistant' END AS kind")
            ->selectRaw('COUNT(*) AS runs, COALESCE(SUM(input_tokens), 0) AS input_tokens, COALESCE(SUM(output_tokens), 0) AS output_tokens')
            ->selectRaw('COALESCE(SUM(estimated_cost), 0) AS cost')
            ->selectRaw("SUM(error_code = 'QUOTA_EXCEEDED') AS blocked")
            ->groupBy('kind')->get()->keyBy('kind');
        $kind = fn (string $k): array => [
            'runs' => (int) ($runs[$k]->runs ?? 0),
            'input_tokens' => (int) ($runs[$k]->input_tokens ?? 0),
            'output_tokens' => (int) ($runs[$k]->output_tokens ?? 0),
            'blocked_by_cap' => (int) ($runs[$k]->blocked ?? 0),
        ];

        return response()->json(['data' => [
            'period' => $period,
            'timezone' => $timezone,
            // Same figure the ledger uses to stop spending: committed cost plus open reservations.
            'spent_usd' => round($spent / 1_000_000, 4),
            'cap_usd' => round($cap / 1_000_000, 2),
            'used_pct' => $cap > 0 ? min(100, round($spent * 100 / $cap, 1)) : null,
            'open_reservations_usd' => round((int) DB::table('usage_ledger')->where('tenant_id', $tenantId)->where('period', $period)
                ->whereIn('status', ['RESERVED', 'UNKNOWN'])->sum('reserved_micros') / 1_000_000, 4),
            'by_day' => array_map(fn (string $day, int $micros) => ['date' => $day, 'usd' => round($micros / 1_000_000, 4)], array_keys($days), $days),
            'assistant' => $kind('assistant'),
            // A copilot draft stopped by its cap fails before any run is stored, so only assistant turns count as blocked.
            'copilot' => array_diff_key($kind('copilot'), ['blocked_by_cap' => true]) + [
                'spent_usd' => round((float) ($runs['copilot']->cost ?? 0), 4),
                'cap_usd' => (float) config('conversations.copilot_monthly_usd'),
            ],
        ]]);
    }
}
