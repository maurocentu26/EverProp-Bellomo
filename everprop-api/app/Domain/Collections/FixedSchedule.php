<?php

namespace App\Domain\Collections;

use Carbon\CarbonImmutable;

final class FixedSchedule
{
    // Convert validated, two-decimal inputs to integer cents before doing arithmetic.
    public static function cents(string|int|float $amount): int
    {
        $parts = explode('.', (string) $amount);

        return (int) $parts[0] * 100 + (int) str_pad(substr($parts[1] ?? '', 0, 2), 2, '0');
    }

    public static function decimal(int $cents): string
    {
        return intdiv($cents, 100).'.'.str_pad((string) ($cents % 100), 2, '0', STR_PAD_LEFT);
    }

    /** @return list<array{installment_number:int,due_date:string,amount_expected:string}> */
    public static function make(int $balance, int $months, string $rate, string $start, int $dueDay): array
    {
        $rateParts = explode('.', $rate);
        $rateUnits = (int) $rateParts[0] * 10000 + (int) str_pad(substr($rateParts[1] ?? '', 0, 4), 4, '0');
        // Flat monthly interest on initial principal, matching Bellomo's calculator.
        $interest = intdiv($balance * $rateUnits + 500000, 1000000);
        $principal = intdiv($balance, $months);
        $remainder = $balance % $months;
        $base = CarbonImmutable::parse($start)->startOfMonth();
        $rows = [];
        for ($number = 1; $number <= $months; $number++) {
            $month = $base->addMonthsNoOverflow($number);
            $rows[] = [
                'installment_number' => $number,
                'due_date' => $month->day(min($dueDay, $month->daysInMonth))->toDateString(),
                'amount_expected' => self::decimal($principal + ($number <= $remainder ? 1 : 0) + $interest),
            ];
        }

        return $rows;
    }
}
