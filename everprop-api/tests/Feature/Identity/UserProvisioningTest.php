<?php

namespace Tests\Feature\Identity;

use App\Domain\Identity\Enums\RoleCode;
use App\Domain\Tenancy\Models\Tenant;
use App\Models\User;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\RateLimiter;
use Tests\TestCase;

final class UserProvisioningTest extends TestCase
{
    use DatabaseTransactions;

    protected function setUp(): void
    {
        parent::setUp();
        config(['cache.default' => 'array']);
        // The limiter captured the Redis store at boot, so the line above does not isolate it.
        // Clear the login/activation bucket so earlier suites cannot leave this test at 429.
        RateLimiter::clear(md5('login'.'login|127.0.0.1'));
    }

    /** @return array<string, mixed> */
    private function payload(): array
    {
        return ['firstName' => 'Test', 'lastName' => 'Rotator', 'email' => 'provisioning@example.invalid', 'phone' => '+5493881234567', 'role' => 'ROTATOR'];
    }

    public function test_admin_creates_pending_account_and_activation_is_single_use_and_tenant_bound(): void
    {
        $tenant = Tenant::factory()->create();
        $admin = User::factory()->for($tenant)->create(['role_code' => RoleCode::TENANT_ADMIN]);
        $this->actingAs($admin)->withHeaders(['X-Everprop-Tenant' => $tenant->public_id]);
        $response = $this->postJson('/api/v1/admin/users', $this->payload())->assertCreated();
        $user = User::where('tenant_id', $tenant->id)->where('public_id', $response->json('data.id'))->firstOrFail();
        self::assertNull($user->password_hash);
        self::assertSame('PAUSED', $user->statusCode()->value);
        $token = $response->json('data.activationToken');
        $this->postJson('/api/v1/admin/users/'.$user->public_id.'/activation')->assertOk();
        $activation = ['token' => $token, 'password' => 'StrongLocalPassword123', 'password_confirmation' => 'StrongLocalPassword123'];
        $other = Tenant::factory()->create();
        $this->app['auth']->forgetGuards();
        $this->withHeaders(['X-Everprop-Tenant' => $other->public_id])->postJson('/api/v1/auth/activate', $activation)->assertUnprocessable();
        $this->withHeaders(['X-Everprop-Tenant' => $tenant->public_id])->postJson('/api/v1/auth/activate', $activation)->assertOk();
        self::assertTrue(Hash::check($activation['password'], $user->fresh()->password_hash));
        $this->postJson('/api/v1/auth/activate', $activation)->assertUnprocessable();
        $this->actingAs($user->fresh())->getJson('/api/v1/admin/projects')->assertForbidden();
        $this->assertDatabaseHas('user_inventory_settings', ['user_id' => $user->id, 'can_manage_inventory' => false, 'can_manage_prices' => false]);
        $this->postJson('/api/v1/admin/projects', ['name' => 'Forbidden'])->assertForbidden();
        $this->getJson('/api/v1/admin/leads')->assertOk();
        $this->getJson('/api/v1/admin/installments')->assertForbidden();
        $this->getJson('/api/v1/admin/users')->assertForbidden();
    }

    public function test_advisor_cannot_create_users_and_admin_cannot_escalate_or_choose_tenant(): void
    {
        $tenant = Tenant::factory()->create();
        $advisor = User::factory()->for($tenant)->create(['role_code' => RoleCode::SALES_ADVISOR]);
        $this->actingAs($advisor)->withHeaders(['X-Everprop-Tenant' => $tenant->public_id]);
        $this->postJson('/api/v1/admin/users', $this->payload())->assertForbidden();
        $admin = User::factory()->for($tenant)->create(['role_code' => RoleCode::TENANT_ADMIN]);
        $this->actingAs($admin);
        $otherTenant = Tenant::factory()->create();
        $otherUser = User::factory()->for($otherTenant)->create();
        $this->getJson('/api/v1/admin/users')->assertOk()->assertJsonMissing(['public_id' => $otherUser->public_id]);
        $this->postJson('/api/v1/admin/users/'.$otherUser->public_id.'/activation')->assertNotFound();
        $this->postJson('/api/v1/admin/users', array_replace($this->payload(), ['role' => 'SUPER_ADMIN']))->assertUnprocessable();
        $this->postJson('/api/v1/admin/users', $this->payload() + ['tenant_id' => $tenant->id])->assertUnprocessable();
        $this->postJson('/api/v1/admin/users', $this->payload())->assertCreated();
        $this->postJson('/api/v1/admin/users', $this->payload())->assertUnprocessable();
    }

