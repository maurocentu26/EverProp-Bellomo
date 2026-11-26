<?php

namespace Tests\Feature\Inventory;

use App\Domain\Identity\Enums\RoleCode;
use App\Domain\Tenancy\Models\Tenant;
use App\Models\User;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Tests\TestCase;

/** G0 / E01 + E03: publishing, pricing, project scope and batch identity. */
final class InventoryWriteGuardsTest extends TestCase
{
    use DatabaseTransactions;

    public function test_editor_without_publish_cannot_publish_on_create_or_update(): void
    {
        [$tenant, $editor] = $this->editor();

        $created = $this->as($editor, $tenant)->postJson('/api/v1/admin/properties', $this->propertyPayload())
            ->assertCreated()
            ->assertJsonPath('data.status', 'NOT_MARKETED');

        $this->as($editor, $tenant)->postJson('/api/v1/admin/properties', $this->propertyPayload(['status' => 'AVAILABLE']))
            ->assertForbidden();

        $this->as($editor, $tenant)->patchJson('/api/v1/admin/properties/'.$created->json('data.public_id'), [
            'version' => 1, 'status' => 'AVAILABLE',
        ])->assertForbidden();

        $this->assertDatabaseHas('properties', ['public_id' => $created->json('data.public_id'), 'status' => 'NOT_MARKETED']);
        $this->getJson('/api/v1/public/properties/'.$created->json('data.public_id'))->assertNotFound();
    }

    public function test_editor_cannot_publish_through_project_moves_or_project_status(): void
    {
        [$tenant, $editor] = $this->editor();
        $planning = $this->project($tenant->id);
        $unit = $this->unit($tenant->id, $planning, 'AVAILABLE');

        // Detaching from a non-public project would expose the unit (project_id NULL is public).
        $this->as($editor, $tenant)->patchJson("/api/v1/admin/properties/$unit", ['version' => 1, 'project_id' => null])
            ->assertForbidden();
        $this->getJson("/api/v1/public/properties/$unit")->assertNotFound();

        // A public project status publishes all its AVAILABLE units.
        $projectUuid = DB::table('projects')->where('id', $planning)->value('public_id');
        $this->as($editor, $tenant)->patchJson("/api/v1/admin/projects/$projectUuid", ['status' => 'PRE_SALE'])
            ->assertForbidden();
        $this->as($editor, $tenant)->postJson('/api/v1/admin/projects', [
            'name' => 'Proyecto público', 'project_type' => 'BUILDING', 'city' => 'Salta', 'province' => 'Salta', 'status' => 'PRE_SALE',
        ])->assertForbidden();
        $this->getJson("/api/v1/public/properties/$unit")->assertNotFound();
    }

    public function test_editor_can_return_reserved_unit_to_available_but_not_first_publish(): void
    {
        [$tenant, $editor] = $this->editor();
        $reserved = $this->unit($tenant->id, null, 'RESERVED');
        $neverMarketed = $this->unit($tenant->id, null, 'NOT_MARKETED');

        $this->as($editor, $tenant)->patchJson("/api/v1/admin/properties/$reserved", ['version' => 1, 'status' => 'AVAILABLE'])->assertOk();
        $this->as($editor, $tenant)->patchJson("/api/v1/admin/properties/$neverMarketed", ['version' => 1, 'status' => 'AVAILABLE'])->assertForbidden();
    }

    public function test_admin_still_publishes_by_default(): void
    {
        [$tenant, $admin] = $this->identity(RoleCode::TENANT_ADMIN);

        $this->as($admin, $tenant)->postJson('/api/v1/admin/properties', $this->propertyPayload())
            ->assertCreated()
            ->assertJsonPath('data.status', 'AVAILABLE');
    }

