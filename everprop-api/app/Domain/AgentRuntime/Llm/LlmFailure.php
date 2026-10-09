<?php

namespace App\Domain\AgentRuntime\Llm;

use RuntimeException;

/**
 * $billable: the request may have reached the provider (timeout, 5xx, connection reset) so its
 * cost is UNKNOWN and the reservation stays until reconciled. $retryable: one retry is allowed.
 */
final class LlmFailure extends RuntimeException
{
    public function __construct(public readonly string $errorCode, public readonly bool $retryable, public readonly bool $billable)
    {
        parent::__construct($errorCode);
    }
}
