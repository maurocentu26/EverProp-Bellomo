<?php

namespace App\Domain\Integrations\Data;

final readonly class WebhookReceiptAcceptance
{
    public function __construct(
        public int $receiptId,
        public string $status,
        public bool $replayed,
    ) {}
}
