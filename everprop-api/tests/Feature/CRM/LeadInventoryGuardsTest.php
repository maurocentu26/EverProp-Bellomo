<?php

namespace Tests\Feature\CRM;

use App\Domain\Identity\Enums\RoleCode;
use App\Domain\Tenancy\Models\Tenant;
use App\Models\User;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Tests\TestCase;

/** G0 / E02 + E04: CRM respects inventory visibility, price visibility and retired assets. */
final class LeadInventoryGuardsTest extends TestCase
{
    use DatabaseTransactions;

    public function test_new_links_reject_deleted_and_out_of_scope_properties(): void
    {
        [$tenant, $advisor, $leadUuid] = $this->fixture('SCOPED', canViewPrices: true);
        $inScope = $this->property($tenant->id, $this->project($tenant->id, $advisor->id));
        $outOfScope = $this->property($tenant->id, $this->project($tenant->id));
        $deleted = $this->property($tenant->id, $this->project($tenant->id, $advisor->id), deleted: true);
        $path = "/api/v1/admin/leads/$leadUuid/properties";

        $this->as($advisor, $tenant)->postJson($path, ['property_id' => $inScope])->assertOk();
        $this->as($advisor, $tenant)->postJson($path, ['property_id' => $outOfScope])->assertNotFound();
        $this->as($advisor, $tenant)->postJson($path, ['property_id' => $deleted])->assertNotFound();
        $this->as($advisor, $tenant)->postJson('/api/v1/admin/leads', ['name' => 'Nuevo', 'property_id' => $deleted])
            ->assertUnprocessable()->assertJsonValidationErrors('property_id');

        $this->assertSame(1, DB::table('lead_properties')->where('tenant_id', $tenant->id)->count());
    }

    public function test_links_and_visits_never_reach_another_tenants_property(): void
    {
        [$tenant, $advisor, $leadUuid] = $this->fixture('ALL', canViewPrices: true);
        $otherTenant = Tenant::factory()->create();
        $foreign = $this->property($otherTenant->id, null);
        $foreignId = (string) DB::table('properties')->where('public_id', $foreign)->value('id');

        $this->as($advisor, $tenant)->postJson("/api/v1/admin/leads/$leadUuid/properties", ['property_id' => $foreign])->assertNotFound();
        $this->as($advisor, $tenant)->postJson("/api/v1/admin/leads/$leadUuid/properties", ['property_id' => $foreignId])->assertNotFound();
        $this->as($advisor, $tenant)->postJson('/api/v1/admin/visits', [
            'lead_id' => $leadUuid, 'property_id' => $foreign, 'scheduled_at' => now()->addDay()->toISOString(),
        ])->assertStatus(422);

        $this->assertSame(0, DB::table('lead_properties')->where('tenant_id', $tenant->id)->count());
        $this->assertSame(0, DB::table('visits')->where('tenant_id', $tenant->id)->count());
    }

    public function test_linked_property_price_is_hidden_without_price_visibility(): void
    {
        [$tenant, $advisor, $leadUuid, $leadId] = $this->fixture('ALL', canViewPrices: false);
        $property = $this->property($tenant->id, null);
        DB::table('lead_properties')->insert([
            'tenant_id' => $tenant->id, 'lead_id' => $leadId,
            'property_id' => DB::table('properties')->where('public_id', $property)->value('id'),
            'interest_level' => 'MEDIUM', 'status' => 'ACTIVE', 'linked_at' => now(), 'last_activity_at' => now(),
        ]);

        $this->as($advisor, $tenant)->getJson("/api/v1/admin/leads/$leadUuid")->assertOk()
            ->assertJsonPath('data.properties.0.price', null)
            ->assertJsonPath('data.properties.0.currency', null);
        $this->as($advisor, $tenant)->getJson('/api/v1/admin/leads')->assertOk()
            ->assertJsonPath('data.0.properties.0.price', null);
    }

