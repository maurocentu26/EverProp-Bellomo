<?php

namespace App\Domain\Identity\Policies;

use App\Domain\Identity\Enums\Capability;
use App\Domain\Identity\Services\AuthorizationService;
use App\Models\User;
use Illuminate\Database\Eloquent\Model;

abstract class AbstractTenantPolicy
{
    public function __construct(protected readonly AuthorizationService $authorization) {}

    public function viewAny(User $user): bool
    {
        return $this->authorization->allows($user, Capability::VIEW_ANY);
    }

    public function view(User $user, Model $resource): bool
    {
        return $this->authorization->allows($user, Capability::VIEW, $resource);
    }

    public function create(User $user): bool
    {
        return $this->authorization->allows($user, Capability::CREATE);
    }

    public function update(User $user, Model $resource): bool
    {
        return $this->authorization->allows($user, Capability::UPDATE, $resource);
    }

    public function delete(User $user, Model $resource): bool
    {
        return $this->authorization->allows($user, Capability::DELETE, $resource);
    }

    public function publish(User $user, Model $resource): bool
    {
        return $this->authorization->allows($user, Capability::PUBLISH, $resource);
    }

    public function assign(User $user, Model $resource): bool
    {
        return $this->authorization->allows($user, Capability::ASSIGN, $resource);
    }
}
