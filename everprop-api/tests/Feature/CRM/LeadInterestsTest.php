<?php

namespace Tests\Feature\CRM;

use App\Domain\Identity\Enums\RoleCode;
use App\Domain\Tenancy\Models\Tenant;
use App\Models\User;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Tests\TestCase;

/** EVP-178: 1..N interest sheets per lead, unit link kept in lead_properties, tenant and role isolation. */
final class LeadInterestsTest extends TestCase
{
    use DatabaseTransactions;

    public function test_lead_holds_rent_without_unit_and_sale_with_payment_plan_and_participants(): void
    {
        [$tenant, $advisor, $leadUuid, $leadId] = $this->fixture();
        $project = $this->project($tenant->id);
        $unit = $this->property($tenant->id, $project);
        $projectUuid = (string) DB::table('projects')->where('id', $project)->value('public_id');
        $path = "/api/v1/admin/leads/$leadUuid/interests";

        $this->as($advisor, $tenant)->postJson($path, [
            'operation' => 'RENT', 'project_id' => $projectUuid, 'prototype_label' => '2 dormitorios', 'how_heard' => 'Instagram',
            'first_contact_at' => '2026-11-20T13:00:00Z', 'first_contact_channel' => 'WHATSAPP',
        ])->assertCreated()->assertJsonPath('data.property_id', null)->assertJsonPath('data.project_id', $projectUuid)
            ->assertJsonPath('data.first_contact_at', '2026-11-20T13:00:00.000000Z');

        $sale = $this->as($advisor, $tenant)->postJson($path, [
            'operation' => 'SALE', 'project_id' => $projectUuid, 'property_id' => $unit, 'payment_method' => 'Cuotas en pesos',
            'installments_count' => 36, 'interest_level' => 'HOT', 'quoted_price' => 95000, 'quoted_currency_code' => 'USD',
            'participants' => [
                ['role' => 'COTITULAR', 'name' => 'Ana Pérez', 'document' => '30111222', 'relationship' => 'Cónyuge', 'income' => 850000],
                ['role' => 'GUARANTOR', 'name' => 'Luis Pérez', 'phone' => '+5493875550000'],
            ],
        ])->assertCreated()->assertJsonPath('data.installments_count', 36)->assertJsonPath('data.participants.0.role', 'COTITULAR')
            ->assertJsonPath('data.participants.1.income', null);

        $this->assertSame(2, DB::table('lead_interests')->where('tenant_id', $tenant->id)->where('lead_id', $leadId)->count());
        $link = DB::table('lead_properties')->where('tenant_id', $tenant->id)->where('lead_id', $leadId)->first();
        $this->assertNotNull($link);
        $this->assertSame('HOT', $link->interest_level);

        $show = $this->as($advisor, $tenant)->getJson("/api/v1/admin/leads/$leadUuid")->assertOk();
        $this->assertCount(2, $show->json('data.interests'));
        $this->assertSame([$unit], $show->json('data.property_ids'));
        $this->as($advisor, $tenant)->getJson('/api/v1/admin/lead-interest-suggestions')->assertOk()
            ->assertJsonPath('data.prototype_label.0', '2 dormitorios')->assertJsonPath('data.payment_method.0', 'Cuotas en pesos');

        // Moving the sale off the unit keeps the link row as history (DISCARDED) instead of deleting it.
        $saleId = (string) $sale->json('data.id');
        $this->as($advisor, $tenant)->patchJson("$path/$saleId", ['property_id' => null, 'status' => 'NEGOTIATING'])->assertOk()
            ->assertJsonPath('data.property_id', null)->assertJsonPath('data.status', 'NEGOTIATING');
        $this->assertSame('DISCARDED', DB::table('lead_properties')->where('tenant_id', $tenant->id)->where('lead_id', $leadId)->value('status'));
        $this->as($advisor, $tenant)->patchJson("$path/$saleId", ['property_id' => $unit])->assertOk();
        $this->assertSame('NEGOTIATING', DB::table('lead_properties')->where('tenant_id', $tenant->id)->where('lead_id', $leadId)->value('status'));

        $this->as($advisor, $tenant)->deleteJson("$path/$saleId")->assertOk();
        $this->as($advisor, $tenant)->patchJson("$path/$saleId", ['notes' => 'x'])->assertNotFound();
        $this->assertSame('DISCARDED', DB::table('lead_properties')->where('tenant_id', $tenant->id)->where('lead_id', $leadId)->value('status'));
        $this->assertCount(1, $this->as($advisor, $tenant)->getJson("/api/v1/admin/leads/$leadUuid")->json('data.interests'));
    }

