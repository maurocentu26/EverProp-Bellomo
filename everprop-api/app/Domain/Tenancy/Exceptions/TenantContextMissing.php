<?php

namespace App\Domain\Tenancy\Exceptions;

use LogicException;

final class TenantContextMissing extends LogicException
{
    public static function forTenantOperation(): self
    {
        return new self('A tenant context is required for this operation.');
    }
}
