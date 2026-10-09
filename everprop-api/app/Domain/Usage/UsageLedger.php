<?php

namespace App\Domain\Usage;

use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\DB;
use RuntimeException;

/**
 * Budget ledger (ADR D14). Reserve the maximum possible cost BEFORE a billable call, then commit
 * the real cost or release. Reservations are serialized per billing period with a row lock on
 * usage_budget_locks so concurrent tenants/channels cannot overspend the platform cap.
 * Amounts are micro-USD. UNKNOWN keeps its reservation until reconciled.
 */
final class UsageLedger
{
    /** @return array{status: string, replayed: bool} */
    public function reserve(int $tenantId, string $operationKey, string $category, int $maxMicros, ?CarbonImmutable $at = null): array
    {
        $period = ($at ?? CarbonImmutable::now('UTC'))->format('Y-m');

        // Created outside the transaction: INSERT IGNORE on an existing row takes a shared lock that
        // would turn concurrent reservations into S->X deadlocks.
        if (! DB::table('usage_budget_locks')->where('period', $period)->exists()) {
            DB::table('usage_budget_locks')->insertOrIgnore(['period' => $period]);
        }

        return DB::transaction(function () use ($tenantId, $operationKey, $category, $maxMicros, $period): array {
            DB::table('usage_budget_locks')->where('period', $period)->lockForUpdate()->first();

            $existing = DB::table('usage_ledger')->where('tenant_id', $tenantId)->where('operation_key', $operationKey)->first(['status']);
            if ($existing !== null) {
                return ['status' => (string) $existing->status, 'replayed' => true];
            }

            if ($this->spent($period, null) + $maxMicros > (int) config('usage.global_cap_micros')
                || $this->spent($period, $tenantId) + $maxMicros > $this->tenantCap($tenantId)) {
                throw new QuotaExceeded('QUOTA_EXCEEDED');
            }

            DB::table('usage_ledger')->insert([
                'tenant_id' => $tenantId, 'operation_key' => $operationKey, 'category' => $category, 'period' => $period,
                'reserved_micros' => $maxMicros, 'status' => 'RESERVED',
            ]);

            return ['status' => 'RESERVED', 'replayed' => false];
        }, 3);
    }

    public function commit(int $tenantId, string $operationKey, int $actualMicros): void
    {
        $this->transition($tenantId, $operationKey, ['RESERVED', 'UNKNOWN'], ['status' => 'COMMITTED', 'actual_micros' => $actualMicros]);
    }

    public function release(int $tenantId, string $operationKey): void
    {
        $this->transition($tenantId, $operationKey, ['RESERVED'], ['status' => 'RELEASED', 'actual_micros' => 0]);
    }

    public function markUnknown(int $tenantId, string $operationKey): void
    {
        $this->transition($tenantId, $operationKey, ['RESERVED'], ['status' => 'UNKNOWN']);
    }

    /** Committed real cost + outstanding reservations (RESERVED/UNKNOWN keep their maximum). */
    public function spent(string $period, ?int $tenantId): int
    {
        return (int) DB::table('usage_ledger')->where('period', $period)
            ->when($tenantId !== null, fn ($q) => $q->where('tenant_id', $tenantId))
            ->whereIn('status', ['RESERVED', 'UNKNOWN', 'COMMITTED'])
            ->sum(DB::raw("CASE WHEN status = 'COMMITTED' THEN actual_micros ELSE reserved_micros END"));
    }

    private function tenantCap(int $tenantId): int
    {
        $settings = json_decode((string) DB::table('tenants')->where('id', $tenantId)->value('settings_json'), true) ?: [];

        return (int) ($settings['usage']['monthly_cap_micros'] ?? config('usage.default_tenant_cap_micros'));
    }

    /** @param list<string> $from
     * @param array<string, mixed> $changes */
    private function transition(int $tenantId, string $operationKey, array $from, array $changes): void
    {
        $updated = DB::table('usage_ledger')->where('tenant_id', $tenantId)->where('operation_key', $operationKey)
            ->whereIn('status', $from)->update($changes);
        if ($updated === 0 && ! DB::table('usage_ledger')->where('tenant_id', $tenantId)->where('operation_key', $operationKey)->exists()) {
            throw new RuntimeException('Unknown usage operation.');
        }
    }
}
