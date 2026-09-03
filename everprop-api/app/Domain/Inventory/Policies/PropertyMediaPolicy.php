<?php

namespace App\Domain\Inventory\Policies;

use App\Domain\Inventory\Models\Property;
use App\Domain\Inventory\Models\PropertyMedia;
use App\Domain\Inventory\Services\InventoryAccess;
use App\Models\User;

final class PropertyMediaPolicy
{
    public function __construct(private readonly InventoryAccess $access) {}

    public function view(User $user, PropertyMedia $media): bool
    {
        return $this->access->canView($user, $media->property);
    }

    public function viewAny(User $user, Property $property): bool
    {
        return $this->access->canView($user, $property);
    }

    public function create(User $user, Property $property): bool
    {
        return $this->access->canUpdate($user, $property);
    }

    public function update(User $user, PropertyMedia $media): bool
    {
        return $this->access->canUpdate($user, $media->property);
    }

    public function delete(User $user, PropertyMedia $media): bool
    {
        return $this->access->canDelete($user, $media->property);
    }
}