    public function test_validation_rejects_bad_participants_and_mismatched_unit(): void
    {
        [$tenant, $advisor, $leadUuid] = $this->fixture();
        $path = "/api/v1/admin/leads/$leadUuid/interests";
        $unit = $this->property($tenant->id, $this->project($tenant->id));
        $otherProject = (string) DB::table('projects')->where('id', $this->project($tenant->id))->value('public_id');

        $this->as($advisor, $tenant)->postJson($path, [])->assertUnprocessable()->assertJsonValidationErrors('operation');
        $this->as($advisor, $tenant)->postJson($path, ['operation' => 'SALE', 'participants' => [
            ['role' => 'FRIEND', 'name' => 'X', 'income' => -1, 'tenant_id' => 9],
        ]])->assertUnprocessable()->assertJsonValidationErrors(['participants.0', 'participants.0.role', 'participants.0.income']);
        $this->as($advisor, $tenant)->postJson($path, ['operation' => 'SALE', 'participants' => array_fill(0, 21, ['role' => 'FAMILY', 'name' => 'X'])])
            ->assertUnprocessable()->assertJsonValidationErrors('participants');
        $this->as($advisor, $tenant)->postJson($path, ['operation' => 'SALE', 'quoted_price' => 10])
            ->assertUnprocessable()->assertJsonValidationErrors('quoted_currency_code');
        $this->as($advisor, $tenant)->postJson($path, ['project_id' => $otherProject, 'property_id' => $unit])
            ->assertUnprocessable()->assertJsonValidationErrors('property_id');
        $this->assertSame(0, DB::table('lead_interests')->where('tenant_id', $tenant->id)->count());
    }

    public function test_other_tenant_resources_are_not_found_and_roles_are_enforced(): void
    {
        [$tenant, $advisor, $leadUuid, $leadId] = $this->fixture();
        [$other, , $otherLead] = $this->fixture();
        $foreignProject = (string) DB::table('projects')->where('id', $this->project($other->id))->value('public_id');
        $foreignUnit = $this->property($other->id, null);
        $path = "/api/v1/admin/leads/$leadUuid/interests";

        $this->as($advisor, $tenant)->postJson($path, ['operation' => 'SALE', 'project_id' => $foreignProject])->assertNotFound();
        $this->as($advisor, $tenant)->postJson($path, ['property_id' => $foreignUnit])->assertNotFound();
        $this->as($advisor, $tenant)->postJson("/api/v1/admin/leads/$otherLead/interests", ['operation' => 'SALE'])->assertNotFound();

        $foreignInterest = (string) Str::uuid();
        DB::table('lead_interests')->insert([
            'public_id' => $foreignInterest, 'tenant_id' => $other->id, 'operation' => 'SALE', 'how_heard' => 'Secreto',
            'lead_id' => DB::table('leads')->where('public_id', $otherLead)->value('id'),
        ]);
        $this->as($advisor, $tenant)->patchJson("$path/$foreignInterest", ['notes' => 'x'])->assertNotFound();
        $this->as($advisor, $tenant)->deleteJson("$path/$foreignInterest")->assertNotFound();
        $this->as($advisor, $tenant)->getJson('/api/v1/admin/lead-interest-suggestions')->assertOk()->assertJsonPath('data.how_heard', []);

        $mine = $this->as($advisor, $tenant)->postJson($path, ['operation' => 'RENT'])->assertCreated()->json('data.id');
        $colleague = User::factory()->for($tenant)->create(['role_code' => RoleCode::SALES_ADVISOR->value]);
        $readOnly = User::factory()->for($tenant)->create(['role_code' => RoleCode::READ_ONLY->value]);
        foreach ([$colleague, $readOnly] as $user) {
            $this->as($user, $tenant)->postJson($path, ['operation' => 'SALE'])->assertForbidden();
            $this->as($user, $tenant)->patchJson("$path/$mine", ['notes' => 'x'])->assertForbidden();
            $this->as($user, $tenant)->deleteJson("$path/$mine")->assertForbidden();
        }
        $this->assertSame(1, DB::table('lead_interests')->where('tenant_id', $tenant->id)->where('lead_id', $leadId)->whereNull('deleted_at')->count());
    }

