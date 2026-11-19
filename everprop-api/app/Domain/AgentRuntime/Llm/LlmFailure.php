<?php

namespace App\Domain\AgentRuntime\Llm;

use Carbon\CarbonImmutable;
use RuntimeException;

/**
 * $billable: the request may have reached the provider (timeout, 5xx, connection reset) so its
 * cost is UNKNOWN and the reservation stays until reconciled. $retryable: one retry is allowed.
 * $retryAfter: seconds the provider asked to wait (Retry-After), when it said so.
 */
final class LlmFailure extends RuntimeException
{
    public function __construct(public readonly string $errorCode, public readonly bool $retryable, public readonly bool $billable, public readonly ?int $retryAfter = null)
    {
        parent::__construct($errorCode);
    }

    /** 429/529: nothing was billed; keep the provider's Retry-After (seconds or HTTP date) when present. */
    public static function rateLimited(?string $retryAfter): self
    {
        $value = trim((string) $retryAfter);
        $seconds = match (true) {
            $value === '' => null,
            ctype_digit($value) => (int) min((int) substr($value, 0, 6), 86400),
            default => rescue(fn (): int => max(0, (int) ceil(CarbonImmutable::now()->diffInSeconds(CarbonImmutable::parse($value), false))), null, false),
        };

        return new self('RATE_LIMITED', retryable: true, billable: false, retryAfter: $seconds);
    }
}
