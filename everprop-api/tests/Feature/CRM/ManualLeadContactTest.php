<?php

namespace Tests\Feature\CRM;

use App\Domain\Identity\Enums\RoleCode;
use App\Domain\Tenancy\Models\Tenant;
use App\Models\User;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/**
 * EVP-135: the manual form created a second contact and lead on every submit and stored the phone as typed.
 * Committed rows (the web form runs sp_create_or_get_open_lead, which refuses an open transaction), cleaned up after.
 */
final class ManualLeadContactTest extends TestCase
{
    private Tenant $tenant;

    private User $admin;

    protected function setUp(): void
    {
        parent::setUp();
        $this->tenant = Tenant::factory()->create();
        $this->admin = User::factory()->for($this->tenant)->create(['role_code' => RoleCode::TENANT_ADMIN->value]);
        DB::table('pipeline_stages')->insert(['tenant_id' => $this->tenant->id, 'code' => 'NEW', 'name' => 'Nuevo', 'category' => 'OPEN', 'position' => 1, 'is_active' => true]);
        $this->withHeaders(['X-Everprop-Tenant' => $this->tenant->public_id, 'Origin' => 'http://localhost:5173']);
    }

    protected function tearDown(): void
    {
        $tenantId = $this->tenant->id;
        DB::table('notifications')->whereIn('notifiable_id', DB::table('users')->where('tenant_id', $tenantId)->pluck('id'))->delete();
        foreach (['contact_consents', 'lead_touchpoints', 'domain_outbox', 'lead_assignments', 'lead_properties', 'leads', 'contact_identities', 'contacts', 'pipeline_stages', 'users'] as $table) {
            DB::table($table)->where('tenant_id', $tenantId)->delete();
        }
        DB::table('tenants')->where('id', $tenantId)->delete();
        parent::tearDown();
    }

    public function test_the_same_submit_twice_gives_one_contact_and_one_lead_and_the_second_reports_it(): void
    {
        $body = ['name' => 'Laura Gómez', 'phone' => '11 5555-0000', 'email' => 'Laura@Example.test'];
        $first = $this->actingAs($this->admin)->postJson('/api/v1/admin/leads', $body)->assertCreated()
            ->assertJsonPath('data.phone', '+5491155550000')->assertJsonPath('data.source_channel', 'MANUAL')->json('data.id');
        $this->actingAs($this->admin)->postJson('/api/v1/admin/leads', $body)->assertOk()
            ->assertJsonPath('duplicate', true)->assertJsonPath('data.id', $first)->assertJsonPath('message', 'Este contacto ya tiene un lead abierto.');

        $this->assertSame(1, DB::table('leads')->where('tenant_id', $this->tenant->id)->count());
        $contact = DB::table('contacts')->where('tenant_id', $this->tenant->id)->sole();
        $this->assertSame(['+5491155550000', 'laura@example.test'], [$contact->phone_e164, $contact->email]);
        $this->assertSame('+5491155550000', DB::table('contact_identities')->where('contact_id', $contact->id)->where('channel_type', 'PHONE')->value('provider_user_id'));

    }

    public function test_a_manual_lead_and_a_web_form_from_the_same_person_share_the_contact(): void
    {
        $this->actingAs($this->admin)->postJson('/api/v1/admin/leads', ['name' => 'Laura Gómez', 'phone' => '11 5555-0000'])->assertCreated();
        app('auth')->forgetGuards();

        $this->withHeaders(['Idempotency-Key' => 'evp135-web-form-0001'])->postJson('/api/v1/public/leads', [
            'contact' => ['display_name' => 'Laura', 'phone_e164' => '+5491155550000'],
            'identity' => ['channel_type' => 'PHONE', 'provider_user_id' => '+5491155550000'],
            'consent' => ['purpose_code' => 'COMMERCIAL_CONTACT', 'status' => 'GRANTED', 'legal_text_version' => 'test-v1'],
            'lead' => ['source_channel' => 'WEB_FORM', 'source_kind' => 'CONTACT_FORM', 'priority' => 'NORMAL'],
            'touchpoint' => ['type' => 'WEB_FORM', 'summary' => 'EVP-135'],
        ])->assertSuccessful();

        $this->assertSame(1, DB::table('contacts')->where('tenant_id', $this->tenant->id)->count());
        $this->assertSame(1, DB::table('leads')->where('tenant_id', $this->tenant->id)->count(), 'the web form reuses the open lead');
    }

