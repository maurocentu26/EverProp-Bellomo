<?php

namespace App\Domain\Inventory\Enums;

enum ProjectStatus: string
{
    case PLANNING = 'PLANNING';
    case PRE_SALE = 'PRE_SALE';
    case UNDER_CONSTRUCTION = 'UNDER_CONSTRUCTION';
    case COMPLETED = 'COMPLETED';

    /** @return list<string> */
    public static function publicValues(): array
    {
        return [
            self::PRE_SALE->value,
            self::UNDER_CONSTRUCTION->value,
            self::COMPLETED->value,
        ];
    }
}
