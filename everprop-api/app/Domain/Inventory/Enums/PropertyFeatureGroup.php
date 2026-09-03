<?php

namespace App\Domain\Inventory\Enums;

enum PropertyFeatureGroup: string
{
    case SERVICE = 'SERVICE';
    case AMENITY = 'AMENITY';
    case COMMERCIAL = 'COMMERCIAL';
    case STRUCTURAL = 'STRUCTURAL';
    case OTHER = 'OTHER';
}
