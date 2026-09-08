<?php

namespace App\Domain\Collections;

use App\Domain\Identity\Enums\RoleCode;
use App\Models\User;

final class CollectionsPolicy
{
    public function view(User $user, int $tenantId, ?object $lead = null): bool
    {
        return $user->isActive() && (int) $user->tenant_id === $tenantId
            && in_array($user->role(), [RoleCode::TENANT_ADMIN, RoleCode::SALES_MANAGER, RoleCode::SALES_ADVISOR, RoleCode::READ_ONLY], true)
            && ($lead === null || ((int) $lead->tenant_id === $tenantId
                && ($user->role() !== RoleCode::SALES_ADVISOR || (int) $lead->assigned_user_id === (int) $user->id)));
    }

    public function write(User $user, int $tenantId, object $lead): bool
    {
        return $this->view($user, $tenantId, $lead) && $user->role() !== RoleCode::READ_ONLY;
    }

    public function reverse(User $user, int $tenantId, object $lead): bool
    {
        return $this->view($user, $tenantId, $lead)
            && in_array($user->role(), [RoleCode::TENANT_ADMIN, RoleCode::SALES_MANAGER], true);
    }
}
