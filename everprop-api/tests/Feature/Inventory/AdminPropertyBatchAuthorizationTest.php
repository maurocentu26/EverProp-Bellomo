<?php

namespace Tests\Feature\Inventory;

use App\Domain\Identity\Enums\RoleCode;
use App\Domain\Tenancy\Models\Tenant;
use App\Models\User;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Tests\TestCase;

final class AdminPropertyBatchAuthorizationTest extends TestCase
{
    use DatabaseTransactions;

    public function test_advisor_cannot_batch_generate_outside_inventory_scope(): void
    {
        [$tenant, $advisor] = $this->advisor();
        $scopedProject = $this->project($tenant->id, 'Scoped');
        $otherProject = $this->project($tenant->id, 'Other');
        $this->scopeProject($tenant->id, $advisor->id, $scopedProject);
        $this->actingAs($advisor);

        $this->withHeaders($this->tenantHeaders($tenant))
            ->postJson('/api/v1/admin/properties/batch-generate', $this->payload($otherProject))
            ->assertForbidden();
    }

    public function test_advisor_without_price_permission_cannot_set_batch_prices(): void
    {
        [$tenant, $advisor] = $this->advisor();
        $project = $this->project($tenant->id, 'Priced');
        $this->scopeProject($tenant->id, $advisor->id, $project);
        $this->actingAs($advisor);

        $this->withHeaders($this->tenantHeaders($tenant))
            ->postJson('/api/v1/admin/properties/batch-generate', $this->payload($project) + [
                'price' => 100000,
                'currency_code' => 'USD',
            ])
            ->assertForbidden();
    }

    public function test_batch_project_validation_does_not_accept_another_tenants_internal_id(): void
    {
        [$tenant, $advisor] = $this->advisor();
        $otherTenant = Tenant::factory()->create();
        $otherProject = $this->project($otherTenant->id, 'Other tenant');
        $this->actingAs($advisor);

        $this->withHeaders($this->tenantHeaders($tenant))
            ->postJson('/api/v1/admin/properties/batch-generate', $this->payload($otherProject))
            ->assertUnprocessable()
            ->assertJsonValidationErrors('project_id');
    }

    /** @return array{Tenant, User} */
    private function advisor(): array
    {
        $tenant = Tenant::factory()->create();
        $advisor = User::factory()->for($tenant)->create([
            'role_code' => RoleCode::SALES_ADVISOR->value,
        ]);
        DB::table('user_inventory_settings')->insert([
            'tenant_id' => $tenant->id,
            'user_id' => $advisor->id,
            'workspace_mode' => 'BOTH',
            'visibility_mode' => 'SCOPED',
            'can_manage_inventory' => true,
            'can_manage_prices' => false,
            'can_view_prices' => true,
        ]);

        return [$tenant, $advisor];
    }

    private function project(int $tenantId, string $name): int
    {
        return (int) DB::table('projects')->insertGetId([
            'tenant_id' => $tenantId,
            'public_id' => (string) Str::uuid(),
            'code' => 'QA-'.strtoupper($name).'-'.Str::random(6),
            'name' => $name,
            'project_type' => 'LAND_DEVELOPMENT',
            'status' => 'PLANNING',
            'progress' => 0,
            'total_units' => 0,
            'city' => 'Salta',
            'province' => 'Salta',
        ]);
    }

    private function scopeProject(int $tenantId, int $userId, int $projectId): void
    {
        DB::table('user_inventory_scopes')->insert([
            'tenant_id' => $tenantId,
            'user_id' => $userId,
            'scope_type' => 'PROJECT',
            'project_id' => $projectId,
            'property_id' => null,
            'category_code' => null,
            'can_view' => true,
            'can_edit' => true,
            'can_manage_prices' => false,
        ]);
    }

    /** @return array<string, mixed> */
    private function payload(int $projectId): array
    {
        return [
            'project_id' => $projectId,
            'sector_name' => 'QA',
            'lot_from' => 1,
            'lot_to' => 1,
            'area_m2' => 300,
        ];
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
