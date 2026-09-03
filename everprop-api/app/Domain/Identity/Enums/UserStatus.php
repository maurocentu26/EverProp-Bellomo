<?php

namespace App\Domain\Identity\Enums;

enum UserStatus: string
{
    case ACTIVE = 'ACTIVE';
    case PAUSED = 'PAUSED';
    case DISABLED = 'DISABLED';
}