    public function test_visit_rejects_retired_property_and_replays_double_submit(): void
    {
        [$tenant, $advisor, $leadUuid] = $this->fixture('ALL', canViewPrices: true);
        $deleted = $this->property($tenant->id, null, deleted: true);
        $active = $this->property($tenant->id, null);
        $body = ['lead_id' => $leadUuid, 'scheduled_at' => now()->addDay()->startOfHour()->toISOString()];

        $this->as($advisor, $tenant)->postJson('/api/v1/admin/visits', $body + ['property_id' => $deleted])->assertStatus(422);

        $first = $this->as($advisor, $tenant)->postJson('/api/v1/admin/visits', $body + ['property_id' => $active])
            ->assertCreated()->assertJsonPath('data.replayed', false);
        $this->as($advisor, $tenant)->postJson('/api/v1/admin/visits', $body + ['property_id' => $active])
            ->assertOk()->assertJsonPath('data.id', $first->json('data.id'))->assertJsonPath('data.replayed', true);

        $this->assertSame(1, DB::table('visits')->where('tenant_id', $tenant->id)->count());
    }

    /** @return array{Tenant, User, string, int} */
    private function fixture(string $visibility, bool $canViewPrices): array
    {
        $tenant = Tenant::factory()->create();
        $advisor = User::factory()->for($tenant)->create(['role_code' => RoleCode::SALES_ADVISOR->value]);
        DB::table('user_inventory_settings')->insert([
            'tenant_id' => $tenant->id, 'user_id' => $advisor->id, 'workspace_mode' => 'BOTH', 'visibility_mode' => $visibility,
            'can_manage_inventory' => false, 'can_manage_prices' => false, 'can_view_prices' => $canViewPrices,
        ]);
        $contact = DB::table('contacts')->insertGetId([
            'tenant_id' => $tenant->id, 'public_id' => (string) Str::uuid(), 'display_name' => 'Guard contact',
            'first_seen_at' => now(), 'last_seen_at' => now(),
        ]);
        DB::table('pipeline_stages')->insert([
            'tenant_id' => $tenant->id, 'code' => 'NEW', 'name' => 'New', 'category' => 'OPEN', 'position' => 1,
        ]);
        $leadUuid = (string) Str::uuid();
        $leadId = (int) DB::table('leads')->insertGetId([
            'tenant_id' => $tenant->id, 'public_id' => $leadUuid, 'contact_id' => $contact,
            'stage_id' => DB::table('pipeline_stages')->where('tenant_id', $tenant->id)->value('id'),
            'assigned_user_id' => $advisor->id, 'source_channel' => 'WEB_FORM', 'source_kind' => 'CONTACT_FORM',
            'title' => 'Guard lead', 'first_touch_at' => now(), 'last_touch_at' => now(),
        ]);

        return [$tenant, $advisor, $leadUuid, $leadId];
    }

    private function project(int $tenantId, ?int $scopedUserId = null): int
    {
        $id = (int) DB::table('projects')->insertGetId([
            'tenant_id' => $tenantId, 'public_id' => (string) Str::uuid(), 'name' => 'Guard project '.Str::random(6),
            'project_type' => 'BUILDING', 'status' => 'PLANNING', 'progress' => 0, 'total_units' => 0, 'city' => 'Salta', 'province' => 'Salta',
        ]);
        if ($scopedUserId !== null) {
            DB::table('user_inventory_scopes')->insert([
                'tenant_id' => $tenantId, 'user_id' => $scopedUserId, 'scope_type' => 'PROJECT', 'project_id' => $id,
                'property_id' => null, 'category_code' => null, 'can_view' => true, 'can_edit' => false, 'can_manage_prices' => false,
            ]);
        }

        return $id;
    }

    private function property(int $tenantId, ?int $projectId, bool $deleted = false): string
    {
        $uuid = (string) Str::uuid();
        DB::table('properties')->insert([
            'tenant_id' => $tenantId, 'public_id' => $uuid, 'project_id' => $projectId, 'title' => 'Guard unit',
            'operation' => 'SALE', 'category' => 'HOUSE', 'status' => 'AVAILABLE', 'price' => 120000, 'currency_code' => 'USD',
            'city' => 'Salta', 'province' => 'Salta', 'deleted_at' => $deleted ? now() : null,
        ]);

        return $uuid;
    }

    private function as(User $user, Tenant $tenant): self
    {
        return $this->actingAs($user)->withHeaders(['X-Everprop-Tenant' => $tenant->public_id, 'Origin' => 'http://localhost:5173']);
    }
}
