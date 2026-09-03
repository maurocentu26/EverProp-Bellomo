<?php

namespace App\Domain\Inventory\Enums;

enum PropertyOperation: string
{
    case SALE = 'SALE';
    case RENT = 'RENT';
    case TEMPORARY = 'TEMPORARY';
}
