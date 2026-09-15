<?php

namespace App\Domain\CRM;

use App\Domain\Identity\Enums\RoleCode;
use App\Models\User;

final class VisitPolicy
{
    public function viewAny(User $user, int $tenantId): bool
    {
        return $user->isActive() && (int) $user->tenant_id === $tenantId
            && in_array($user->role(), [RoleCode::TENANT_ADMIN, RoleCode::SALES_MANAGER, RoleCode::SALES_ADVISOR, RoleCode::READ_ONLY], true);
    }
}
