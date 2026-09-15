<?php

namespace Tests\Feature\CRM;

use App\Domain\Identity\Enums\RoleCode;
use App\Domain\Tenancy\Models\Tenant;
use App\Models\User;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Tests\TestCase;

final class TodayVisitsTest extends TestCase
{
    use DatabaseTransactions;

    public function test_interest_replacement_is_persisted_without_duplicate_old_property(): void
    {
        [$tenant, $advisor, $lead] = $this->fixture();
        $leadUuid = DB::table('leads')->where('id', $lead)->value('public_id');
        $ids = [];
        foreach (['A', 'B'] as $name) {
            $uuid = (string) Str::uuid();
            DB::table('properties')->insert(['tenant_id' => $tenant->id, 'public_id' => $uuid,
                'title' => "QA $name", 'operation' => 'SALE', 'category' => 'HOUSE',
                'status' => 'AVAILABLE', 'price' => 100000, 'currency_code' => 'USD', 'city' => 'Salta', 'province' => 'Salta']);
            $ids[] = $uuid;
        }
        $this->actingAs($advisor)->withHeaders(['X-Everprop-Tenant' => $tenant->public_id, 'Origin' => 'http://localhost:5173']);
        $path = "/api/v1/admin/leads/$leadUuid/properties";
        $this->postJson($path, ['property_id' => $ids[0], 'notes' => 'Original'])->assertOk();
        $this->postJson($path, ['property_id' => $ids[1], 'replaces_property_id' => $ids[0], 'notes' => 'Reemplazo'])->assertOk();
        $this->assertSame(1, DB::table('lead_properties')->where('lead_id', $lead)->count());
        $this->getJson("/api/v1/admin/leads/$leadUuid")->assertOk()->assertJsonPath('data.properties.0.id', $ids[1]);
        $this->postJson($path, ['property_id' => (string) Str::uuid(), 'replaces_property_id' => $ids[1]])->assertNotFound();
        $this->assertSame(1, DB::table('lead_properties')->where('lead_id', $lead)->count());
    }

    public function test_lead_origin_persists_and_creation_cannot_bypass_contact_discipline(): void
    {
        [$tenant, $advisor, $lead] = $this->fixture();
        $this->actingAs($advisor)->withHeaders(['X-Everprop-Tenant' => $tenant->public_id, 'Origin' => 'http://localhost:5173']);
        $body = ['name' => 'QA origin', 'source_channel' => 'INSTAGRAM'];
        $this->postJson('/api/v1/admin/leads', array_merge($body, ['stage' => 'NEGOTIATION']))->assertUnprocessable();
        $created = $this->postJson('/api/v1/admin/leads', $body)->assertCreated()->assertJsonPath('data.source_channel', 'INSTAGRAM');
        $id = $created->json('data.id');
        $this->getJson("/api/v1/admin/leads/$id")->assertOk()->assertJsonPath('data.source_channel', 'INSTAGRAM');
        $this->putJson("/api/v1/admin/leads/$id", ['source_channel' => 'REFERRAL'])->assertOk();
        $this->getJson("/api/v1/admin/leads/$id")->assertOk()->assertJsonPath('data.source_channel', 'REFERRAL');
        $this->assertDatabaseHas('leads', ['public_id' => $id, 'assigned_user_id' => $advisor->id, 'source_channel' => 'REFERRAL']);
    }

    public function test_interest_mutations_require_lead_ownership_and_write_role(): void
    {
        [$tenant, $advisor, $lead] = $this->fixture();
        $uuid = DB::table('leads')->where('id', $lead)->value('public_id');
        $headers = ['X-Everprop-Tenant' => $tenant->public_id, 'Origin' => 'http://localhost:5173'];
        foreach ([RoleCode::SALES_ADVISOR->value, RoleCode::READ_ONLY->value] as $role) {
            $other = User::factory()->for($tenant)->create(['role_code' => $role]);
            $this->actingAs($other)->withHeaders($headers);
            $this->postJson("/api/v1/admin/leads/$uuid/properties", ['property_id' => 'unavailable'])->assertForbidden();
            $this->patchJson("/api/v1/admin/leads/$uuid/properties/unavailable", ['notes' => 'forbidden'])->assertForbidden();
            $this->deleteJson("/api/v1/admin/leads/$uuid/properties/unavailable")->assertForbidden();
        }
        $this->actingAs($advisor)->postJson("/api/v1/admin/leads/$uuid/properties", ['property_id' => 'unavailable'])->assertNotFound();
    }

