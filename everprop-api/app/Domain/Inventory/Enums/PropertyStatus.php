<?php

namespace App\Domain\Inventory\Enums;

enum PropertyStatus: string
{
    case AVAILABLE = 'AVAILABLE';
    case RESERVED = 'RESERVED';
    case SOLD = 'SOLD';
    case RENTED = 'RENTED';
    case NOT_SELLABLE = 'NOT_SELLABLE';
    case NOT_MARKETED = 'NOT_MARKETED';
    case UNKNOWN = 'UNKNOWN';
}