    public function test_a_retried_submit_is_replayed_by_its_idempotency_key(): void
    {
        $headers = ['Idempotency-Key' => 'evp135-manual-'.$this->tenant->id];
        $first = $this->actingAs($this->admin)->withHeaders($headers)->postJson('/api/v1/admin/leads', ['phone' => '0351 422-1234'])->assertCreated()->json('data.id');
        $this->actingAs($this->admin)->withHeaders($headers)->postJson('/api/v1/admin/leads', ['phone' => '0351 422-1234'])->assertOk()->assertJsonPath('data.id', $first);
        $this->assertSame(1, DB::table('leads')->where('tenant_id', $this->tenant->id)->count());
        $this->actingAs($this->admin)->withHeaders(['Idempotency-Key' => 'x'])->postJson('/api/v1/admin/leads', ['phone' => '11 5555-0001'])->assertUnprocessable();
    }

    public function test_a_lead_needs_only_its_phone_and_is_labelled_with_it_until_named(): void
    {
        $id = $this->actingAs($this->admin)->postJson('/api/v1/admin/leads', ['phone' => '0388 15 412-3456'])->assertCreated()
            ->assertJsonPath('data.name', '+54 9 388 412-3456')->assertJsonPath('data.phone', '+5493884123456')->json('data.id');
        $lead = DB::table('leads')->where('tenant_id', $this->tenant->id)->sole();
        $contact = DB::table('contacts')->where('tenant_id', $this->tenant->id)->sole();
        $this->assertSame(['+54 9 388 412-3456', '+54 9 388 412-3456', '+5493884123456'], [$lead->title, $contact->display_name, $contact->phone_e164]);
        $this->assertNull($contact->first_name);
        $this->assertSame('+5493884123456', DB::table('contact_identities')->where('contact_id', $contact->id)->where('channel_type', 'PHONE')->value('provider_user_id'));
        $this->assertStringContainsString('+54 9 388 412-3456', (string) DB::table('notifications')->where('notifiable_id', $this->admin->id)->value('data'));

        // The same number typed another way is the same lead.
        $this->actingAs($this->admin)->postJson('/api/v1/admin/leads', ['phone' => '+54 9 388 412 3456'])->assertOk()
            ->assertJsonPath('duplicate', true)->assertJsonPath('data.id', $id);

        // EVP-134: the name is completed later, with the loaded version.
        $this->actingAs($this->admin)->putJson("/api/v1/admin/leads/{$id}", ['name' => 'Laura Gómez', 'version' => (int) $lead->version + 5])
            ->assertStatus(409)->assertJsonPath('error.code', 'LEAD_VERSION_CONFLICT');
        $this->actingAs($this->admin)->putJson("/api/v1/admin/leads/{$id}", ['name' => 'Laura Gómez', 'version' => (int) $lead->version])->assertOk();
        $this->assertSame('Laura Gómez', DB::table('contacts')->where('id', $contact->id)->value('display_name'));
        $this->assertSame('Interés: Laura Gómez', DB::table('leads')->where('id', $lead->id)->value('title'));
    }

    public function test_the_phone_is_required_and_needs_its_area_code(): void
    {
        $this->actingAs($this->admin)->postJson('/api/v1/admin/leads', ['name' => 'Laura', 'email' => 'laura@example.test'])
            ->assertUnprocessable()->assertJsonValidationErrors('phone');
        $this->actingAs($this->admin)->postJson('/api/v1/admin/leads', ['phone' => '422-1234'])
            ->assertUnprocessable()->assertJsonValidationErrors('phone');
        $this->assertSame(0, DB::table('leads')->where('tenant_id', $this->tenant->id)->count());
    }

