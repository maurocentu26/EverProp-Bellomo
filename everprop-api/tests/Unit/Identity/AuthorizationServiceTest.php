<?php

namespace Tests\Unit\Identity;

use App\Domain\Identity\Enums\Capability;
use App\Domain\Identity\Enums\RoleCode;
use App\Domain\Identity\Enums\UserStatus;
use App\Domain\Identity\Services\AuthorizationService;
use App\Domain\Tenancy\Models\Tenant;
use App\Domain\Tenancy\TenantContext;
use App\Models\User;
use Illuminate\Database\Eloquent\Model;
use PHPUnit\Framework\TestCase;

final class AuthorizationServiceTest extends TestCase
{
    public function test_it_requires_identity_role_and_tenant_to_match(): void
    {
        $authorization = new AuthorizationService($this->tenantContext(10));

        self::assertTrue($authorization->allows(
            $this->user(10, RoleCode::TENANT_ADMIN),
            Capability::MANAGE_USERS,
        ));

        self::assertFalse($authorization->allows(
            $this->user(11, RoleCode::TENANT_ADMIN),
            Capability::MANAGE_USERS,
        ));

        self::assertFalse($authorization->allows(
            $this->user(10, RoleCode::READ_ONLY),
            Capability::UPDATE,
        ));
    }

    public function test_it_hides_resources_from_other_tenants(): void
    {
        $authorization = new AuthorizationService($this->tenantContext(10));
        $actor = $this->user(10, RoleCode::TENANT_ADMIN);

        self::assertTrue($authorization->allows($actor, Capability::VIEW, $this->resource(10)));
        self::assertFalse($authorization->allows($actor, Capability::VIEW, $this->resource(11)));
    }

    public function test_it_denies_disabled_users(): void
    {
        $authorization = new AuthorizationService($this->tenantContext(10));

        self::assertFalse($authorization->allows(
            $this->user(10, RoleCode::TENANT_ADMIN, UserStatus::DISABLED),
            Capability::VIEW,
        ));
    }

    public function test_platform_context_still_requires_an_active_super_admin(): void
    {
        $authorization = new AuthorizationService(TenantContext::forPlatform('support.audit'));

        self::assertTrue($authorization->allows(
            $this->user(10, RoleCode::SUPER_ADMIN),
            Capability::MANAGE_INTEGRATIONS,
            $this->resource(99),
        ));

        self::assertFalse($authorization->allows(
            $this->user(10, RoleCode::TENANT_ADMIN),
            Capability::MANAGE_INTEGRATIONS,
        ));
    }

    private function tenantContext(int $tenantId): TenantContext
    {
        $tenant = new Tenant;
        $tenant->setRawAttributes(['id' => $tenantId, 'status' => 'ACTIVE']);

        return TenantContext::forTenant($tenant);
    }

    private function user(
        int $tenantId,
        RoleCode $role,
        UserStatus $status = UserStatus::ACTIVE,
    ): User {
        $user = new User;
        $user->setRawAttributes([
            'id' => 1,
            'tenant_id' => $tenantId,
            'role_code' => $role->value,
            'status' => $status->value,
            'deleted_at' => null,
        ]);

        return $user;
    }

    private function resource(int $tenantId): Model
    {
        $resource = new class extends Model
        {
            public $timestamps = false;

            protected $guarded = [];
        };

        $resource->setRawAttributes(['id' => 1, 'tenant_id' => $tenantId]);

        return $resource;
    }
}
