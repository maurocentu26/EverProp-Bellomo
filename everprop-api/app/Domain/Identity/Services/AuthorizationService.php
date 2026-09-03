<?php

namespace App\Domain\Identity\Services;

use App\Domain\Identity\Enums\Capability;
use App\Domain\Identity\Enums\RoleCode;
use App\Domain\Tenancy\TenantContext;
use App\Models\User;
use Illuminate\Auth\Access\AuthorizationException;
use Illuminate\Database\Eloquent\Model;

final readonly class AuthorizationService
{
    public function __construct(private TenantContext $tenantContext) {}

    public function allows(User $user, Capability $capability, ?Model $resource = null): bool
    {
        if (! $user->isActive()) {
            return false;
        }

        if ($this->tenantContext->isPlatform()) {
            return $user->role() === RoleCode::SUPER_ADMIN
                && $user->hasCapability($capability);
        }

        if ((int) $user->tenant_id !== $this->tenantContext->id()) {
            return false;
        }

        if ($resource !== null) {
            $resourceTenantId = $resource->getAttribute('tenant_id');

            if ($resourceTenantId === null || (int) $resourceTenantId !== $this->tenantContext->id()) {
                return false;
            }
        }

        return $user->hasCapability($capability);
    }

    public function authorize(User $user, Capability $capability, ?Model $resource = null): void
    {
        if (! $this->allows($user, $capability, $resource)) {
            throw new AuthorizationException('This action is unauthorized.');
        }
    }
}
