<?php

namespace App\Domain\Integrations\Exceptions;

/** A connection attempt that must stop; the message is safe to show (no tokens, no provider text). */
final class OnboardingFailed extends \RuntimeException
{
    public function __construct(public readonly string $reason, string $message, public readonly int $status)
    {
        parent::__construct($message);
    }
}
