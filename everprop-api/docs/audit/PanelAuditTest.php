<?php

namespace Tests\Audit;

use App\Domain\Identity\Enums\RoleCode;
use App\Domain\Tenancy\Models\Tenant;
use App\Models\User;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Tests\TestCase;

/** Security expectations for the audit; deliberately outside the regular suite. */
final class PanelAuditTest extends TestCase
{
    use DatabaseTransactions;

    private function fixture(): array
    {
        self::assertTrue(app()->environment('testing'));
        self::assertStringContainsString('test', DB::connection()->getDatabaseName());
        $tenant = Tenant::factory()->create();
        $user = User::factory()->for($tenant)->create(['role_code' => RoleCode::SALES_ADVISOR->value]);
        DB::table('user_inventory_settings')->insert([
            'tenant_id' => $tenant->id, 'user_id' => $user->id, 'workspace_mode' => 'BOTH',
            'visibility_mode' => 'ALL', 'can_manage_inventory' => true,
            'can_manage_prices' => false, 'can_view_prices' => false,
        ]);
        $contact = DB::table('contacts')->insertGetId([
            'tenant_id' => $tenant->id, 'public_id' => (string) Str::uuid(), 'display_name' => 'Audit fixture',
            'first_seen_at' => now(), 'last_seen_at' => now(),
        ]);
        $stage = DB::table('pipeline_stages')->insertGetId([
            'tenant_id' => $tenant->id, 'code' => 'NEW', 'name' => 'New', 'category' => 'OPEN', 'position' => 1,
        ]);
        $lead = (string) Str::uuid();
        DB::table('leads')->insert([
            'tenant_id' => $tenant->id, 'public_id' => $lead, 'contact_id' => $contact, 'stage_id' => $stage,
            'assigned_user_id' => $user->id, 'source_channel' => 'WEB_FORM', 'source_kind' => 'CONTACT_FORM',
            'title' => 'Audit fixture', 'first_touch_at' => now(), 'last_touch_at' => now(),
        ]);
        $property = (string) Str::uuid();
        DB::table('properties')->insert([
            'tenant_id' => $tenant->id, 'public_id' => $property, 'title' => 'Audit property',
            'operation' => 'SALE', 'category' => 'HOUSE', 'status' => 'AVAILABLE',
            'price' => 123456, 'currency_code' => 'USD', 'city' => 'Salta', 'province' => 'Salta',
        ]);
        $this->actingAs($user)->withHeaders(['X-Everprop-Tenant' => $tenant->public_id, 'Origin' => 'http://localhost:5173']);
        return [$tenant, $user, $lead, $property];
    }

    public function test_lead_response_must_respect_hidden_inventory_prices(): void
    {
        [, , $lead, $property] = $this->fixture();
        $this->getJson('/api/v1/admin/properties/'.$property)->assertOk()->assertJsonMissing(['price' => 123456]);
        $this->postJson('/api/v1/admin/leads/'.$lead.'/properties', ['property_id' => $property])->assertOk();
        $this->getJson('/api/v1/admin/leads/'.$lead)->assertOk()->assertJsonMissing(['price' => 123456]);
    }

    public function test_deleted_property_must_not_be_attachable(): void
    {
        [, , $lead, $property] = $this->fixture();
        DB::table('properties')->where('public_id', $property)->update(['deleted_at' => now()]);
        $this->postJson('/api/v1/admin/leads/'.$lead.'/properties', ['property_id' => $property])->assertNotFound();
    }

    public function test_batch_must_enforce_same_price_permission_as_single_create(): void
    {
        [$tenant] = $this->fixture();
        $this->postJson('/api/v1/admin/properties', [
            'title' => 'Audit single', 'operation' => 'SALE', 'category' => 'LOT',
            'city' => 'Salta', 'province' => 'Salta', 'price' => 100, 'currency_code' => 'USD',
        ])->assertForbidden();
        $project = DB::table('projects')->insertGetId([
            'tenant_id' => $tenant->id, 'public_id' => (string) Str::uuid(), 'name' => 'Audit project',
            'project_type' => 'BUILDING', 'status' => 'PLANNING', 'progress' => 0, 'total_units' => 0,
            'city' => 'Salta', 'province' => 'Salta',
        ]);
        $this->postJson('/api/v1/admin/properties/batch-generate', [
            'project_id' => $project, 'sector_name' => 'Audit', 'lot_from' => 1, 'lot_to' => 1,
            'area_m2' => 100, 'price' => 100, 'currency_code' => 'USD',
        ])->assertForbidden();
    }

    public function test_unsupported_lead_delete_must_not_return_server_error(): void
    {
        [, , $lead] = $this->fixture();
        $response = $this->deleteJson('/api/v1/admin/leads/'.$lead);
        self::assertLessThan(500, $response->status());
    }
}