    public function test_today_is_scoped_by_tenant_advisor_status_and_argentina_day(): void
    {
        $this->travelTo(now()->setDate(2026, 9, 14)->setTime(15, 0));
        [$tenant, $advisor, $lead] = $this->fixture();
        [$otherTenant, $outsider, $otherLead] = $this->fixture();
        $teammate = User::factory()->for($tenant)->create(['role_code' => RoleCode::SALES_ADVISOR->value]);
        $this->visit($tenant, $advisor, $lead, '2026-09-14 03:00:00');
        $this->visit($tenant, $advisor, $lead, '2026-09-15 02:59:00');
        $this->visit($tenant, $advisor, $lead, '2026-09-14 02:59:00');
        $this->visit($tenant, $advisor, $lead, '2026-09-15 03:00:00');
        $this->visit($tenant, $advisor, $lead, '2026-09-14 12:00:00', 'CANCELLED');
        $this->visit($tenant, $advisor, $lead, '2026-09-14 12:00:00', 'COMPLETED');
        $this->visit($tenant, $teammate, $lead, '2026-09-14 13:00:00');
        $this->visit($otherTenant, $outsider, $otherLead, '2026-09-14 13:00:00');
        $headers = ['X-Everprop-Tenant' => $tenant->public_id, 'Origin' => 'http://localhost:5173'];
        $this->actingAs($advisor)->withHeaders($headers)->getJson('/api/v1/admin/visits/today')
            ->assertOk()->assertJsonPath('meta.total', 2)->assertJsonCount(2, 'data');
        $admin = User::factory()->for($tenant)->create(['role_code' => RoleCode::TENANT_ADMIN->value]);
        for ($i = 0; $i < 10; $i++) {
            $this->visit($tenant, $advisor, $lead, '2026-09-14 14:00:00');
        }
        $this->actingAs($admin)->withHeaders($headers)->getJson('/api/v1/admin/visits/today')
            ->assertOk()->assertJsonPath('meta.total', 13)->assertJsonCount(10, 'data');
        $inventory = User::factory()->for($tenant)->create(['role_code' => RoleCode::INVENTORY_MANAGER->value]);
        $this->actingAs($inventory)->withHeaders($headers)->getJson('/api/v1/admin/visits/today')->assertForbidden();
        $this->travelBack();
    }

    public function test_follow_up_notes_backdates_authorization_and_appointment_replacement(): void
    {
        $this->travelTo(now()->setDate(2026, 9, 14)->setTime(15, 0));
        [$tenant, $advisor, $lead] = $this->fixture();
        $uuid = DB::table('leads')->where('id', $lead)->value('public_id');
        $other = User::factory()->for($tenant)->create(['role_code' => RoleCode::SALES_ADVISOR->value]);
        $headers = ['X-Everprop-Tenant' => $tenant->public_id, 'Origin' => 'http://localhost:5173'];
        $path = "/api/v1/admin/leads/$uuid/follow-ups";
        $body = ['type' => 'call', 'occurred_at' => '2026-09-13T12:00:00Z', 'summary' => 'Test', 'result' => 'Test',
            'next_contact_at' => '2026-09-14T18:00:00Z', 'agent_id' => $other->public_id];
        $this->actingAs($other)->withHeaders($headers)->postJson($path, $body)->assertForbidden();
        $this->getJson($path)->assertForbidden();
        $this->actingAs($advisor)->withHeaders($headers)->postJson($path, $body)->assertCreated()
            ->assertJsonPath('data.agentId', $advisor->public_id);
        $this->assertSame('2026-09-13 12:00:00.000', DB::table('leads')->where('id', $lead)->value('last_touch_at'));
        $this->postJson($path, array_merge($body, ['type' => 'note', 'occurred_at' => '2026-09-14T14:00:00Z']))->assertCreated();
        $this->assertSame('2026-09-13 12:00:00.000', DB::table('leads')->where('id', $lead)->value('last_touch_at'));
        $this->assertSame(1, DB::table('visits')->where('tenant_id', $tenant->id)->count());
        $this->postJson($path, array_merge($body, ['occurred_at' => '2026-09-01T12:00:00Z']))->assertCreated();
        $this->assertSame(1, DB::table('visits')->where('tenant_id', $tenant->id)->count());
        $this->postJson($path, array_merge($body, ['occurred_at' => '2026-09-14T14:00:00Z', 'next_contact_at' => null]))->assertCreated();
        $this->assertSame(0, DB::table('visits')->where('tenant_id', $tenant->id)->where('status', 'SCHEDULED')->count());
        $this->assertSame(1, DB::table('visits')->where('tenant_id', $tenant->id)->where('status', 'CANCELLED')->count());
        $this->postJson($path, array_merge($body, ['occurred_at' => 'invalid']))->assertUnprocessable();
        $this->postJson($path, array_merge($body, ['occurred_at' => '2026-09-15T12:00:00Z']))->assertUnprocessable();
        $this->travelBack();
    }

