<?php

namespace App\Domain\Tenancy\Exceptions;

use LogicException;

final class CrossTenantOperation extends LogicException
{
    public static function detected(): self
    {
        return new self('A cross-tenant operation was blocked.');
    }
}