    public function test_residential_details_are_distinct_editable_and_publicly_readable(): void
    {
        [$tenant, $admin] = $this->identity(RoleCode::TENANT_ADMIN);
        $created = $this->as($admin, $tenant)->postJson('/api/v1/admin/properties', $this->propertyPayload([
            'category' => 'APARTMENT', 'rooms' => 3, 'bedrooms' => 2, 'bathrooms' => 2,
            'area_m2' => 80.5, 'covered_area_m2' => 70.5, 'uncovered_area_m2' => 10,
            'floor' => '2', 'orientation' => 'Norte', 'disposition' => 'Frente',
            'parking_spaces' => 1, 'expenses' => 25000, 'expenses_currency_code' => 'ARS',
        ]))->assertCreated()->assertJsonPath('data.rooms', 3)->assertJsonPath('data.bedrooms', 2)
            ->assertJsonPath('data.expenses_currency_code', 'ARS');
        $id = $created->json('data.public_id');
        $this->getJson("/api/v1/public/properties/$id")
            ->assertOk()->assertJsonPath('data.rooms', 3)->assertJsonPath('data.covered_area_m2', '70.50');

        $this->as($admin, $tenant)->patchJson("/api/v1/admin/properties/$id", [
            'version' => 1, 'rooms' => 4, 'expenses' => null, 'expenses_currency_code' => null,
        ])->assertOk()->assertJsonPath('data.rooms', 4)->assertJsonPath('data.expenses', null);
        $this->as($admin, $tenant)->patchJson("/api/v1/admin/properties/$id", [
            'version' => 1, 'rooms' => 5,
        ])->assertStatus(409);
        $this->getJson('/api/v1/public/properties?rooms_min=4&rooms_max=4')
            ->assertOk()->assertJsonPath('data.0.public_id', $id);

        $house = $this->as($admin, $tenant)->postJson('/api/v1/admin/properties', $this->propertyPayload([
            'rooms' => 5, 'bedrooms' => 3, 'covered_area_m2' => 120, 'uncovered_area_m2' => 35,
        ]))->assertCreated()->assertJsonPath('data.category', 'HOUSE')
            ->assertJsonPath('data.rooms', 5)->json('data.public_id');
        $this->getJson("/api/v1/public/properties/$house")
            ->assertOk()->assertJsonPath('data.bedrooms', 3)->assertJsonPath('data.expenses', null);
    }

    public function test_residential_details_validate_amounts_and_preserve_tenant_feature_boundaries(): void
    {
        [$tenant, $admin] = $this->identity(RoleCode::TENANT_ADMIN);
        $this->as($admin, $tenant)->postJson('/api/v1/admin/properties', $this->propertyPayload([
            'rooms' => -1, 'covered_area_m2' => 0, 'expenses' => 100,
        ]))->assertUnprocessable()->assertJsonValidationErrors(['rooms', 'covered_area_m2', 'expenses']);

        $id = $this->as($admin, $tenant)->postJson('/api/v1/admin/properties', $this->propertyPayload())
            ->assertCreated()->json('data.public_id');
        $feature = $this->as($admin, $tenant)->postJson("/api/v1/admin/properties/$id/features", [
            'feature_group' => 'AMENITY', 'feature_code' => 'BALCON', 'label' => 'Balcón',
            'feature_value' => true, 'is_filterable' => true,
        ])->assertCreated()->json('data.id');
        $this->as($admin, $tenant)->patchJson("/api/v1/admin/properties/$id/features/$feature", [
            'label' => 'Balcón aterrazado',
        ])->assertOk()->assertJsonPath('data.label', 'Balcón aterrazado');
        $this->getJson("/api/v1/public/properties/$id")
            ->assertOk()->assertJsonPath('data.features.0.label', 'Balcón aterrazado');
        $this->as($admin, $tenant)->deleteJson("/api/v1/admin/properties/$id/features/$feature")->assertNoContent();
        $otherFeature = $this->as($admin, $tenant)->postJson("/api/v1/admin/properties/$id/features", [
            'feature_group' => 'SERVICE', 'feature_code' => 'GAS', 'label' => 'Gas',
            'feature_value' => true, 'is_filterable' => true,
        ])->assertCreated()->json('data.id');

        $advisor = $this->user($tenant, RoleCode::SALES_ADVISOR);
        $this->as($advisor, $tenant)->patchJson("/api/v1/admin/properties/$id", [
            'version' => 1, 'rooms' => 4,
        ])->assertForbidden();
        $this->as($advisor, $tenant)->postJson("/api/v1/admin/properties/$id/features", [
            'feature_group' => 'OTHER', 'feature_code' => 'PATIO', 'label' => 'Patio', 'feature_value' => true,
        ])->assertForbidden();

        [$foreignTenant, $foreignAdmin] = $this->identity(RoleCode::TENANT_ADMIN);
        $this->as($foreignAdmin, $foreignTenant)->getJson("/api/v1/admin/properties/$id/features")->assertNotFound();
        $this->as($foreignAdmin, $foreignTenant)->deleteJson("/api/v1/admin/properties/$id/features/$otherFeature")->assertNotFound();
    }