    public function test_the_same_phone_and_idempotency_key_in_another_tenant_make_its_own_contact_and_lead(): void
    {
        $headers = ['Idempotency-Key' => 'evp176-cross-tenant-key'];
        $a = $this->actingAs($this->admin)->withHeaders($headers)->postJson('/api/v1/admin/leads', ['phone' => '11 5555-0000'])->assertCreated()->json('data.id');
        $other = Tenant::factory()->create();
        $otherAdmin = User::factory()->for($other)->create(['role_code' => RoleCode::TENANT_ADMIN->value]);
        DB::table('pipeline_stages')->insert(['tenant_id' => $other->id, 'code' => 'NEW', 'name' => 'Nuevo', 'category' => 'OPEN', 'position' => 1, 'is_active' => true]);
        try {
            $this->refreshApplication(); // a fresh request cycle: the router keeps the controller (and its tenant) per app
            $b = $this->actingAs($otherAdmin)->withHeaders($headers + ['X-Everprop-Tenant' => $other->public_id])
                ->postJson('/api/v1/admin/leads', ['phone' => '11 5555-0000'])->assertCreated()->assertJsonMissingPath('duplicate')->json('data.id');
            $this->assertNotSame($a, $b);
            $contactA = DB::table('contacts')->where('tenant_id', $this->tenant->id)->value('id');
            $contactB = DB::table('contacts')->where('tenant_id', $other->id)->value('id');
            $this->assertNotSame($contactA, $contactB);
            $this->assertSame($contactB, DB::table('leads')->where('public_id', $b)->value('contact_id'));
            $this->assertSame(1, DB::table('contact_identities')->where('tenant_id', $this->tenant->id)->where('channel_type', 'PHONE')->where('provider_user_id', '+5491155550000')->count());
            $this->assertSame(1, DB::table('contact_identities')->where('tenant_id', $other->id)->where('channel_type', 'PHONE')->where('provider_user_id', '+5491155550000')->count());
        } finally {
            DB::table('notifications')->whereIn('notifiable_id', DB::table('users')->where('tenant_id', $other->id)->pluck('id'))->delete();
            foreach (['domain_outbox', 'lead_assignments', 'leads', 'contact_identities', 'contacts', 'pipeline_stages', 'users'] as $table) {
                DB::table($table)->where('tenant_id', $other->id)->delete();
            }
            DB::table('tenants')->where('id', $other->id)->delete();
        }
    }

    public function test_another_tenant_cannot_complete_the_name(): void
    {
        $id = $this->actingAs($this->admin)->postJson('/api/v1/admin/leads', ['phone' => '11 5555-0000'])->assertCreated()->json('data.id');
        $other = Tenant::factory()->create();
        $intruder = User::factory()->for($other)->create(['role_code' => RoleCode::TENANT_ADMIN->value]);
        try {
            app('auth')->forgetGuards();
            $this->actingAs($intruder)->withHeaders(['X-Everprop-Tenant' => $other->public_id])
                ->putJson("/api/v1/admin/leads/{$id}", ['name' => 'Intruso'])->assertNotFound();
            $this->assertSame('+54 9 11 5555-0000', DB::table('contacts')->where('tenant_id', $this->tenant->id)->value('display_name'));
        } finally {
            DB::table('users')->where('tenant_id', $other->id)->delete();
            DB::table('tenants')->where('id', $other->id)->delete();
        }
    }

    public function test_a_local_number_and_its_plus_549_form_are_the_same_lead(): void
    {
        $id = $this->actingAs($this->admin)->postJson('/api/v1/admin/leads', ['phone' => '11 5555-0000'])->assertCreated()
            ->assertJsonPath('data.phone', '+5491155550000')->json('data.id');
        $this->actingAs($this->admin)->postJson('/api/v1/admin/leads', ['phone' => '+54 9 11 5555-0000'])->assertOk()
            ->assertJsonPath('duplicate', true)->assertJsonPath('data.id', $id);
        $this->assertSame(1, DB::table('leads')->where('tenant_id', $this->tenant->id)->count());
    }

    public function test_an_advisor_is_not_handed_the_open_lead_of_another_advisor(): void
    {
        [$ana, $beto] = User::factory()->for($this->tenant)->count(2)->create(['role_code' => RoleCode::SALES_ADVISOR->value])->all();
        $this->actingAs($ana)->postJson('/api/v1/admin/leads', ['name' => 'Laura', 'phone' => '+54 11 5555-0000'])->assertCreated();
        $this->actingAs($beto)->postJson('/api/v1/admin/leads', ['name' => 'Laura', 'phone' => '11 5555-0000'])
            ->assertStatus(409)->assertJsonPath('error.code', 'LEAD_OF_ANOTHER_ADVISOR');
        $this->assertSame(1, DB::table('leads')->where('tenant_id', $this->tenant->id)->count());
    }
}
