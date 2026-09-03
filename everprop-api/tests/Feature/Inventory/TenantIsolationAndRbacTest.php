<?php

namespace Tests\Feature\Inventory;

use App\Domain\Identity\Enums\RoleCode;
use App\Domain\Tenancy\Models\Tenant;
use App\Models\User;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Tests\TestCase;

final class TenantIsolationAndRbacTest extends TestCase
{
    use DatabaseTransactions;

    public function test_tenant_cannot_list_read_update_or_delete_another_tenants_project(): void
    {
        [$tenantA, $adminA] = $this->identity(RoleCode::TENANT_ADMIN);
        [$tenantB] = $this->identity(RoleCode::TENANT_ADMIN);
        $projectB = $this->project($tenantB->id, ['name' => 'Private tenant B project']);

        $this->actingAs($adminA);
        $headers = $this->tenantHeaders($tenantA);

        $this->withHeaders($headers)
            ->getJson('/api/v1/admin/projects')
            ->assertOk()
            ->assertJsonMissing(['public_id' => $projectB['public_id']]);

        $this->withHeaders($headers)
            ->getJson('/api/v1/admin/projects/'.$projectB['public_id'])
            ->assertNotFound();

        $this->withHeaders($headers)
            ->patchJson('/api/v1/admin/projects/'.$projectB['public_id'], ['name' => 'Cross-tenant write'])
            ->assertNotFound();

        $this->withHeaders($headers)
            ->deleteJson('/api/v1/admin/projects/'.$projectB['public_id'])
            ->assertNotFound();

        $this->assertDatabaseHas('projects', [
            'id' => $projectB['id'],
            'tenant_id' => $tenantB->id,
            'name' => 'Private tenant B project',
            'deleted_at' => null,
        ]);
    }

    public function test_server_owns_tenant_assignment_and_cross_tenant_relationships_are_rejected(): void
    {
        [$tenantA, $adminA] = $this->identity(RoleCode::TENANT_ADMIN);
        [$tenantB] = $this->identity(RoleCode::TENANT_ADMIN);
        $projectB = $this->project($tenantB->id);

        $this->actingAs($adminA);
        $headers = $this->tenantHeaders($tenantA);
        $projectPayload = $this->projectPayload();

        $this->withHeaders($headers)
            ->postJson('/api/v1/admin/projects', $projectPayload + ['tenant_id' => $tenantB->id])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('tenant_id');

        $response = $this->withHeaders($headers)
            ->postJson('/api/v1/admin/projects', $projectPayload)
            ->assertCreated();

        $createdPublicId = (string) $response->json('data.public_id');
        $this->assertDatabaseHas('projects', [
            'tenant_id' => $tenantA->id,
            'public_id' => $createdPublicId,
        ]);
        $this->assertDatabaseMissing('projects', [
            'tenant_id' => $tenantB->id,
            'public_id' => $createdPublicId,
        ]);

        $this->withHeaders($headers)
            ->postJson('/api/v1/admin/properties', [
                'project_id' => $projectB['id'],
                'title' => 'Forbidden relation',
                'operation' => 'SALE',
                'category' => 'HOUSE',
                'city' => 'Salta',
                'province' => 'Salta',
            ])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('project_id');
    }

    public function test_viewer_cannot_mutate_and_agent_is_limited_to_explicit_inventory_scope(): void
    {
        [$tenant, $viewer] = $this->identity(RoleCode::READ_ONLY);
        $visibleProject = $this->project($tenant->id, ['name' => 'Scoped project']);
        $otherProject = $this->project($tenant->id, ['name' => 'Other project']);

        $this->inventorySettings($tenant->id, $viewer->id, 'ALL', false);
        $this->actingAs($viewer);

        $this->withHeaders($this->tenantHeaders($tenant))
            ->getJson('/api/v1/admin/projects')
            ->assertOk()
            ->assertJsonFragment(['public_id' => $visibleProject['public_id']]);

        $this->withHeaders($this->tenantHeaders($tenant))
            ->postJson('/api/v1/admin/projects', $this->projectPayload())
            ->assertForbidden();

        $agent = User::factory()->for($tenant)->create([
            'role_code' => RoleCode::SALES_ADVISOR->value,
        ]);
        $this->inventorySettings($tenant->id, $agent->id, 'SCOPED', true);
        DB::table('user_inventory_scopes')->insert([
            'tenant_id' => $tenant->id,
            'user_id' => $agent->id,
            'scope_type' => 'PROJECT',
            'project_id' => $visibleProject['id'],
            'property_id' => null,
            'category_code' => null,
            'can_view' => true,
            'can_edit' => true,
            'can_manage_prices' => false,
        ]);

        $this->actingAs($agent);
        $response = $this->withHeaders($this->tenantHeaders($tenant))
            ->getJson('/api/v1/admin/projects')
            ->assertOk()
            ->assertJsonFragment(['public_id' => $visibleProject['public_id']])
            ->assertJsonMissing(['public_id' => $otherProject['public_id']]);

        self::assertCount(1, $response->json('data'));

        $this->withHeaders($this->tenantHeaders($tenant))
            ->patchJson('/api/v1/admin/projects/'.$visibleProject['public_id'], ['name' => 'Agent edit'])
            ->assertOk();

        $this->withHeaders($this->tenantHeaders($tenant))
            ->patchJson('/api/v1/admin/projects/'.$otherProject['public_id'], ['name' => 'Forbidden edit'])
            ->assertForbidden();
    }

    /** @return array{Tenant, User} */
    private function identity(RoleCode $role): array
    {
        $tenant = Tenant::factory()->create();
        $user = User::factory()->for($tenant)->create(['role_code' => $role->value]);

        return [$tenant, $user];
    }

    /** @param array<string, mixed> $overrides
     * @return array{id: int, public_id: string}
     */
    private function project(int $tenantId, array $overrides = []): array
    {
        $publicId = (string) Str::uuid();
        $id = (int) DB::table('projects')->insertGetId(array_replace([
            'tenant_id' => $tenantId,
            'public_id' => $publicId,
            'code' => null,
            'name' => 'Test project',
            'project_type' => 'BUILDING',
            'status' => 'PLANNING',
            'progress' => 0,
            'total_units' => 0,
            'city' => 'Salta',
            'province' => 'Salta',
        ], $overrides));

        return ['id' => $id, 'public_id' => $publicId];
    }

    /** @return array<string, mixed> */
    private function projectPayload(): array
    {
        return [
            'name' => 'Tenant-owned project',
            'project_type' => 'BUILDING',
            'city' => 'Salta',
            'province' => 'Salta',
        ];
    }

    private function inventorySettings(int $tenantId, int $userId, string $visibility, bool $canManage): void
    {
        DB::table('user_inventory_settings')->insert([
            'tenant_id' => $tenantId,
            'user_id' => $userId,
            'workspace_mode' => 'BOTH',
            'visibility_mode' => $visibility,
            'can_manage_inventory' => $canManage,
            'can_manage_prices' => $canManage,
            'can_view_prices' => true,
        ]);
    }

    /** @return array<string, string> */
    private function tenantHeaders(Tenant $tenant): array
    {
        return [
            'X-Everprop-Tenant' => $tenant->public_id,
            'Origin' => 'http://localhost:5173',
        ];
    }
}
