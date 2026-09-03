<?php

namespace App\Domain\CRM\Support;

use JsonException;

final class PayloadFingerprint
{
    /**
     * @param  array<string, mixed>  $payload
     *
     * @throws JsonException
     */
    public static function make(array $payload): string
    {
        self::sortRecursively($payload);

        return hash('sha256', json_encode(
            $payload,
            JSON_THROW_ON_ERROR | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_PRESERVE_ZERO_FRACTION,
        ));
    }

    /** @param array<mixed> $value */
    private static function sortRecursively(array &$value): void
    {
        if (! array_is_list($value)) {
            ksort($value, SORT_STRING);
        }

        foreach ($value as &$item) {
            if (is_array($item)) {
                self::sortRecursively($item);
            }
        }
    }
}
