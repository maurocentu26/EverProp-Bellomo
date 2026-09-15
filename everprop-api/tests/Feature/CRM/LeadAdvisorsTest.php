<?php

namespace Tests\Feature\CRM;

use App\Domain\Identity\Enums\RoleCode;
use App\Domain\Tenancy\Models\Tenant;
use App\Models\User;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Tests\TestCase;

final class LeadAdvisorsTest extends TestCase
{
    use DatabaseTransactions;

    public function test_only_commercial_managers_can_list_active_advisors_in_their_tenant(): void
    {
        $tenant = Tenant::factory()->create();
        $admin = User::factory()->for($tenant)->create(['role_code' => RoleCode::TENANT_ADMIN->value]);
        $advisor = User::factory()->for($tenant)->create(['role_code' => RoleCode::SALES_ADVISOR->value]);
        $paused = User::factory()->for($tenant)->create(['role_code' => RoleCode::SALES_ADVISOR->value, 'status' => 'PAUSED']);
        $other = User::factory()->create(['role_code' => RoleCode::SALES_ADVISOR->value]);
        $this->actingAs($admin)->withHeaders(['X-Everprop-Tenant' => $tenant->public_id, 'Origin' => 'http://localhost:5173']);
        $this->getJson('/api/v1/admin/lead-advisors')->assertOk()->assertJsonFragment(['id' => $advisor->public_id])->assertJsonMissing(['id' => $paused->public_id])->assertJsonMissing(['id' => $other->public_id]);
        $this->actingAs($advisor)->getJson('/api/v1/admin/lead-advisors')->assertForbidden();
    }
}
