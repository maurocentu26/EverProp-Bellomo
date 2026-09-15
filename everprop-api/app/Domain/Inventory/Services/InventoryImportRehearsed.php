<?php

namespace App\Domain\Inventory\Services;

use RuntimeException;

final class InventoryImportRehearsed extends RuntimeException
{
    /** @param array<string, int> $counts */
    public function __construct(public readonly array $counts)
    {
        parent::__construct('Import rehearsal completed and rolled back');
    }
}
