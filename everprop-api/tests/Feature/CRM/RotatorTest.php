<?php

namespace Tests\Feature\CRM;

use App\Domain\Identity\Enums\RoleCode;
use App\Domain\Tenancy\Models\Tenant;
use App\Models\User;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

final class RotatorTest extends TestCase
{
    use DatabaseTransactions;

    public function test_rotator_assigns_only_active_tenant_advisors_without_other_write_permissions(): void
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
        $this->actingAs($rotator);
        $this->getJson('/api/v1/admin/leads')->assertOk()->assertJsonFragment(['id' => $lead]);
        $this->getJson('/api/v1/admin/lead-advisors')->assertOk()->assertJsonFragment(['id' => $advisor->public_id])->assertJsonMissing(['id' => $paused->public_id])->assertJsonMissing(['id' => $foreign->public_id]);
        $this->putJson('/api/v1/admin/leads/'.$lead, ['agent_id' => $advisor->public_id])->assertOk();
        $this->assertDatabaseHas('leads', ['public_id' => $lead, 'assigned_user_id' => $advisor->id]);
        foreach ([$paused, $foreign, $rotator] as $invalid) {
            $this->putJson('/api/v1/admin/leads/'.$lead, ['agent_id' => $invalid->public_id])->assertUnprocessable();
        }
        $this->putJson('/api/v1/admin/leads/'.$lead, ['agent_id' => $advisor->public_id, 'notes' => 'Forbidden'])->assertForbidden();
        $this->postJson('/api/v1/admin/leads', ['name' => 'Nuevo lead del rotador'])->assertCreated();
        $this->deleteJson('/api/v1/admin/leads/'.$lead)->assertForbidden();
        foreach (['projects', 'properties', 'users', 'installments'] as $module) {
            $this->getJson('/api/v1/admin/'.$module)->assertForbidden();
        }
        $this->withHeaders(['X-Everprop-Tenant' => $foreign->tenant->public_id])->getJson('/api/v1/admin/leads')->assertNotFound();
    }

    public function test_rotator_creates_new_leads_only_in_its_tenant_without_properties(): void
    {
        $tenant = Tenant::factory()->create();
        $rotator = User::factory()->for($tenant)->create(['role_code' => RoleCode::ROTATOR]);
        $advisor = User::factory()->for($tenant)->create(['role_code' => RoleCode::SALES_ADVISOR]);
        $paused = User::factory()->for($tenant)->create(['role_code' => RoleCode::SALES_ADVISOR, 'status' => 'PAUSED']);
        $foreign = User::factory()->create(['role_code' => RoleCode::SALES_ADVISOR]);
        $stageId = DB::table('pipeline_stages')->insertGetId(['tenant_id' => $tenant->id, 'code' => 'NEW', 'name' => 'Nuevo', 'category' => 'OPEN', 'position' => 1]);
        DB::table('pipeline_stages')->insert([
            ['tenant_id' => $tenant->id, 'code' => 'WON', 'name' => 'Ganado', 'category' => 'WON', 'position' => 2],
            ['tenant_id' => $tenant->id, 'code' => 'LOST', 'name' => 'Perdido', 'category' => 'LOST', 'position' => 3],
        ]);
        $this->actingAs($rotator)->withHeaders(['X-Everprop-Tenant' => $tenant->public_id]);
        foreach ([null, $advisor->public_id] as $assigned) {
            $lead = $this->postJson('/api/v1/admin/leads', [
                'name' => 'Lead creado por rotador', 'email' => 'lead@example.invalid', 'phone' => '+5493881234567',
                'source_channel' => 'WHATSAPP', 'priority' => 'HIGH', 'budget' => 120000, 'currency' => 'USD',
                'notes' => 'Busca vivienda', 'agent_id' => $assigned, 'tenant_id' => $foreign->tenant_id,
            ])->assertCreated()->json('data.id');
            $this->assertDatabaseHas('leads', [
                'public_id' => $lead, 'tenant_id' => $tenant->id, 'stage_id' => $stageId,
                'assigned_user_id' => $assigned === null ? null : $advisor->id,
                'source_channel' => 'WHATSAPP', 'priority' => 'HIGH', 'budget_max' => 120000,
                'currency_code' => 'USD', 'notes' => 'Busca vivienda',
            ]);
            $this->assertDatabaseHas('contacts', ['tenant_id' => $tenant->id, 'email' => 'lead@example.invalid', 'phone_e164' => '+5493881234567']);
            $leadId = DB::table('leads')->where('public_id', $lead)->value('id');
            $this->assertDatabaseMissing('lead_properties', ['lead_id' => $leadId]);
            $this->patchJson('/api/v1/admin/leads/'.$lead, ['agent_id' => $assigned, 'notes' => 'Modificada'])->assertForbidden();
        }
        $leadsBefore = DB::table('leads')->where('tenant_id', $tenant->id)->count();
        $contactsBefore = DB::table('contacts')->where('tenant_id', $tenant->id)->count();
        foreach ([$paused, $foreign, $rotator] as $invalid) {
            $this->postJson('/api/v1/admin/leads', ['name' => 'Inválido', 'agent_id' => $invalid->public_id])
                ->assertUnprocessable()->assertJsonValidationErrors('agent_id');
        }
        foreach (['CONTACTED', 'WON', 'LOST'] as $stage) {
            $this->postJson('/api/v1/admin/leads', ['name' => 'Inválido', 'stage' => $stage])
                ->assertUnprocessable()->assertJsonValidationErrors('stage');
        }
        $this->postJson('/api/v1/admin/leads', ['name' => 'Inválido', 'property_id' => 'any-property'])
            ->assertUnprocessable()->assertJsonValidationErrors('property_id');
        $this->assertSame($leadsBefore, DB::table('leads')->where('tenant_id', $tenant->id)->count());
        $this->assertSame($contactsBefore, DB::table('contacts')->where('tenant_id', $tenant->id)->count());
        $this->withHeaders(['X-Everprop-Tenant' => $foreign->tenant->public_id])
            ->postJson('/api/v1/admin/leads', ['name' => 'Otro tenant'])->assertNotFound();
    }
}
