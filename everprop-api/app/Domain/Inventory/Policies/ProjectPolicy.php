<?php

namespace App\Domain\Inventory\Policies;

use App\Domain\Inventory\Models\Project;
use App\Domain\Inventory\Services\InventoryAccess;
use App\Models\User;

final class ProjectPolicy
{
    public function __construct(private readonly InventoryAccess $access) {}

    public function viewAny(User $user): bool
    {
        return $this->access->canViewAny($user);
    }

    public function view(User $user, Project $project): bool
    {
        return $this->access->canView($user, $project);
    }

    public function create(User $user): bool
    {
        return $this->access->canCreate($user);
    }

    public function update(User $user, Project $project): bool
    {
        return $this->access->canUpdate($user, $project);
    }

    public function delete(User $user, Project $project): bool
    {
        return $this->access->canDelete($user, $project);
    }

    public function publish(User $user, Project $project): bool
    {
        return $this->access->canPublish($user, $project);
    }
}
