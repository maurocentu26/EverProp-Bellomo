<?php

namespace App\Domain\Integrations\Exceptions;

use RuntimeException;

final class WebhookRejected extends RuntimeException
{
    public function __construct(
        public readonly string $publicCode,
        public readonly int $httpStatus,
        string $safeMessage,
    ) {
        parent::__construct($safeMessage);
    }
}
