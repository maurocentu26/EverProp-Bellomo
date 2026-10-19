<?php

namespace App\Domain\Conversations\Data;

final readonly class SendResult
{
    private function __construct(
        public bool $accepted,
        public ?string $providerMessageId,
        public bool $retryable,
        public ?string $errorCode,
    ) {}

    public static function accepted(?string $providerMessageId): self
    {
        return new self(true, $providerMessageId, false, null);
    }

    /** Definitive provider rejection: the message was not accepted. */
    public static function rejected(string $errorCode, bool $retryable): self
    {
        return new self(false, null, $retryable, $errorCode);
    }
}
