<?php

namespace Tests\Feature\Identity;

use App\Domain\Identity\Enums\RoleCode;
use App\Domain\Tenancy\Models\Tenant;
use App\Models\User;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

final class UserProvisioningTest extends TestCase
{
    use DatabaseTransactions;

    private function payload(): array
    {
        return ['firstName' => 'Test', 'lastName' => 'Inventory', 'email' => 'provisioning@example.invalid', 'phone' => '+5493881234567', 'role' => 'INVENTORY_MANAGER'];
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
        $this->actingAs($user->fresh())->getJson('/api/v1/admin/projects')->assertOk();
        $project = $this->postJson('/api/v1/admin/projects', ['name' => 'Inventory project', 'code' => 'INV-TEST', 'project_type' => 'LAND_DEVELOPMENT', 'status' => 'PRE_SALE', 'city' => 'Jujuy', 'province' => 'Jujuy'])->assertCreated()->json('data.public_id');
        $this->patchJson('/api/v1/admin/projects/'.$project, ['name' => 'Updated inventory project'])->assertOk();
        $this->getJson('/api/v1/admin/leads')->assertForbidden();
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
        $this->postJson('/api/v1/admin/users', array_replace($this->payload(), ['role' => 'TENANT_ADMIN']))->assertUnprocessable();
        $this->postJson('/api/v1/admin/users', $this->payload() + ['tenant_id' => $tenant->id])->assertUnprocessable();
        $this->postJson('/api/v1/admin/users', $this->payload())->assertCreated();
        $this->postJson('/api/v1/admin/users', $this->payload())->assertUnprocessable();
    }
}