    public function test_new_tenant_admin_activates_and_can_manage_users_only_in_own_tenant(): void
    {
        $tenant = Tenant::factory()->create();
        $admin = User::factory()->for($tenant)->create(['role_code' => RoleCode::TENANT_ADMIN]);
        $this->actingAs($admin)->withHeaders(['X-Everprop-Tenant' => $tenant->public_id]);
        $response = $this->postJson('/api/v1/admin/users', array_replace($this->payload(), ['role' => 'TENANT_ADMIN']))->assertCreated();
        $user = User::where('tenant_id', $tenant->id)->where('public_id', $response->json('data.id'))->firstOrFail();
        self::assertSame(RoleCode::TENANT_ADMIN, $user->role());
        self::assertNull($user->password_hash);
        self::assertSame('PAUSED', $user->statusCode()->value);
        $this->assertDatabaseHas('user_inventory_settings', ['tenant_id' => $tenant->id, 'user_id' => $user->id, 'can_manage_inventory' => true, 'can_manage_prices' => true]);
        $this->app['auth']->forgetGuards();
        $activation = ['token' => $response->json('data.activationToken'), 'password' => 'StrongLocalPassword123', 'password_confirmation' => 'StrongLocalPassword123'];
        $this->postJson('/api/v1/auth/activate', $activation)->assertOk();
        $this->postJson('/api/v1/auth/activate', $activation)->assertUnprocessable();
        $this->actingAs($user->fresh())->getJson('/api/v1/admin/users')->assertOk();
        $this->postJson('/api/v1/admin/users', array_replace($this->payload(), ['email' => 'second@example.invalid']))->assertCreated();
        $otherTenant = Tenant::factory()->create();
        $this->withHeaders(['X-Everprop-Tenant' => $otherTenant->public_id])->postJson('/api/v1/admin/users', $this->payload())->assertNotFound();
    }

    public function test_non_admin_roles_cannot_provision_administrators(): void
    {
        $tenant = Tenant::factory()->create();
        foreach ([RoleCode::SALES_ADVISOR, RoleCode::ROTATOR, RoleCode::SALES_MANAGER, RoleCode::READ_ONLY] as $role) {
            $actor = User::factory()->for($tenant)->create(['role_code' => $role]);
            $this->actingAs($actor)->withHeaders(['X-Everprop-Tenant' => $tenant->public_id]);
            $this->postJson('/api/v1/admin/users', array_replace($this->payload(), ['role' => 'TENANT_ADMIN']))->assertForbidden();
        }
    }

    public function test_role_changes_are_admin_only_tenant_bound_and_update_inventory_permissions(): void
    {
        $tenant = Tenant::factory()->create();
        $admin = User::factory()->for($tenant)->create(['role_code' => RoleCode::TENANT_ADMIN]);
        $target = User::factory()->for($tenant)->create(['role_code' => RoleCode::SALES_ADVISOR]);
        $url = '/api/v1/admin/users/'.$target->public_id.'/role';
        $this->actingAs($admin)->withHeaders(['X-Everprop-Tenant' => $tenant->public_id]);
        foreach (['TENANT_ADMIN', 'ROTATOR', 'SALES_ADVISOR'] as $role) {
            $this->patchJson($url, ['role' => $role])->assertOk()->assertJsonPath('data.role_code', $role);
            $this->assertDatabaseHas('user_inventory_settings', ['tenant_id' => $tenant->id, 'user_id' => $target->id,
                'can_manage_inventory' => $role === 'TENANT_ADMIN', 'can_manage_prices' => $role === 'TENANT_ADMIN']);
        }
        self::assertSame('ACTIVE', $target->fresh()->statusCode()->value);
        $this->patchJson($url, ['role' => 'SUPER_ADMIN'])->assertUnprocessable();
        $this->patchJson($url, ['role' => 'ROTATOR', 'tenant_id' => $tenant->id])->assertUnprocessable();
        $this->patchJson('/api/v1/admin/users/'.$admin->public_id.'/role', ['role' => 'ROTATOR'])->assertForbidden();
        $super = User::factory()->for($tenant)->create(['role_code' => RoleCode::SUPER_ADMIN]);
        $this->patchJson('/api/v1/admin/users/'.$super->public_id.'/role', ['role' => 'ROTATOR'])->assertForbidden();
        $other = User::factory()->for(Tenant::factory()->create())->create();
        $this->patchJson('/api/v1/admin/users/'.$other->public_id.'/role', ['role' => 'ROTATOR'])->assertNotFound();
        foreach ([RoleCode::SALES_ADVISOR, RoleCode::ROTATOR, RoleCode::SALES_MANAGER, RoleCode::READ_ONLY] as $role) {
            $actor = User::factory()->for($tenant)->create(['role_code' => $role]);
            $this->actingAs($actor)->patchJson($url, ['role' => 'TENANT_ADMIN'])->assertForbidden();
        }
        self::assertSame(RoleCode::SALES_ADVISOR, $target->fresh()->role());
        $this->actingAs($admin)->patchJson($url, ['role' => 'ROTATOR'])->assertOk();
        $this->actingAs($target->fresh())->getJson('/api/v1/admin/users')->assertForbidden();
    }
}
