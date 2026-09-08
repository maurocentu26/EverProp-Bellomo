<?php

namespace Tests\Unit\Collections;

use App\Domain\Collections\FixedSchedule;
use PHPUnit\Framework\TestCase;

final class FixedScheduleTest extends TestCase
{
    public function test_rounding_preserves_principal_and_month_end_does_not_roll_into_march(): void
    {
        $rows = FixedSchedule::make(10000, 3, '0', '2026-01-31', 31);
        self::assertSame(['2026-02-28', '2026-03-31', '2026-04-30'], array_column($rows, 'due_date'));
        self::assertSame(['33.34', '33.33', '33.33'], array_column($rows, 'amount_expected'));
        self::assertSame(10000, array_sum(array_map(fn ($row) => FixedSchedule::cents($row['amount_expected']), $rows)));
    }

    public function test_fixed_interest_uses_initial_principal_and_leap_year_is_supported(): void
    {
        $rows = FixedSchedule::make(100000, 10, '3.5', '2028-01-31', 31);
        self::assertSame('135.00', $rows[0]['amount_expected']);
        self::assertSame('2028-02-29', $rows[0]['due_date']);
    }
}
