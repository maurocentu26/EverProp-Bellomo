<?php

namespace App\Domain\Inventory\Enums;

enum PropertyStatus: string
{
    case AVAILABLE = 'AVAILABLE';
    case RESERVED = 'RESERVED';
    case SOLD = 'SOLD';
    case RENTED = 'RENTED';
}