    public function test_expenses_follow_existing_price_permissions(): void
    {
        [$tenant, $admin] = $this->identity(RoleCode::TENANT_ADMIN);
        $id = $this->as($admin, $tenant)->postJson('/api/v1/admin/properties', $this->propertyPayload([
            'expenses' => 25000, 'expenses_currency_code' => 'ARS',
        ]))->assertCreated()->json('data.public_id');
        $advisor = $this->user($tenant, RoleCode::SALES_ADVISOR);
        $this->settings($tenant->id, $advisor->id, 'ALL', canManagePrices: false);

        $this->as($advisor, $tenant)->patchJson("/api/v1/admin/properties/$id", [
            'version' => 1, 'rooms' => 3,
        ])->assertOk()->assertJsonPath('data.rooms', 3);
        $this->as($advisor, $tenant)->patchJson("/api/v1/admin/properties/$id", [
            'version' => 2, 'expenses' => 30000, 'expenses_currency_code' => 'ARS',
        ])->assertForbidden();
        $this->assertDatabaseHas('properties', ['public_id' => $id, 'expenses' => '25000.00', 'version' => 2]);

        $viewer = $this->user($tenant, RoleCode::SALES_ADVISOR);
        $this->settings($tenant->id, $viewer->id, 'ALL', canManagePrices: false);
        DB::table('user_inventory_settings')->where('tenant_id', $tenant->id)
            ->where('user_id', $viewer->id)->update(['can_view_prices' => false]);
        $this->as($viewer, $tenant)->getJson("/api/v1/admin/properties/$id")
            ->assertOk()->assertJsonMissingPath('data.expenses')->assertJsonMissingPath('data.expenses_currency_code');
    }

    public function test_scoped_editor_cannot_create_or_move_inventory_into_unscoped_project(): void
    {
        [$tenant, $editor] = $this->editor('SCOPED');
        $allowed = $this->project($tenant->id);
        $forbidden = $this->project($tenant->id);
        $this->scope($tenant->id, $editor->id, $allowed);

        $created = $this->as($editor, $tenant)->postJson('/api/v1/admin/properties', $this->propertyPayload(['project_id' => $allowed]))
            ->assertCreated();
        $this->as($editor, $tenant)->postJson('/api/v1/admin/properties', $this->propertyPayload(['project_id' => $forbidden]))
            ->assertForbidden();
        $this->as($editor, $tenant)->patchJson('/api/v1/admin/properties/'.$created->json('data.public_id'), [
            'version' => 1, 'project_id' => $forbidden,
        ])->assertForbidden();
        $this->as($editor, $tenant)->postJson('/api/v1/admin/properties/batch-generate', $this->batchPayload($forbidden))
            ->assertForbidden();
    }

    public function test_batch_never_assumes_currency_and_requires_price_permission(): void
    {
        [$tenant, $admin] = $this->identity(RoleCode::TENANT_ADMIN);
        $project = $this->project($tenant->id);

        $this->as($admin, $tenant)->postJson('/api/v1/admin/properties/batch-generate', $this->batchPayload($project, ['price' => 1000]))
            ->assertUnprocessable()->assertJsonValidationErrors('currency_code');
        $this->as($admin, $tenant)->postJson('/api/v1/admin/properties/batch-generate', $this->batchPayload($project, ['corner_price' => 0, 'corner_lots' => [1]]))
            ->assertUnprocessable()->assertJsonValidationErrors('currency_code');

        [, $editor] = [$tenant, $this->user($tenant, RoleCode::SALES_ADVISOR)];
        $this->settings($tenant->id, $editor->id, 'ALL', canManagePrices: false);
        $this->as($editor, $tenant)->postJson('/api/v1/admin/properties/batch-generate', $this->batchPayload($project, ['price' => 1000, 'currency_code' => 'ARS']))
            ->assertForbidden();
        $this->assertSame(0, DB::table('properties')->where('project_id', $project)->count());
    }

    public function test_batch_corner_price_zero_is_kept_and_status_follows_publish_permission(): void
    {
        [$tenant, $editor] = $this->editor();
        $project = $this->project($tenant->id);

        $this->as($editor, $tenant)->postJson('/api/v1/admin/properties/batch-generate', $this->batchPayload($project, [
            'lot_from' => 1, 'lot_to' => 2, 'price' => 5000, 'currency_code' => 'ARS', 'corner_lots' => [2], 'corner_price' => 0,
        ]))->assertCreated();

        $rows = DB::table('properties')->where('project_id', $project)->orderBy('unit_number')->get(['unit_number', 'price', 'currency_code', 'status']);
        $this->assertSame(['5000.00', '0.00'], $rows->pluck('price')->all());
        $this->assertSame(['ARS', 'ARS'], $rows->pluck('currency_code')->all());
        $this->assertSame(['NOT_MARKETED', 'NOT_MARKETED'], $rows->pluck('status')->all());
    }

