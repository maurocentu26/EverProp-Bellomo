<?php

namespace App\Domain\Inventory\Enums;

enum PropertyCategory: string
{
    case LOT = 'LOT';
    case GARAGE = 'GARAGE';
    case LOCAL = 'LOCAL';
    case TRADITIONAL = 'TRADITIONAL';
    case APARTMENT = 'APARTMENT';
    case HOUSE = 'HOUSE';
}
