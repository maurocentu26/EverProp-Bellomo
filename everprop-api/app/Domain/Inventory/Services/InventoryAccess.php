<?php

namespace App\Domain\Inventory\Services;

use App\Domain\Identity\Enums\Capability;
use App\Domain\Identity\Enums\RoleCode;
use App\Domain\Identity\Services\AuthorizationService;
use App\Domain\Inventory\Models\Project;
use App\Domain\Inventory\Models\Property;
use App\Domain\Inventory\Models\UserInventoryScope;
use App\Domain\Inventory\Models\UserInventorySetting;
use App\Domain\Tenancy\TenantContext;
use App\Models\User;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;

final class InventoryAccess
{
    /** @var array<int, UserInventorySetting|null> */
    private array $settings = [];

    public function __construct(
        private readonly TenantContext $tenantContext,
        private readonly AuthorizationService $authorization,
    ) {}

    public function canViewAny(User $user): bool
    {
        return $this->baseAllows($user, Capability::VIEW_ANY)
            && $this->visibilityMode($user) !== 'NONE';
    }

    public function canView(User $user, Project|Property $resource): bool
    {
        if (! $this->baseAllows($user, Capability::VIEW, $resource)) {
            return false;
        }

        return $resource instanceof Project
            ? $this->canAccessProject($user, $resource, 'can_view')
            : $this->canAccessProperty($user, $resource, 'can_view');
    }

    public function canCreate(User $user): bool
    {
        return $this->baseAllows($user, Capability::CREATE)
            && $this->canManageInventory($user);
    }

    public function canUpdate(User $user, Project|Property $resource): bool
    {
        if (! $this->baseAllows($user, Capability::UPDATE, $resource)
            || ! $this->canManageInventory($user)) {
            return false;
        }

        return $resource instanceof Project
            ? $this->canAccessProject($user, $resource, 'can_edit')
            : $this->canAccessProperty($user, $resource, 'can_edit');
    }

    public function canDelete(User $user, Project|Property $resource): bool
    {
        return $this->baseAllows($user, Capability::DELETE, $resource)
            && $this->canUpdate($user, $resource);
    }

    public function canPublish(User $user, Project|Property $resource): bool
    {
        return $this->baseAllows($user, Capability::PUBLISH, $resource)
            && $this->canUpdate($user, $resource);
    }

    public function canViewPrices(User $user, Property $property): bool
    {
        if (! $this->canView($user, $property)) {
            return false;
        }

        return $this->isTenantAdministrator($user)
            || (bool) $this->setting($user)?->can_view_prices;
    }

    public function mayViewPriceFields(User $user): bool
    {
        return $this->isTenantAdministrator($user)
            || (bool) $this->setting($user)?->can_view_prices;
    }

    public function canManagePrices(User $user, Property $property): bool
    {
        if (! $this->canUpdate($user, $property)) {
            return false;
        }

        if ($this->isTenantAdministrator($user)) {
            return true;
        }

        $setting = $this->setting($user);

        if (! $setting?->can_manage_prices) {
            return false;
        }

        return $this->visibilityMode($user) === 'ALL'
            || $this->propertyScopeExists($user, $property, 'can_manage_prices');
    }

    public function canSetInitialPrices(User $user): bool
    {
        return $this->canCreate($user)
            && ($this->isTenantAdministrator($user) || (bool) $this->setting($user)?->can_manage_prices);
    }

    /** @param Builder<Project> $query
     * @return Builder<Project>
     */
    public function scopeProjects(Builder $query, User $user, string $permission = 'can_view'): Builder
    {
        $query->where('projects.tenant_id', $this->tenantContext->id());

        $mode = $this->visibilityMode($user);

        if ($mode === 'ALL') {
            return $query;
        }

        if ($mode === 'NONE') {
            return $query->whereRaw('1 = 0');
        }

        return $query->whereExists(function ($scope) use ($permission, $user): void {
            $scope->selectRaw('1')
                ->from('user_inventory_scopes as inventory_scope')
                ->whereColumn('inventory_scope.tenant_id', 'projects.tenant_id')
                ->whereColumn('inventory_scope.project_id', 'projects.id')
                ->where('inventory_scope.tenant_id', $this->tenantContext->id())
                ->where('inventory_scope.user_id', $user->getKey())
                ->where('inventory_scope.scope_type', 'PROJECT')
                ->where("inventory_scope.{$permission}", true);
        });
    }

