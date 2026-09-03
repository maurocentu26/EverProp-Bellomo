<?php

namespace App\Domain\CRM\Exceptions;

use RuntimeException;

final class IdempotencyConflict extends RuntimeException
{
    public function __construct()
    {
        parent::__construct('The idempotency key was already used with a different payload.');
    }
}
