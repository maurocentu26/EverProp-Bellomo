<?php

namespace App\Domain\Tenancy\Exceptions;

use Symfony\Component\HttpKernel\Exception\NotFoundHttpException;

final class TenantNotResolved extends NotFoundHttpException
{
    public static function forRequest(): self
    {
        return new self('Resource not found.');
    }
}
