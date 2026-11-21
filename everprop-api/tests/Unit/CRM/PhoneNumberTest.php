<?php

namespace Tests\Unit\CRM;

use App\Domain\CRM\Support\PhoneNumber;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;

/** EVP-135/EVP-176: any province with or without 0/15, any country with + or 00; no area code is refused, not guessed. */
final class PhoneNumberTest extends TestCase
{
    /** @return array<string, array{string, ?string}> */
    public static function phones(): array
    {
        return [
            'CABA landline' => ['11 5555-0000', '+5491155550000'],
            'CABA mobile with 15' => ['011 15 5555-0000', '+5491155550000'],
            'Córdoba with trunk 0' => ['0351 422-1234', '+5493514221234'],
            'Córdoba mobile with 15' => ['0351 15 422-1234', '+5493514221234'],
            'Salta mobile with 15' => ['0387 15 412-3456', '+5493874123456'],
            'Jujuy mobile with 0 and 15' => ['0388 15 412-3456', '+5493884123456'],
            'Jujuy mobile without 0' => ['388 15 412-3456', '+5493884123456'],
            '+54 without 9 in Jujuy' => ['+54 388 412-3456', '+5493884123456'],
            '+54 without 9 in Córdoba' => ['+54 351 422 1234', '+5493514221234'],
            '54 without 9 nor plus in Salta' => ['54 387 412 3456', '+5493874123456'],
            'international mobile' => ['+54 9 11 5555-0000', '+5491155550000'],
            'international without plus' => ['5491155550000', '+5491155550000'],
            '00 prefix' => ['0054 11 5555 0000', '+5491155550000'],
            'USA' => ['+1 (415) 555-0100', '+14155550100'],
            'Bolivia' => ['+591 71234567', '+59171234567'],
            'Bolivia with 00' => ['00591 71234567', '+59171234567'],
            'no area code' => ['422-1234', null],
            'no area code mobile' => ['15 412-3456', null],
            'letters' => ['llamar a la tarde', null],
        ];
    }

    #[DataProvider('phones')]
    public function test_phones_become_e164_or_are_refused(string $typed, ?string $expected): void
    {
        $this->assertSame($expected, PhoneNumber::e164($typed));
    }

    public function test_the_label_is_the_international_format(): void
    {
        $this->assertSame('+54 9 388 412-3456', PhoneNumber::international('0388 15 412-3456'));
    }
}
