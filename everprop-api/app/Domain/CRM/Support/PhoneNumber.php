<?php

namespace App\Domain\CRM\Support;

/**
 * EVP-135: phones typed in the panel ("11 5555-0000", "0351 422-1234", "+54 9 11 ...") become E.164 so they match
 * WhatsApp and the PHONE identity used for de-duplication. National numbers default to Argentina (+54).
 */
final class PhoneNumber
{
    /** Null when the number is ambiguous or invalid: the caller asks for it again instead of guessing. */
    public static function e164(string $raw): ?string
    {
        $raw = trim($raw);
        $digits = (string) preg_replace('/\D/', '', $raw);
        if (str_starts_with($raw, '+') || str_starts_with($digits, '00')) {
            $digits = str_starts_with($raw, '+') ? $digits : substr($digits, 2);

            return preg_match('/\A[1-9][0-9]{7,14}\z/', $digits) === 1 ? '+'.$digits : null;
        }
        // Already international without "+": Argentine national numbers have 10 digits, so 12-13 starting with 54 is +54.
        if (str_starts_with($digits, '54') && in_array(strlen($digits), [12, 13], true)) {
            return '+'.$digits;
        }
        // ponytail: a local mobile with "15" (0388 15 412-3456) is rejected, not rewritten: where the area code ends is ambiguous.
        $digits = str_starts_with($digits, '0') ? substr($digits, 1) : $digits;

        return preg_match('/\A[1-9][0-9]{9}\z/', $digits) === 1 ? '+54'.$digits : null;
    }
}
