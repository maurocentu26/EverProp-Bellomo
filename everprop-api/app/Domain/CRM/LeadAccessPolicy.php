<?php

namespace App\Domain\CRM;

use App\Domain\Identity\Enums\RoleCode;
use App\Models\User;

final class LeadAccessPolicy
{
    public function statistics(User $user, int $tenantId): bool
    {
        return $this->viewAny($user, $tenantId) && in_array($user->role(), [RoleCode::TENANT_ADMIN, RoleCode::SALES_MANAGER], true);
    }

    public function assign(User $user, int $tenantId): bool
    {
        return $this->viewAny($user, $tenantId) && in_array($user->role(), [RoleCode::TENANT_ADMIN, RoleCode::SALES_MANAGER, RoleCode::ROTATOR], true);
    }

    public function viewAny(User $user, int $tenantId): bool
    {
        return $user->isActive() && (int) $user->tenant_id === $tenantId
            && in_array($user->role(), [RoleCode::TENANT_ADMIN, RoleCode::SALES_MANAGER, RoleCode::SALES_ADVISOR, RoleCode::ROTATOR, RoleCode::READ_ONLY], true);
    }

    public function view(User $user, int $tenantId, object $lead): bool
    {
        return $this->viewAny($user, $tenantId) && (int) $lead->tenant_id === $tenantId
            && ($user->role() !== RoleCode::SALES_ADVISOR || (int) $lead->assigned_user_id === (int) $user->id);
    }

    /** EVP-177: DNI, CUIT, incomes and guarantor of the extended profile; hidden from READ_ONLY. */
    public function viewSensitiveProfile(User $user, int $tenantId): bool
    {
        return $this->viewAny($user, $tenantId) && $user->role() !== RoleCode::READ_ONLY;
    }

    public function update(User $user, int $tenantId, object $lead): bool
    {
        // ponytail: rol rotador tiene permiso provisorio de gestión comercial sobre el lead (EVP-21)
        return $this->view($user, $tenantId, $lead) && $user->role() !== RoleCode::READ_ONLY;
    }
}
