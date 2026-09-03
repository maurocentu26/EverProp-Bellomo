<?php

namespace App\Domain\Identity\Policies;

use App\Domain\Identity\Enums\Capability;
use App\Domain\Identity\Enums\RoleCode;
use App\Domain\Identity\Services\AuthorizationService;
use App\Models\User;

final class UserPolicy
{
    public function __construct(private readonly AuthorizationService $authorization) {}

    public function viewAny(User $actor): bool
    {
        return $this->authorization->allows($actor, Capability::MANAGE_USERS);
    }

    public function view(User $actor, User $target): bool
    {
        return $this->authorization->allows($actor, Capability::MANAGE_USERS, $target);
    }

    public function create(User $actor): bool
    {
        return $this->authorization->allows($actor, Capability::MANAGE_USERS);
    }

    public function update(User $actor, User $target): bool
    {
        if ($target->role() === RoleCode::SUPER_ADMIN && $actor->role() !== RoleCode::SUPER_ADMIN) {
            return false;
        }

        return $this->authorization->allows($actor, Capability::MANAGE_USERS, $target);
    }

    public function delete(User $actor, User $target): bool
    {
        return ! $actor->is($target)
            && $target->role() !== RoleCode::SUPER_ADMIN
            && $this->authorization->allows($actor, Capability::MANAGE_USERS, $target);
    }
}
