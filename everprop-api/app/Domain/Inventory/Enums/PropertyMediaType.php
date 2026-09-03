<?php

namespace App\Domain\Inventory\Enums;

enum PropertyMediaType: string
{
    case IMAGE = 'IMAGE';
    case VIDEO = 'VIDEO';
    case FLOORPLAN = 'FLOORPLAN';
    case DOCUMENT = 'DOCUMENT';
    case VIRTUAL_TOUR = 'VIRTUAL_TOUR';
}