    public function test_agenda_create_list_cancel_and_today_share_persisted_visits(): void
    {
        $this->travelTo(now()->setDate(2026, 9, 14)->setTime(15, 0));
        [$tenant, $advisor, $lead] = $this->fixture();
        [$foreignTenant, $outsider, $foreignLead] = $this->fixture();
        $headers = ['X-Everprop-Tenant' => $tenant->public_id, 'Origin' => 'http://localhost:5173'];
        $this->actingAs($advisor)->withHeaders($headers);
        $body = ['guest_name' => 'Guest test', 'scheduled_at' => '2026-09-14T18:00:00Z'];
        $created = $this->postJson('/api/v1/admin/visits', $body)->assertCreated();
        $id = $created->json('data.id');
        $this->getJson('/api/v1/admin/visits')->assertOk()->assertJsonCount(1, 'data')->assertJsonPath('data.0.id', $id);
        $this->getJson('/api/v1/admin/visits/today')->assertOk()->assertJsonPath('meta.total', 1);
        $foreignUuid = DB::table('leads')->where('id', $foreignLead)->value('public_id');
        $this->postJson('/api/v1/admin/visits', array_merge($body, ['lead_id' => $foreignUuid]))->assertForbidden();
        $teammate = User::factory()->for($tenant)->create(['role_code' => RoleCode::SALES_ADVISOR->value]);
        $this->actingAs($teammate)->patchJson("/api/v1/admin/visits/$id/cancel")->assertNotFound();
        $this->actingAs($advisor)->patchJson("/api/v1/admin/visits/$id/cancel")->assertOk();
        $this->getJson('/api/v1/admin/visits/today')->assertOk()->assertJsonPath('meta.total', 0);
        $this->getJson('/api/v1/admin/visits')->assertOk()->assertJsonPath('data.0.status', 'cancelled');
        $this->travelBack();
    }

    public function test_full_lists_continue_past_old_limits_without_other_advisors_records(): void
    {
        [$tenant, $advisor, $lead] = $this->fixture();
        $template = (array) DB::table('leads')->where('id', $lead)->first();
        unset($template['id'], $template['open_slot']);
        $rows = [];
        for ($i = 0; $i < 201; $i++) {
            $contact = DB::table('contacts')->insertGetId([
                'tenant_id' => $tenant->id, 'public_id' => (string) Str::uuid(), 'display_name' => "Pagination $i",
                'first_seen_at' => now(), 'last_seen_at' => now(),
            ]);
            $rows[] = array_merge($template, ['public_id' => (string) Str::uuid(), 'contact_id' => $contact]);
        }
        DB::table('leads')->insert($rows);
        $records = [];
        for ($i = 0; $i < 501; $i++) {
            $records[] = [
                'public_id' => (string) Str::uuid(), 'tenant_id' => $tenant->id, 'lead_id' => $lead,
                'user_id' => $advisor->id, 'type' => 'call', 'occurred_at' => now(), 'summary' => 'Test', 'result' => 'Test',
            ];
        }
        DB::table('lead_follow_ups')->insert($records);
        $headers = ['X-Everprop-Tenant' => $tenant->public_id, 'Origin' => 'http://localhost:5173'];
        $this->actingAs($advisor)->withHeaders($headers);
        $this->getJson('/api/v1/admin/leads?page=1')->assertOk()->assertJsonCount(200, 'data')->assertJsonPath('meta.next_page', 2);
        $this->getJson('/api/v1/admin/leads?page=2')->assertOk()->assertJsonCount(2, 'data')->assertJsonPath('meta.next_page', null);
        $this->getJson('/api/v1/admin/follow-ups?page=1')->assertOk()->assertJsonCount(500, 'data')->assertJsonPath('meta.next_page', 2);
        $this->getJson('/api/v1/admin/follow-ups?page=2')->assertOk()->assertJsonCount(1, 'data')->assertJsonPath('meta.next_page', null);
        $other = User::factory()->for($tenant)->create(['role_code' => RoleCode::SALES_ADVISOR->value]);
        $this->actingAs($other)->getJson('/api/v1/admin/follow-ups')->assertOk()->assertJsonCount(0, 'data');
    }

    public function test_stage_requires_actual_contact_and_advisor_cannot_reassign(): void
    {
        [$tenant, $advisor, $lead] = $this->fixture();
        $uuid = DB::table('leads')->where('id', $lead)->value('public_id');
        DB::table('pipeline_stages')->insert(['tenant_id' => $tenant->id, 'code' => 'CONTACTED', 'name' => 'Contacted', 'category' => 'OPEN', 'position' => 2]);
        $this->actingAs($advisor)->withHeaders(['X-Everprop-Tenant' => $tenant->public_id, 'Origin' => 'http://localhost:5173']);
        $path = "/api/v1/admin/leads/$uuid";
        $this->patchJson($path, ['stage' => 'CONTACTED'])->assertUnprocessable();
        $body = ['type' => 'note', 'occurred_at' => now()->subMinute()->toISOString(), 'summary' => 'Note', 'result' => 'Note'];
        $this->postJson("$path/follow-ups", $body)->assertCreated();
        $this->patchJson($path, ['stage' => 'CONTACTED'])->assertUnprocessable();
        $this->postJson("$path/follow-ups", array_merge($body, ['type' => 'call']))->assertCreated();
        $this->patchJson($path, ['stage' => 'CONTACTED'])->assertOk();
        $this->patchJson($path, ['agent_id' => $advisor->public_id])->assertForbidden();
    }