    public function test_interest_of_another_lead_unit_of_another_tenant_and_out_of_scope_unit_are_not_found(): void
    {
        [$tenant, $advisor, $leadUuid] = $this->fixture('SCOPED');
        $contact = DB::table('contacts')->insertGetId([
            'tenant_id' => $tenant->id, 'public_id' => (string) Str::uuid(), 'display_name' => 'Second', 'first_seen_at' => now(), 'last_seen_at' => now(),
        ]);
        $otherLeadId = (int) DB::table('leads')->insertGetId([
            'tenant_id' => $tenant->id, 'public_id' => (string) Str::uuid(), 'contact_id' => $contact,
            'stage_id' => DB::table('pipeline_stages')->where('tenant_id', $tenant->id)->value('id'), 'assigned_user_id' => $advisor->id,
            'source_channel' => 'WEB_FORM', 'source_kind' => 'CONTACT_FORM', 'title' => 'Second lead', 'first_touch_at' => now(), 'last_touch_at' => now(),
        ]);
        $sibling = (string) Str::uuid();
        DB::table('lead_interests')->insert(['public_id' => $sibling, 'tenant_id' => $tenant->id, 'lead_id' => $otherLeadId, 'operation' => 'SALE', 'notes' => 'orig']);
        $path = "/api/v1/admin/leads/$leadUuid/interests";

        $this->as($advisor, $tenant)->patchJson("$path/$sibling", ['notes' => 'x'])->assertNotFound();
        $this->as($advisor, $tenant)->deleteJson("$path/$sibling")->assertNotFound();
        $row = DB::table('lead_interests')->where('public_id', $sibling)->first();
        $this->assertNotNull($row);
        $this->assertSame('orig', $row->notes);
        $this->assertNull($row->deleted_at);

        // Same unit code in another tenant is a different entity: 404, never a match by unit_number.
        $foreign12A = $this->property(Tenant::factory()->create()->id, null, '12A');
        $this->as($advisor, $tenant)->postJson($path, ['property_id' => $foreign12A])->assertNotFound();
        // SCOPED advisor without a scope row on this unit.
        $outOfScope = $this->property($tenant->id, $this->project($tenant->id), '12A');
        $this->as($advisor, $tenant)->postJson($path, ['property_id' => $outOfScope])->assertNotFound();
        $this->as($advisor, $tenant)->postJson($path, ['operation' => 'SALE', 'tenant_id' => 999])
            ->assertUnprocessable()->assertJsonValidationErrors('tenant_id');
        $this->assertSame(1, DB::table('lead_interests')->where('tenant_id', $tenant->id)->count());
    }

    public function test_read_only_does_not_see_sensitive_participant_data(): void
    {
        [$tenant, $advisor, $leadUuid] = $this->fixture();
        $this->as($advisor, $tenant)->postJson("/api/v1/admin/leads/$leadUuid/interests", ['operation' => 'SALE', 'participants' => [
            ['role' => 'GUARANTOR', 'name' => 'Garante', 'document' => '20111222333', 'phone' => '+5493875550000', 'relationship' => 'Padre', 'income' => 1000],
        ]])->assertCreated()->assertJsonPath('data.participants.0.document', '20111222333');
        $readOnly = User::factory()->for($tenant)->create(['role_code' => RoleCode::READ_ONLY->value]);

        $this->as($readOnly, $tenant)->getJson("/api/v1/admin/leads/$leadUuid")->assertOk()
            ->assertJsonPath('data.interests.0.participants.0.name', 'Garante')
            ->assertJsonPath('data.interests.0.participants.0.relationship', 'Padre')
            ->assertJsonPath('data.interests.0.participants.0.document', null)
            ->assertJsonPath('data.interests.0.participants.0.phone', null)
            ->assertJsonPath('data.interests.0.participants.0.income', null);
    }

