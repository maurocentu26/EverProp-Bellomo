<?php

namespace Tests\Feature\CRM;

use App\Domain\Identity\Enums\RoleCode;
use App\Domain\Tenancy\Models\Tenant;
use App\Models\User;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Tests\TestCase;

final class CommercialStatisticsTest extends TestCase
{
    use DatabaseTransactions;

    private function lead(Tenant $tenant, User $advisor, string $code, string $created, ?string $won = null): string
    {
        $stage = DB::table('pipeline_stages')->where('tenant_id', $tenant->id)->where('code', $code)->value('id')
            ?? DB::table('pipeline_stages')->insertGetId(['tenant_id' => $tenant->id, 'code' => $code, 'name' => $code, 'category' => $code === 'NEW' ? 'OPEN' : $code, 'position' => DB::table('pipeline_stages')->where('tenant_id', $tenant->id)->count() + 1]);
        $contact = DB::table('contacts')->insertGetId(['tenant_id' => $tenant->id, 'public_id' => (string) Str::uuid(), 'display_name' => 'Synthetic', 'first_seen_at' => $created, 'last_seen_at' => $created]);
        $id = (string) Str::uuid();
        DB::table('leads')->insert(['tenant_id' => $tenant->id, 'public_id' => $id, 'contact_id' => $contact, 'stage_id' => $stage, 'assigned_user_id' => $advisor->id, 'source_channel' => 'WEB', 'source_kind' => 'FORM', 'title' => 'Synthetic', 'is_open' => $code === 'NEW', 'first_touch_at' => $created, 'last_touch_at' => $created, 'created_at' => $created, 'won_at' => $won]);

        return $id;
    }

    public function test_cohort_period_closures_timezone_rates_and_tenant_boundaries(): void
    {
        $tenant = Tenant::factory()->create();
        $admin = User::factory()->for($tenant)->create(['role_code' => RoleCode::TENANT_ADMIN->value]);
        $advisor = User::factory()->for($tenant)->create(['role_code' => RoleCode::SALES_ADVISOR->value]);
        $other = User::factory()->create(['role_code' => RoleCode::SALES_ADVISOR->value]);
        $this->lead($tenant, $advisor, 'WON', '2026-10-01 03:00:00', '2026-10-01 04:00:00');
        $this->lead($tenant, $advisor, 'LOST', '2026-10-01 10:00:00');
        $this->lead($tenant, $advisor, 'NEW', '2026-10-02 02:59:59');
        $this->lead($tenant, $advisor, 'NEW', '2026-10-02 03:00:00');
        $this->lead($tenant, $advisor, 'WON', '2026-09-01 10:00:00', '2026-10-01 12:00:00');
        $this->lead($tenant, $advisor, 'WON', '2026-09-01 10:00:00');
        $this->lead($other->tenant, $other, 'WON', '2026-10-01 10:00:00', '2026-10-01 11:00:00');
        $this->actingAs($admin)->withHeaders(['X-Everprop-Tenant' => $tenant->public_id, 'Origin' => 'http://localhost:5173']);
        $path = '/api/v1/admin/commercial-statistics?from=2026-10-01&to=2026-10-01';
        $this->getJson($path)->assertOk()->assertJsonPath('data.total.leads', 3)->assertJsonPath('data.total.won', 1)->assertJsonPath('data.total.active', 1)->assertJsonPath('data.total.lost', 1)->assertJsonPath('data.total.period_won', 2)->assertJsonPath('data.total.conversion', 33.33)->assertJsonPath('data.total.close_rate', 50)->assertJsonPath('data.total.undated_won', 1)->assertJsonPath('data.series.0.leads', 3)->assertJsonPath('data.series.0.period_won', 2);
        $this->getJson($path.'&advisor='.$other->public_id)->assertNotFound();
        $this->getJson($path.'&tenant_id='.$other->tenant_id)->assertUnprocessable();
        $this->getJson('/api/v1/admin/commercial-statistics?from=2026-10-03&to=2026-10-01')->assertUnprocessable();
        $this->actingAs($advisor)->getJson($path)->assertForbidden();
    }