    /** @param Builder<Property> $query
     * @return Builder<Property>
     */
    public function scopeProperties(Builder $query, User $user, string $permission = 'can_view'): Builder
    {
        $query->where('properties.tenant_id', $this->tenantContext->id());

        $mode = $this->visibilityMode($user);

        if ($mode === 'ALL') {
            return $query;
        }

        if ($mode === 'NONE') {
            return $query->whereRaw('1 = 0');
        }

        return $query->whereExists(function ($scope) use ($permission, $user): void {
            $scope->selectRaw('1')
                ->from('user_inventory_scopes as inventory_scope')
                ->whereColumn('inventory_scope.tenant_id', 'properties.tenant_id')
                ->where('inventory_scope.tenant_id', $this->tenantContext->id())
                ->where('inventory_scope.user_id', $user->getKey())
                ->where("inventory_scope.{$permission}", true)
                ->where(function ($match): void {
                    $match->where(function ($property): void {
                        $property->where('inventory_scope.scope_type', 'PROPERTY')
                            ->whereColumn('inventory_scope.property_id', 'properties.id');
                    })->orWhere(function ($project): void {
                        $project->where('inventory_scope.scope_type', 'PROJECT')
                            ->whereColumn('inventory_scope.project_id', 'properties.project_id');
                    })->orWhere(function ($category): void {
                        $category->where('inventory_scope.scope_type', 'CATEGORY')
                            ->whereColumn('inventory_scope.category_code', 'properties.category');
                    });
                });
        });
    }

    private function baseAllows(User $user, Capability $capability, ?Model $resource = null): bool
    {
        return ! $this->tenantContext->isPlatform()
            && (int) $user->tenant_id === $this->tenantContext->id()
            && $this->authorization->allows($user, $capability, $resource);
    }

    private function canManageInventory(User $user): bool
    {
        return $this->isTenantAdministrator($user)
            || (bool) $this->setting($user)?->can_manage_inventory;
    }

    private function canAccessProject(User $user, Project $project, string $permission): bool
    {
        return match ($this->visibilityMode($user)) {
            'ALL' => true,
            'SCOPED' => UserInventoryScope::query()
                ->where('tenant_id', $this->tenantContext->id())
                ->where('user_id', $user->getKey())
                ->where('scope_type', 'PROJECT')
                ->where('project_id', $project->getKey())
                ->where($permission, true)
                ->exists(),
            default => false,
        };
    }

    private function canAccessProperty(User $user, Property $property, string $permission): bool
    {
        return match ($this->visibilityMode($user)) {
            'ALL' => true,
            'SCOPED' => $this->propertyScopeExists($user, $property, $permission),
            default => false,
        };
    }

    private function propertyScopeExists(User $user, Property $property, string $permission): bool
    {
        return UserInventoryScope::query()
            ->where('tenant_id', $this->tenantContext->id())
            ->where('user_id', $user->getKey())
            ->where($permission, true)
            ->where(function (Builder $query) use ($property): void {
                $query->where(function (Builder $propertyScope) use ($property): void {
                    $propertyScope->where('scope_type', 'PROPERTY')
                        ->where('property_id', $property->getKey());
                })->orWhere(function (Builder $projectScope) use ($property): void {
                    $projectScope->where('scope_type', 'PROJECT')
                        ->where('project_id', $property->project_id);
                })->orWhere(function (Builder $categoryScope) use ($property): void {
                    $categoryScope->where('scope_type', 'CATEGORY')
                        ->where('category_code', $property->getRawOriginal('category'));
                });
            })
            ->exists();
    }

    private function visibilityMode(User $user): string
    {
        $setting = $this->setting($user);

        if ($this->isTenantAdministrator($user) || $user->role() === RoleCode::SALES_MANAGER) {
            return $setting instanceof UserInventorySetting ? $setting->visibility_mode : 'ALL';
        }

        return $setting instanceof UserInventorySetting ? $setting->visibility_mode : 'SCOPED';
    }

    private function isTenantAdministrator(User $user): bool
    {
        return in_array($user->role(), [RoleCode::SUPER_ADMIN, RoleCode::TENANT_ADMIN], true);
    }

    private function setting(User $user): ?UserInventorySetting
    {
        $userId = (int) $user->getKey();

        if (! array_key_exists($userId, $this->settings)) {
            $this->settings[$userId] = UserInventorySetting::query()
                ->where('tenant_id', $this->tenantContext->id())
                ->where('user_id', $userId)
                ->first();
        }

        return $this->settings[$userId];
    }
}