    public function test_linked_visit_cannot_be_assigned_to_an_advisor_who_cannot_view_the_lead(): void
    {
        [$tenant, $advisor, $lead] = $this->fixture();
        $admin = User::factory()->for($tenant)->create(['role_code' => RoleCode::TENANT_ADMIN->value]);
        $uuid = DB::table('leads')->where('id', $lead)->value('public_id');
        $this->actingAs($admin)->withHeaders(['X-Everprop-Tenant' => $tenant->public_id, 'Origin' => 'http://localhost:5173']);
        $body = ['lead_id' => $uuid, 'agent_id' => $admin->public_id, 'scheduled_at' => now()->addDay()->toISOString()];
        $this->postJson('/api/v1/admin/visits', $body)->assertUnprocessable();
        $this->postJson('/api/v1/admin/visits', array_merge($body, ['agent_id' => $advisor->public_id]))->assertCreated();
        $this->actingAs($advisor)->getJson('/api/v1/admin/visits')->assertOk()->assertJsonCount(1, 'data');
    }

    public function test_reassignment_moves_pending_visits_and_invalid_advisor_rolls_back_contact_changes(): void
    {
        [$tenant, $advisor, $lead] = $this->fixture();
        $admin = User::factory()->for($tenant)->create(['role_code' => RoleCode::TENANT_ADMIN->value]);
        $next = User::factory()->for($tenant)->create(['role_code' => RoleCode::SALES_ADVISOR->value]);
        $uuid = DB::table('leads')->where('id', $lead)->value('public_id');
        $this->visit($tenant, $advisor, $lead, now()->addDay()->format('Y-m-d H:i:s'));
        $this->actingAs($admin)->withHeaders(['X-Everprop-Tenant' => $tenant->public_id, 'Origin' => 'http://localhost:5173']);
        $this->patchJson("/api/v1/admin/leads/$uuid", ['agent_id' => (string) Str::uuid(), 'name' => 'Must roll back'])->assertUnprocessable();
        $this->assertDatabaseMissing('contacts', ['tenant_id' => $tenant->id, 'display_name' => 'Must roll back']);
        $this->patchJson("/api/v1/admin/leads/$uuid", ['agent_id' => $next->public_id])->assertOk();
        $this->actingAs($next)->getJson('/api/v1/admin/visits')->assertOk()->assertJsonCount(1, 'data');
        $this->actingAs($advisor)->getJson('/api/v1/admin/visits')->assertOk()->assertJsonCount(0, 'data');
    }

    /** @return array<mixed> */
    private function fixture(): array
    {
        $tenant = Tenant::factory()->create();
        $user = User::factory()->for($tenant)->create(['role_code' => RoleCode::SALES_ADVISOR->value]);
        $contact = DB::table('contacts')->insertGetId([
            'tenant_id' => $tenant->id, 'public_id' => (string) Str::uuid(), 'display_name' => 'Test visit',
            'first_seen_at' => now(), 'last_seen_at' => now(),
        ]);
        $stage = DB::table('pipeline_stages')->insertGetId([
            'tenant_id' => $tenant->id, 'code' => 'NEW', 'name' => 'New', 'category' => 'OPEN', 'position' => 1,
        ]);
        $lead = DB::table('leads')->insertGetId([
            'tenant_id' => $tenant->id, 'public_id' => (string) Str::uuid(), 'contact_id' => $contact, 'stage_id' => $stage,
            'assigned_user_id' => $user->id, 'source_channel' => 'WEB_FORM', 'source_kind' => 'CONTACT_FORM',
            'title' => 'Test visit', 'first_touch_at' => now(), 'last_touch_at' => now(),
        ]);

        return [$tenant, $user, $lead];
    }

    private function visit(Tenant $tenant, User $user, int $lead, string $date, string $status = 'SCHEDULED'): void
    {
        DB::table('visits')->insert([
            'tenant_id' => $tenant->id, 'public_id' => (string) Str::uuid(), 'lead_id' => $lead,
            'assigned_user_id' => $user->id, 'scheduled_at' => $date, 'status' => $status,
        ]);
    }
}