    public function test_batch_identity_conflicts_instead_of_random_suffix_and_codeless_projects_do_not_collide(): void
    {
        [$tenant, $admin] = $this->identity(RoleCode::TENANT_ADMIN);
        $first = $this->project($tenant->id);
        $second = $this->project($tenant->id);

        $this->as($admin, $tenant)->postJson('/api/v1/admin/properties/batch-generate', $this->batchPayload($first))->assertCreated();
        $this->as($admin, $tenant)->postJson('/api/v1/admin/properties/batch-generate', $this->batchPayload($first))
            ->assertStatus(409);
        $this->assertSame(2, DB::table('properties')->where('project_id', $first)->count());
        $this->assertSame(0, DB::table('properties')->where('code', 'like', '%-____')->where('project_id', $first)->whereRaw("code REGEXP '-[0-9a-f]{4}$'")->count());

        // Two projects without code used to share the "PRJ" prefix and collide.
        $this->as($admin, $tenant)->postJson('/api/v1/admin/properties/batch-generate', $this->batchPayload($second))->assertCreated();
        $this->assertSame(2, DB::table('properties')->where('project_id', $second)->count());
    }

    public function test_batch_rejects_project_of_another_tenant(): void
    {
        [$tenant, $admin] = $this->identity(RoleCode::TENANT_ADMIN);
        $foreign = $this->project(Tenant::factory()->create()->id);

        $this->as($admin, $tenant)->postJson('/api/v1/admin/properties/batch-generate', $this->batchPayload($foreign))
            ->assertUnprocessable()->assertJsonValidationErrors('project_id');
    }

    /** @return array{Tenant, User} */
    private function editor(string $visibility = 'ALL'): array
    {
        $tenant = Tenant::factory()->create();
        $editor = $this->user($tenant, RoleCode::SALES_ADVISOR);
        $this->settings($tenant->id, $editor->id, $visibility, canManagePrices: true);

        return [$tenant, $editor];
    }

    /** @return array{Tenant, User} */
    private function identity(RoleCode $role): array
    {
        $tenant = Tenant::factory()->create();

        return [$tenant, $this->user($tenant, $role)];
    }

    private function user(Tenant $tenant, RoleCode $role): User
    {
        return User::factory()->for($tenant)->create(['role_code' => $role->value]);
    }

    private function settings(int $tenantId, int $userId, string $visibility, bool $canManagePrices): void
    {
        DB::table('user_inventory_settings')->insert([
            'tenant_id' => $tenantId, 'user_id' => $userId, 'workspace_mode' => 'BOTH', 'visibility_mode' => $visibility,
            'can_manage_inventory' => true, 'can_manage_prices' => $canManagePrices, 'can_view_prices' => true,
        ]);
    }

    private function scope(int $tenantId, int $userId, int $projectId): void
    {
        DB::table('user_inventory_scopes')->insert([
            'tenant_id' => $tenantId, 'user_id' => $userId, 'scope_type' => 'PROJECT', 'project_id' => $projectId,
            'property_id' => null, 'category_code' => null, 'can_view' => true, 'can_edit' => true, 'can_manage_prices' => true,
        ]);
    }

    private function project(int $tenantId): int
    {
        return (int) DB::table('projects')->insertGetId([
            'tenant_id' => $tenantId, 'public_id' => (string) Str::uuid(), 'code' => null, 'name' => 'Guard project '.Str::random(6),
            'project_type' => 'BUILDING', 'status' => 'PLANNING', 'progress' => 0, 'total_units' => 0, 'city' => 'Salta', 'province' => 'Salta',
        ]);
    }

    private function unit(int $tenantId, ?int $projectId, string $status): string
    {
        $uuid = (string) Str::uuid();
        DB::table('properties')->insert([
            'tenant_id' => $tenantId, 'public_id' => $uuid, 'project_id' => $projectId, 'title' => 'Guard unit',
            'operation' => 'SALE', 'category' => 'HOUSE', 'status' => $status, 'city' => 'Salta', 'province' => 'Salta', 'version' => 1,
        ]);

        return $uuid;
    }

    /** @param array<string, mixed> $overrides
     * @return array<string, mixed>
     */
    private function propertyPayload(array $overrides = []): array
    {
        return array_replace([
            'title' => 'Unidad de prueba', 'operation' => 'SALE', 'category' => 'HOUSE', 'city' => 'Salta', 'province' => 'Salta',
        ], $overrides);
    }

    /** @param array<string, mixed> $overrides
     * @return array<string, mixed>
     */
    private function batchPayload(int $projectId, array $overrides = []): array
    {
        return array_replace([
            'project_id' => $projectId, 'sector_name' => 'Manzana A', 'lot_from' => 1, 'lot_to' => 2, 'area_m2' => 300,
        ], $overrides);
    }

    private function as(User $user, Tenant $tenant): self
    {
        return $this->actingAs($user)->withHeaders(['X-Everprop-Tenant' => $tenant->public_id, 'Origin' => 'http://localhost:5173']);
    }
}
