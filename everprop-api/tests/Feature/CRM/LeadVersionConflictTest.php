<?php

namespace Tests\Feature\CRM;

use App\Domain\Identity\Enums\RoleCode;
use App\Domain\Tenancy\Models\Tenant;
use App\Models\User;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/** EVP-134: an advisor's notes were silently overwritten by an admin who had loaded the lead before. */
final class LeadVersionConflictTest extends TestCase
{
    use DatabaseTransactions;

    public function test_two_saves_from_the_same_version_the_second_gets_409_and_nothing_is_lost(): void
    {
        $tenant = Tenant::factory()->create();
        $admin = User::factory()->for($tenant)->create(['role_code' => RoleCode::TENANT_ADMIN->value]);
        $advisor = User::factory()->for($tenant)->create(['role_code' => RoleCode::SALES_ADVISOR->value]);
        DB::table('pipeline_stages')->insert(['tenant_id' => $tenant->id, 'code' => 'NEW', 'name' => 'Nuevo', 'category' => 'OPEN', 'position' => 1]);
        $this->withHeaders(['X-Everprop-Tenant' => $tenant->public_id, 'Origin' => 'http://localhost:5173']);

        $lead = $this->actingAs($admin)->postJson('/api/v1/admin/leads', ['name' => 'Lead compartido', 'agent_id' => $advisor->public_id])
            ->assertCreated()->json('data.id');
        // Both load the lead: show and index return the same version.
        $loaded = $this->actingAs($advisor)->getJson('/api/v1/admin/leads/'.$lead)->assertOk()->json('data.version');
        $this->assertIsInt($loaded);
        /** @var list<array{id: string, version: int}> $index */
        $index = $this->actingAs($admin)->getJson('/api/v1/admin/leads')->json('data');
        $this->assertSame($loaded, collect($index)->firstWhere('id', $lead)['version'] ?? null);

        $this->actingAs($advisor)->patchJson('/api/v1/admin/leads/'.$lead, ['notes' => 'Version A del asesor', 'version' => $loaded])
            ->assertOk()->assertJsonPath('version', $loaded + 1);
        $this->actingAs($admin)->patchJson('/api/v1/admin/leads/'.$lead, ['notes' => 'Version B del admin', 'version' => $loaded])
            ->assertStatus(409)->assertJsonPath('error.code', 'LEAD_VERSION_CONFLICT')->assertJsonPath('data.version', $loaded + 1);
        $this->assertSame('Version A del asesor', DB::table('leads')->where('public_id', $lead)->value('notes'));

        // After reloading, the admin saves on purpose with the current version.
        $this->actingAs($admin)->patchJson('/api/v1/admin/leads/'.$lead, ['notes' => 'Version B del admin', 'version' => $loaded + 1])
            ->assertOk()->assertJsonPath('version', $loaded + 2);

        // Without a version (single-field actions, older panel): still saved, and the version still moves.
        $this->actingAs($admin)->patchJson('/api/v1/admin/leads/'.$lead, ['priority' => 'HIGH'])->assertOk()->assertJsonPath('version', $loaded + 3);
        $this->actingAs($admin)->patchJson('/api/v1/admin/leads/'.$lead, ['notes' => 'x', 'version' => 0])->assertUnprocessable();
    }
}
