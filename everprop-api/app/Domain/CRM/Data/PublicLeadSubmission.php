<?php

namespace App\Domain\CRM\Data;

final readonly class PublicLeadSubmission
{
    public function __construct(
        public string $leadPublicId,
        public bool $leadCreated,
        public bool $assigned,
        public bool $replayed,
        public bool $propertyLinked,
    ) {}
}
