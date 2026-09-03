<?php

namespace Tests\Unit\CRM;

use App\Domain\CRM\Support\PayloadFingerprint;
use PHPUnit\Framework\TestCase;

final class PayloadFingerprintTest extends TestCase
{
    public function test_associative_key_order_does_not_change_the_fingerprint(): void
    {
        $first = [
            'lead' => ['priority' => 'HIGH', 'source_kind' => 'PROPERTY_INQUIRY'],
            'contact' => ['email' => 'person@example.test'],
        ];
        $second = [
            'contact' => ['email' => 'person@example.test'],
            'lead' => ['source_kind' => 'PROPERTY_INQUIRY', 'priority' => 'HIGH'],
        ];

        self::assertSame(PayloadFingerprint::make($first), PayloadFingerprint::make($second));
    }

    public function test_list_order_remains_significant(): void
    {
        self::assertNotSame(
            PayloadFingerprint::make(['values' => ['a', 'b']]),
            PayloadFingerprint::make(['values' => ['b', 'a']]),
        );
    }

    public function test_a_changed_value_changes_the_fingerprint(): void
    {
        self::assertNotSame(
            PayloadFingerprint::make(['priority' => 'NORMAL']),
            PayloadFingerprint::make(['priority' => 'URGENT']),
        );
    }
}
