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
        $this->postJson('/api/v1/admin/leads', ['name' => 'Forbidden'])->assertForbidden();
        $this->deleteJson('/api/v1/admin/leads/'.$lead)->assertForbidden();
        foreach (['projects', 'properties', 'users', 'installments'] as $module) {
            $this->getJson('/api/v1/admin/'.$module)->assertForbidden();
        }
        $this->withHeaders(['X-Everprop-Tenant' => $foreign->tenant->public_id])->getJson('/api/v1/admin/leads')->assertNotFound();
    }
}
