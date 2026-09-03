<?php

namespace App\Domain\Inventory\Policies;

use App\Domain\Inventory\Models\Property;
use App\Domain\Inventory\Models\PropertyFeature;
use App\Domain\Inventory\Services\InventoryAccess;
use App\Models\User;

final class PropertyFeaturePolicy
{
    public function __construct(private readonly InventoryAccess $access) {}

    public function view(User $user, PropertyFeature $feature): bool
    {
        return $this->access->canView($user, $feature->property);
    }

    public function viewAny(User $user, Property $property): bool
    {
        return $this->access->canView($user, $property);
    }

    public function create(User $user, Property $property): bool
    {
        return $this->access->canUpdate($user, $property);
    }

    public function update(User $user, PropertyFeature $feature): bool
    {
        return $this->access->canUpdate($user, $feature->property);
    }

    public function delete(User $user, PropertyFeature $feature): bool
    {
        return $this->access->canDelete($user, $feature->property);
    }
}
