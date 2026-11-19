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

    public function test_technical_lot_details_persist_within_the_tenant(): void
    {
        [$tenant, $admin] = $this->identity(RoleCode::TENANT_ADMIN);
        $land = ['frente_m' => 10, 'fondo_m' => 25, 'ochava_m2' => 0, 'padron' => 'QA-123', 'curb' => true, 'lighting' => true];
        $response = $this->actingAs($admin)->withHeaders($this->tenantHeaders($tenant))
            ->postJson('/api/v1/admin/properties', [
                'title' => 'Lote técnico de prueba', 'operation' => 'SALE', 'category' => 'LOT',
                'status' => 'AVAILABLE', 'city' => 'Jujuy', 'province' => 'Jujuy',
                'price' => 0, 'currency_code' => 'ARS',
                'commercial_features_json' => ['land' => $land],
                'services_json' => ['water' => true, 'gas' => false],
            ])->assertCreated();
        $id = $response->json('data.public_id');
        $this->getJson('/api/v1/admin/properties/'.$id)->assertOk()
            ->assertJsonPath('data.commercial_features.land', function ($actual) use ($land) {
                ksort($actual);
                ksort($land);

                return $actual === $land;
            })
            ->assertJsonPath('data.services.water', true);
        [$otherTenant, $otherAdmin] = $this->identity(RoleCode::TENANT_ADMIN);
        $this->actingAs($otherAdmin)->withHeaders($this->tenantHeaders($otherTenant))
            ->getJson('/api/v1/admin/properties/'.$id)->assertNotFound();
    }

    public function test_admin_project_endpoints_expose_unit_status_counts_and_prioritize_loaded_inventory(): void
    {
        [$tenant, $admin] = $this->identity(RoleCode::TENANT_ADMIN);
        $withUnits = $this->project($tenant->id, ['name' => 'Loaded project']);
        $emptyNewer = $this->project($tenant->id, ['name' => 'Empty newer project']);

        foreach (['AVAILABLE', 'AVAILABLE', 'RESERVED', 'SOLD'] as $index => $status) {
            DB::table('properties')->insert([
                'tenant_id' => $tenant->id,
                'project_id' => $withUnits['id'],
                'public_id' => (string) Str::uuid(),
                'title' => "Unit {$index}",
                'operation' => 'SALE',
                'category' => 'LOT',
                'status' => $status,
                'city' => 'Jujuy',
                'province' => 'Jujuy',
            ]);
        }

        $this->actingAs($admin);
        $headers = $this->tenantHeaders($tenant);

        $list = $this->withHeaders($headers)
            ->getJson('/api/v1/admin/projects')
            ->assertOk();

        $this->assertSame($withUnits['public_id'], $list->json('data.0.public_id'));
        $this->assertSame(4, $list->json('data.0.properties_count'));
        $this->assertSame(2, $list->json('data.0.available_units_count'));
        $this->assertSame(1, $list->json('data.0.reserved_units_count'));
        $this->assertSame(1, $list->json('data.0.sold_units_count'));
        $this->assertSame($emptyNewer['public_id'], $list->json('data.1.public_id'));
        $this->assertSame(0, $list->json('data.1.properties_count'));

        $this->withHeaders($headers)
            ->getJson('/api/v1/admin/projects/'.$withUnits['public_id'])
            ->assertOk()
            ->assertJsonPath('data.properties_count', 4)
            ->assertJsonPath('data.available_units_count', 2)
            ->assertJsonPath('data.reserved_units_count', 1)
            ->assertJsonPath('data.sold_units_count', 1);
    }

    public function test_project_counters_split_every_status_and_ignore_foreign_and_deleted_units(): void
    {
        [$tenant, $admin] = $this->identity(RoleCode::TENANT_ADMIN);
        [$otherTenant] = $this->identity(RoleCode::TENANT_ADMIN);
        $project = $this->project($tenant->id);
        $foreign = $this->project($otherTenant->id);

        $this->unitsInEveryStatus($tenant->id, $project['id']);
        $this->unitsInEveryStatus($otherTenant->id, $foreign['id']);
        foreach (['AVAILABLE', 'RESERVED', 'SOLD', 'RENTED', 'NOT_SELLABLE', 'NOT_MARKETED'] as $status) {
            $this->unit($tenant->id, $project['id'], $status, 'SALE', ['deleted_at' => now()]);
        }

        // A row the composite foreign key would reject: the tenant filters (scope and explicit) keep it out of the counters.
        DB::statement('SET FOREIGN_KEY_CHECKS=0');
        try {
            $this->unit($otherTenant->id, $project['id'], 'AVAILABLE', 'SALE');
        } finally {
            DB::statement('SET FOREIGN_KEY_CHECKS=1');
        }
        self::assertSame(15, DB::table('properties')->where('project_id', $project['id'])->count());

        $this->actingAs($admin);
        $headers = $this->tenantHeaders($tenant);

        $this->assertCountersOfEveryStatus(
            $this->withHeaders($headers)->getJson('/api/v1/admin/projects/'.$project['public_id'])->assertOk()->json('data')
        );

        $list = $this->withHeaders($headers)->getJson('/api/v1/admin/projects')->assertOk();
        $this->assertSame([$project['public_id']], array_column($list->json('data'), 'public_id'));
        $this->assertCountersOfEveryStatus($list->json('data.0'));

        $this->withHeaders($headers)
            ->getJson('/api/v1/admin/projects/'.$foreign['public_id'])
            ->assertNotFound();
    }

    public function test_project_counters_keep_the_explicit_tenant_filter(): void
    {
        [$tenant, $admin] = $this->identity(RoleCode::TENANT_ADMIN);
        $project = $this->project($tenant->id);
        $this->actingAs($admin);
        $headers = $this->tenantHeaders($tenant);

        foreach (['/api/v1/admin/projects/'.$project['public_id'], '/api/v1/admin/projects'] as $url) {
            $sql = [];
            DB::listen(function ($query) use (&$sql): void {
                $sql[] = $query->sql;
            });
            $this->withHeaders($headers)->getJson($url)->assertOk();
            $counters = collect($sql)->first(fn (string $statement): bool => str_contains($statement, 'not_marketed_units_count'));
            self::assertIsString($counters);
            // Nine counters, each with the global scope and the explicit filter.
            self::assertSame(18, substr_count($counters, '`properties`.`tenant_id`'), $url);
        }
    }

    public function test_project_counters_follow_the_inventory_scope_of_the_user(): void
    {
        [$tenant] = $this->identity(RoleCode::TENANT_ADMIN);
        $visible = $this->project($tenant->id);
        $hidden = $this->project($tenant->id);
        $this->unitsInEveryStatus($tenant->id, $visible['id']);
        $this->unitsInEveryStatus($tenant->id, $hidden['id']);

        $scoped = User::factory()->for($tenant)->create(['role_code' => RoleCode::SALES_ADVISOR->value]);
        $this->inventorySettings($tenant->id, $scoped->id, 'SCOPED', false);
        DB::table('user_inventory_scopes')->insert([
            'tenant_id' => $tenant->id, 'user_id' => $scoped->id, 'scope_type' => 'PROJECT', 'project_id' => $visible['id'],
            'property_id' => null, 'category_code' => null, 'can_view' => true, 'can_edit' => false, 'can_manage_prices' => false,
        ]);

        $this->actingAs($scoped);
        $headers = $this->tenantHeaders($tenant);
        $list = $this->withHeaders($headers)->getJson('/api/v1/admin/projects')->assertOk();
        $this->assertSame([$visible['public_id']], array_column($list->json('data'), 'public_id'));
        $this->assertCountersOfEveryStatus($list->json('data.0'));
        $this->withHeaders($headers)->getJson('/api/v1/admin/projects/'.$hidden['public_id'])->assertForbidden();

        $none = User::factory()->for($tenant)->create(['role_code' => RoleCode::SALES_ADVISOR->value]);
        $this->inventorySettings($tenant->id, $none->id, 'NONE', false);
        $this->actingAs($none);
        $this->withHeaders($headers)->getJson('/api/v1/admin/projects')->assertForbidden()->assertJsonMissingPath('data');
        $this->withHeaders($headers)->getJson('/api/v1/admin/projects/'.$visible['public_id'])->assertForbidden()->assertJsonMissingPath('data');
    }

    private function unitsInEveryStatus(int $tenantId, int $projectId): void
    {
        foreach ([
            ['AVAILABLE', 'SALE'], ['AVAILABLE', 'SALE'], ['AVAILABLE', 'RENT'], ['AVAILABLE', 'LEASING'],
            ['RENTED', 'RENT'], ['NOT_SELLABLE', 'SALE'], ['NOT_MARKETED', 'UNKNOWN'], ['UNKNOWN', 'UNKNOWN'],
        ] as [$status, $operation]) {
            $this->unit($tenantId, $projectId, $status, $operation);
        }
    }

    /** @param array<string, mixed> $overrides */
    private function unit(int $tenantId, int $projectId, string $status, string $operation, array $overrides = []): void
    {
        DB::table('properties')->insert(array_replace([
            'tenant_id' => $tenantId,
            'project_id' => $projectId,
            'public_id' => (string) Str::uuid(),
            'title' => 'Unit',
            'operation' => $operation,
            'category' => 'LOT',
            'status' => $status,
            'city' => 'Jujuy',
            'province' => 'Jujuy',
        ], $overrides));
    }

    /** @param array<string, mixed> $project */
    private function assertCountersOfEveryStatus(array $project): void
    {
        $this->assertSame(
            [8, 4, 0, 0, 2, 1, 1, 1, 1],
            [
                $project['properties_count'], $project['available_units_count'], $project['reserved_units_count'], $project['sold_units_count'],
                $project['available_sale_units_count'], $project['available_rent_units_count'], $project['rented_units_count'],
                $project['not_sellable_units_count'], $project['not_marketed_units_count'],
            ],
        );
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
