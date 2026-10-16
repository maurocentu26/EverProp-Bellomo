<?php

namespace App\Domain\AgentRuntime\Tools;

use RuntimeException;

/** A contract error returned to the model as {ok:false, error:{code, message, retryable}}. */
final class ToolError extends RuntimeException
{
    public const CODES = ['VALIDATION_ERROR', 'NOT_FOUND', 'FORBIDDEN', 'VERSION_CONFLICT', 'IDEMPOTENCY_CONFLICT', 'STALE_CONTROL',
        'QUOTA_EXCEEDED', 'DEPENDENCY_UNAVAILABLE', 'TIMEOUT', 'DELIVERY_UNKNOWN'];

    public function __construct(public readonly string $errorCode, string $message, public readonly bool $retryable = false)
    {
        parent::__construct($message);
    }
}
