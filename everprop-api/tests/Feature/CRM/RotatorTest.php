<?php

namespace Tests\Feature\CRM;

use App\Domain\Identity\Enums\RoleCode;
use App\Domain\Tenancy\Models\Tenant;
use App\Models\User;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Tests\TestCase;

final class RotatorTest extends TestCase
{
    use DatabaseTransactions;

    public function test_rotator_manages_commercial_data_for_leads_and_visits(): void
    {
        $tenant = Tenant::factory()->create();
        $admin = User::factory()->for($tenant)->create(['role_code' => RoleCode::TENANT_ADMIN]);
        $rotator = User::factory()->for($tenant)->create(['role_code' => RoleCode::ROTATOR]);
        $advisor = User::factory()->for($tenant)->create(['role_code' => RoleCode::SALES_ADVISOR]);
        $paused = User::factory()->for($tenant)->create(['role_code' => RoleCode::SALES_ADVISOR, 'status' => 'PAUSED']);
        $foreign = User::factory()->create(['role_code' => RoleCode::SALES_ADVISOR]);
        DB::table('pipeline_stages')->insert(['tenant_id' => $tenant->id, 'code' => 'NEW', 'name' => 'Nuevo', 'category' => 'OPEN', 'position' => 1]);
        $this->actingAs($admin)->withHeaders(['X-Everprop-Tenant' => $tenant->public_id]);
        $lead = $this->postJson('/api/v1/admin/leads', ['name' => 'Lead para rotar'])->assertCreated()->json('data.id');
        $property = (string) Str::uuid();
        DB::table('properties')->insert([
            'tenant_id' => $tenant->id, 'public_id' => $property, 'title' => 'Casa de interés',
            'operation' => 'SALE', 'category' => 'HOUSE', 'status' => 'AVAILABLE',
            'price' => 120000, 'currency_code' => 'USD', 'city' => 'Salta', 'province' => 'Salta',
        ]);
        $this->actingAs($rotator);
        $this->getJson('/api/v1/admin/leads')->assertOk()->assertJsonFragment(['id' => $lead]);
        $this->getJson('/api/v1/admin/lead-advisors')->assertOk()->assertJsonFragment(['id' => $advisor->public_id])->assertJsonMissing(['id' => $paused->public_id])->assertJsonMissing(['id' => $foreign->public_id]);
        // Rotator can update lead assignment and commercial notes
        $this->putJson('/api/v1/admin/leads/'.$lead, ['agent_id' => $advisor->public_id, 'notes' => 'Notas del rotador'])->assertOk();
        $this->assertDatabaseHas('leads', ['public_id' => $lead, 'assigned_user_id' => $advisor->id, 'notes' => 'Notas del rotador']);

        // Rotator can read catalog
        $this->getJson('/api/v1/admin/projects')->assertOk();
        $this->getJson('/api/v1/admin/properties')->assertOk();

        // Rotator cannot manage administrative modules
        foreach (['users', 'installments'] as $module) {
            $this->getJson('/api/v1/admin/'.$module)->assertForbidden();
        }

        // Rotator can manage lead properties and visits
        $this->postJson('/api/v1/admin/leads/'.$lead.'/properties', ['property_id' => $property, 'notes' => 'Interés agregado por rotador'])->assertOk();
        $this->postJson('/api/v1/admin/visits', ['lead_id' => $lead, 'scheduled_at' => now()->addDay()->toISOString()])->assertCreated();

        $this->withHeaders(['X-Everprop-Tenant' => $foreign->tenant->public_id])->getJson('/api/v1/admin/leads')->assertNotFound();
    }

    public function test_rotator_creates_new_leads_with_optional_properties_and_commercial_fields(): void
    {
        $tenant = Tenant::factory()->create();
        $rotator = User::factory()->for($tenant)->create(['role_code' => RoleCode::ROTATOR]);
        $advisor = User::factory()->for($tenant)->create(['role_code' => RoleCode::SALES_ADVISOR]);
        $paused = User::factory()->for($tenant)->create(['role_code' => RoleCode::SALES_ADVISOR, 'status' => 'PAUSED']);
        $foreign = User::factory()->create(['role_code' => RoleCode::SALES_ADVISOR]);
        $stageId = DB::table('pipeline_stages')->insertGetId(['tenant_id' => $tenant->id, 'code' => 'NEW', 'name' => 'Nuevo', 'category' => 'OPEN', 'position' => 1]);
        $property = (string) Str::uuid();
        DB::table('properties')->insert([
            'tenant_id' => $tenant->id, 'public_id' => $property, 'title' => 'Depto Centro',
            'operation' => 'SALE', 'category' => 'APARTMENT', 'status' => 'AVAILABLE',
            'price' => 95000, 'currency_code' => 'USD', 'city' => 'Salta', 'province' => 'Salta',
        ]);

        $this->actingAs($rotator)->withHeaders(['X-Everprop-Tenant' => $tenant->public_id]);
        $lead = $this->postJson('/api/v1/admin/leads', [
            'name' => 'Lead con inmueble por rotador', 'email' => 'lead@example.invalid', 'phone' => '+5493881234567',
            'source_channel' => 'WHATSAPP', 'priority' => 'HIGH', 'budget' => 120000, 'currency' => 'USD',
            'notes' => 'Busca vivienda céntrica', 'agent_id' => $advisor->public_id, 'property_id' => $property,
        ])->assertCreated()->json('data.id');

        $this->assertDatabaseHas('leads', [
            'public_id' => $lead, 'tenant_id' => $tenant->id, 'stage_id' => $stageId,
            'assigned_user_id' => $advisor->id,
            'source_channel' => 'WHATSAPP', 'priority' => 'HIGH', 'budget_max' => 120000,
            'currency_code' => 'USD', 'notes' => 'Busca vivienda céntrica',
        ]);
        $leadId = DB::table('leads')->where('public_id', $lead)->value('id');
        $this->assertDatabaseHas('lead_properties', ['lead_id' => $leadId]);

        foreach ([$paused, $foreign, $rotator] as $invalid) {
            $this->postJson('/api/v1/admin/leads', ['name' => 'Inválido', 'agent_id' => $invalid->public_id])
                ->assertUnprocessable()->assertJsonValidationErrors('agent_id');
        }
        $this->withHeaders(['X-Everprop-Tenant' => $foreign->tenant->public_id])
            ->postJson('/api/v1/admin/leads', ['name' => 'Otro tenant'])->assertNotFound();
    }
}
