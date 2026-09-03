<?php

namespace App\Domain\Inventory\Enums;

enum ProjectType: string
{
    case LAND_DEVELOPMENT = 'LAND_DEVELOPMENT';
    case BUILDING = 'BUILDING';
    case COMMERCIAL = 'COMMERCIAL';
}