    public function test_hand_made_unit_link_is_not_discarded_when_its_interest_goes_away(): void
    {
        [$tenant, $advisor, $leadUuid, $leadId] = $this->fixture();
        $unit = $this->property($tenant->id, null);
        $this->as($advisor, $tenant)->postJson("/api/v1/admin/leads/$leadUuid/properties", ['property_id' => $unit, 'status' => 'NEGOTIATING'])->assertOk();
        $interest = $this->as($advisor, $tenant)->postJson("/api/v1/admin/leads/$leadUuid/interests", ['property_id' => $unit, 'status' => 'CONVERTED'])
            ->assertCreated()->json('data.id');
        $this->assertSame('CONVERTED', DB::table('lead_properties')->where('tenant_id', $tenant->id)->where('lead_id', $leadId)->value('status'));

        $this->as($advisor, $tenant)->deleteJson("/api/v1/admin/leads/$leadUuid/interests/$interest")->assertOk();
        // The link predates the interest (attachProperty), so it keeps its last status instead of DISCARDED.
        $this->assertSame('CONVERTED', DB::table('lead_properties')->where('tenant_id', $tenant->id)->where('lead_id', $leadId)->value('status'));
    }

    /** @return array{Tenant, User, string, int} */
    private function fixture(string $visibility = 'ALL'): array
    {
        $tenant = Tenant::factory()->create();
        $advisor = User::factory()->for($tenant)->create(['role_code' => RoleCode::SALES_ADVISOR->value]);
        DB::table('user_inventory_settings')->insert([
            'tenant_id' => $tenant->id, 'user_id' => $advisor->id, 'workspace_mode' => 'BOTH', 'visibility_mode' => $visibility,
            'can_manage_inventory' => false, 'can_manage_prices' => false, 'can_view_prices' => true,
        ]);
        $contact = DB::table('contacts')->insertGetId([
            'tenant_id' => $tenant->id, 'public_id' => (string) Str::uuid(), 'display_name' => 'Interest contact',
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
            'title' => 'Interest lead', 'first_touch_at' => now(), 'last_touch_at' => now(),
        ]);

        return [$tenant, $advisor, $leadUuid, $leadId];
    }

    private function project(int $tenantId): int
    {
        return (int) DB::table('projects')->insertGetId([
            'tenant_id' => $tenantId, 'public_id' => (string) Str::uuid(), 'name' => 'Interest project '.Str::random(6),
            'project_type' => 'BUILDING', 'status' => 'PLANNING', 'progress' => 0, 'total_units' => 0, 'city' => 'Salta', 'province' => 'Salta',
        ]);
    }

    private function property(int $tenantId, ?int $projectId, ?string $unitNumber = null): string
    {
        $uuid = (string) Str::uuid();
        DB::table('properties')->insert([
            'tenant_id' => $tenantId, 'public_id' => $uuid, 'project_id' => $projectId, 'title' => 'Interest unit',
            'operation' => 'SALE', 'category' => 'APARTMENT', 'status' => 'AVAILABLE', 'price' => 120000, 'currency_code' => 'USD',
            'city' => 'Salta', 'province' => 'Salta', 'unit_number' => $unitNumber,
        ]);

        return $uuid;
    }

    private function as(User $user, Tenant $tenant): self
    {
        return $this->actingAs($user)->withHeaders(['X-Everprop-Tenant' => $tenant->public_id, 'Origin' => 'http://localhost:5173']);
    }
}
