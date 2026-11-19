<?php

namespace Tests\Feature\CRM;

use App\Domain\Identity\Enums\RoleCode;
use App\Domain\Tenancy\Models\Tenant;
use App\Models\User;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/** EVP-133: assigning and reassigning from the panel left no history, the wrong method and a misleading notice. */
final class LeadAssignmentHistoryTest extends TestCase
{
    use DatabaseTransactions;

    /** @return list<string> */
    private function titles(User $user): array
    {
        return DB::table('notifications')->where('notifiable_id', $user->id)->orderBy('created_at')->pluck('data')
            ->map(fn ($data) => json_decode((string) $data, true)['title'])->all();
    }

    public function test_assign_then_reassign_records_history_method_dates_and_tells_both_advisors(): void
    {
        $tenant = Tenant::factory()->create();
        $admin = User::factory()->for($tenant)->create(['role_code' => RoleCode::TENANT_ADMIN->value]);
        [$ana, $beto] = User::factory()->for($tenant)->count(2)->create(['role_code' => RoleCode::SALES_ADVISOR->value])->all();
        DB::table('pipeline_stages')->insert(['tenant_id' => $tenant->id, 'code' => 'NEW', 'name' => 'Nuevo', 'category' => 'OPEN', 'position' => 1]);
        $this->actingAs($admin)->withHeaders(['X-Everprop-Tenant' => $tenant->public_id, 'Origin' => 'http://localhost:5173']);

        $public = $this->postJson('/api/v1/admin/leads', ['name' => 'Lead sin asesor'])->assertCreated()->json('data.id');
        $lead = fn () => DB::table('leads')->where('public_id', $public)->first();
        $history = fn () => DB::table('lead_assignments')->where('lead_id', $lead()->id)->orderBy('id')->get();
        $this->assertSame('UNASSIGNED', $lead()->assignment_method);
        $this->assertCount(0, $history());

        $this->patchJson('/api/v1/admin/leads/'.$public, ['agent_id' => $ana->public_id])->assertOk();
        $first = $lead();
        $this->assertSame([(int) $ana->id, 'MANUAL'], [(int) $first->assigned_user_id, $first->assignment_method]);
        $this->assertNotNull($first->first_assigned_at);
        $this->assertSame($first->first_assigned_at, $first->last_assigned_at);

        $this->travel(5)->minutes();
        $this->patchJson('/api/v1/admin/leads/'.$public, ['agent_id' => $beto->public_id])->assertOk();
        $second = $lead();
        $this->assertSame([(int) $beto->id, 'REASSIGNMENT'], [(int) $second->assigned_user_id, $second->assignment_method]);
        $this->assertSame($first->first_assigned_at, $second->first_assigned_at, 'the first assignment date is kept');
        $this->assertGreaterThan($first->last_assigned_at, $second->last_assigned_at);

        $rows = $history();
        $this->assertCount(2, $rows);
        $this->assertSame(['MANUAL', null, (int) $ana->id, (int) $admin->id], [$rows[0]->reason_code, $rows[0]->from_user_id, (int) $rows[0]->to_user_id, (int) $rows[0]->actor_user_id]);
        $this->assertNotNull($rows[0]->ended_at, 'the previous assignment is closed');
        $this->assertSame(['REASSIGNMENT', (int) $ana->id, (int) $beto->id], [$rows[1]->reason_code, (int) $rows[1]->from_user_id, (int) $rows[1]->to_user_id]);
        $this->assertNull($rows[1]->ended_at);

        $this->assertSame(['Nuevo lead asignado', 'Lead asignado a otro asesor'], $this->titles($ana));
        $this->assertSame(['Lead reasignado'], $this->titles($beto));

        // Same owner again: nothing new. Unassigning closes the row and tells the previous owner.
        $this->patchJson('/api/v1/admin/leads/'.$public, ['agent_id' => $beto->public_id, 'notes' => 'sin cambio de asesor'])->assertOk();
        $this->assertCount(2, $history());
        $this->patchJson('/api/v1/admin/leads/'.$public, ['agent_id' => null])->assertOk();
        $this->assertSame([null, 'UNASSIGNED'], [$lead()->assigned_user_id, $lead()->assignment_method]);
        $this->assertSame('UNASSIGNED', $history()->last()->reason_code);
        $this->assertEqualsCanonicalizing(['Lead reasignado', 'Lead asignado a otro asesor'], $this->titles($beto)); // same second: order not guaranteed
    }

    public function test_creating_a_lead_with_an_advisor_records_the_initial_manual_assignment(): void
    {
        $tenant = Tenant::factory()->create();
        $admin = User::factory()->for($tenant)->create(['role_code' => RoleCode::TENANT_ADMIN->value]);
        $ana = User::factory()->for($tenant)->create(['role_code' => RoleCode::SALES_ADVISOR->value]);
        DB::table('pipeline_stages')->insert(['tenant_id' => $tenant->id, 'code' => 'NEW', 'name' => 'Nuevo', 'category' => 'OPEN', 'position' => 1]);
        $this->actingAs($admin)->withHeaders(['X-Everprop-Tenant' => $tenant->public_id, 'Origin' => 'http://localhost:5173']);

        $public = $this->postJson('/api/v1/admin/leads', ['name' => 'Lead con asesor', 'agent_id' => $ana->public_id])->assertCreated()->json('data.id');
        $lead = DB::table('leads')->where('public_id', $public)->first();
        $this->assertSame('MANUAL', $lead->assignment_method);
        $this->assertNotNull($lead->first_assigned_at);
        $row = DB::table('lead_assignments')->where('lead_id', $lead->id)->sole();
        $this->assertSame(['MANUAL', (int) $ana->id, (int) $admin->id], [$row->reason_code, (int) $row->to_user_id, (int) $row->actor_user_id]);
        $this->assertSame(['Nuevo lead asignado'], $this->titles($ana));
    }
}
