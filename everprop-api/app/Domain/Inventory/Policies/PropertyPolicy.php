<?php

namespace App\Domain\Inventory\Policies;

use App\Domain\Inventory\Models\Property;
use App\Domain\Inventory\Services\InventoryAccess;
use App\Models\User;

final class PropertyPolicy
{
    public function __construct(private readonly InventoryAccess $access) {}

    public function viewAny(User $user): bool
    {
        return $this->access->canViewAny($user);
    }

    public function view(User $user, Property $property): bool
    {
        return $this->access->canView($user, $property);
    }

    public function create(User $user): bool
    {
        return $this->access->canCreate($user);
    }

    public function update(User $user, Property $property): bool
    {
        return $this->access->canUpdate($user, $property);
    }

    public function delete(User $user, Property $property): bool
    {
        return $this->access->canDelete($user, $property);
    }

    public function publish(User $user, Property $property): bool
    {
        return $this->access->canPublish($user, $property);
    }

    public function managePrices(User $user, Property $property): bool
    {
        return $this->access->canManagePrices($user, $property);
    }

    public function setInitialPrices(User $user): bool
    {
        return $this->access->canSetInitialPrices($user);
    }
}