    public function test_empty_denominators_validation_and_stage_close_dates(): void
    {
        $tenant = Tenant::factory()->create();
        $admin = User::factory()->for($tenant)->create(['role_code' => RoleCode::TENANT_ADMIN->value]);
        $lead = $this->lead($tenant, $admin, 'NEW', '2026-10-01 10:00:00');
        $this->lead($tenant, $admin, 'WON', '2026-09-01 10:00:00');
        $this->lead($tenant, $admin, 'LOST', '2026-09-01 10:00:00');
        $this->actingAs($admin)->withHeaders(['X-Everprop-Tenant' => $tenant->public_id, 'Origin' => 'http://localhost:5173']);
        $this->getJson('/api/v1/admin/commercial-statistics?from=2020-01-01&to=2020-01-01')->assertOk()
            ->assertJsonPath('data.total.conversion', null)->assertJsonPath('data.total.close_rate', null);
        $this->getJson('/api/v1/admin/commercial-statistics?from=2020-01-01&to=2026-01-01')->assertUnprocessable();
        $this->getJson('/api/v1/admin/commercial-statistics?from=not-a-date&to=2026-01-01')->assertUnprocessable();
        $this->patchJson('/api/v1/admin/leads/'.$lead, ['stage' => 'WON'])->assertOk();
        $row = DB::table('leads')->where('tenant_id', $tenant->id)->where('public_id', $lead)->first();
        $this->assertNotNull($row->won_at);
        $this->assertNull($row->lost_at);
        $created = $this->postJson('/api/v1/admin/leads', ['phone' => '11 5555-0101', 'name' => 'Synthetic closed', 'stage' => 'WON'])->assertCreated();
        $this->assertNotNull(DB::table('leads')->where('tenant_id', $tenant->id)->where('title', 'Interés: Synthetic closed')->value('won_at'));
        $this->travel(1)->hours();
        $this->patchJson('/api/v1/admin/leads/'.$lead, ['stage' => 'WON', 'notes' => 'Same stage'])->assertOk();
        $this->assertSame($row->won_at, DB::table('leads')->where('tenant_id', $tenant->id)->where('public_id', $lead)->value('won_at'));
        $this->patchJson('/api/v1/admin/leads/'.$lead, ['stage' => 'LOST'])->assertOk();
        $row = DB::table('leads')->where('tenant_id', $tenant->id)->where('public_id', $lead)->first();
        $this->assertNull($row->won_at);
        $this->assertNotNull($row->lost_at);
        $this->patchJson('/api/v1/admin/leads/'.$lead, ['stage' => 'NEW'])->assertOk();
        $row = DB::table('leads')->where('tenant_id', $tenant->id)->where('public_id', $lead)->first();
        $this->assertNull($row->won_at);
        $this->assertNull($row->lost_at);
        $this->assertSame(1, $row->is_open);
    }

    public function test_low_privilege_roles_are_denied_and_archived_advisors_keep_their_attribution(): void
    {
        $tenant = Tenant::factory()->create();
        $manager = User::factory()->for($tenant)->create(['role_code' => RoleCode::SALES_MANAGER->value]);
        $advisor = User::factory()->for($tenant)->create(['role_code' => RoleCode::SALES_ADVISOR->value, 'deleted_at' => now(), 'display_name' => 'Archived advisor']);
        $this->lead($tenant, $advisor, 'NEW', '2026-10-01 10:00:00');
        $path = '/api/v1/admin/commercial-statistics?from=2026-10-01&to=2026-10-01';
        $this->actingAs($manager)->withHeaders(['X-Everprop-Tenant' => $tenant->public_id, 'Origin' => 'http://localhost:5173']);
        $this->getJson($path.'&advisor='.$advisor->public_id)->assertOk()->assertJsonPath('data.advisors.0.name', 'Archived advisor (dado de baja)')->assertJsonPath('data.total.leads', 1);
        foreach ([RoleCode::ROTATOR, RoleCode::READ_ONLY, RoleCode::SALES_ADVISOR] as $role) {
            $user = User::factory()->for($tenant)->create(['role_code' => $role->value]);
            $this->actingAs($user)->getJson($path)->assertForbidden();
        }
    }
}
