<?php

namespace App\Domain\Tenancy\Enums;

enum TenantStatus: string
{
    case ACTIVE = 'ACTIVE';
    case SUSPENDED = 'SUSPENDED';
    case ARCHIVED = 'ARCHIVED';
}
