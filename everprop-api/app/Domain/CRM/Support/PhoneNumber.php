<?php

namespace App\Domain\CRM\Support;

use libphonenumber\NumberParseException;
use libphonenumber\PhoneNumber as ParsedNumber;
use libphonenumber\PhoneNumberFormat;
use libphonenumber\PhoneNumberType;
use libphonenumber\PhoneNumberUtil;

/**
 * EVP-135/EVP-176: phones typed in the panel ("11 5555-0000", "0388 15 412-3456", "+591 7...", "0054 ...") become
 * E.164 so they match WhatsApp and the PHONE identity used for de-duplication. National numbers default to Argentina;
 * libphonenumber resolves the trunk 0 and the mobile 15 for every area code.
 */
final class PhoneNumber
{
    /** Null when the number is invalid or lacks its area code: the caller asks for it again instead of guessing. */
    public static function e164(string $raw): ?string
    {
        $number = self::parse($raw);

        return $number === null ? null : PhoneNumberUtil::getInstance()->format($number, PhoneNumberFormat::E164);
    }

    /** Readable label ("+54 9 388 412-3456") for a lead created with only its phone. */
    public static function international(string $raw): ?string
    {
        $number = self::parse($raw);

        return $number === null ? null : PhoneNumberUtil::getInstance()->format($number, PhoneNumberFormat::INTERNATIONAL);
    }

    private static function parse(string $raw): ?ParsedNumber
    {
        $util = PhoneNumberUtil::getInstance();
        try {
            $number = $util->parse(trim($raw), 'AR');
        } catch (NumberParseException) {
            return null;
        }

        if (! $util->isValidNumber($number)) {
            return null;
        }
        // Argentine mobiles are +549 (WhatsApp); "11 5555-0000" and "+54 9 11 5555-0000" must be one identity.
        // ponytail: without the 15 a landline is indistinguishable from a mobile, so a landline whose +549 variant is a
        // valid mobile range also gets the 9; upgrade path: ask fixed/mobile in the form if landlines ever matter.
        $national = (string) $number->getNationalNumber();
        if ($number->getCountryCode() === 54 && ! str_starts_with($national, '9')) {
            $mobile = (clone $number)->setNationalNumber('9'.$national);
            if ($util->isValidNumber($mobile) && $util->getNumberType($mobile) === PhoneNumberType::MOBILE) {
                return $mobile;
            }
        }

        return $number;
    }
}
