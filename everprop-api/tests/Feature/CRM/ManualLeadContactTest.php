<?php

namespace Tests\Feature\CRM;

use App\Domain\CRM\Support\PhoneNumber;
use App\Domain\Identity\Enums\RoleCode;
use App\Domain\Tenancy\Models\Tenant;
use App\Models\User;
use Illuminate\Support\Facades\DB;
use PHPUnit\Framework\Attributes\DataProvider;
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

    /** @return array<string, array{string, ?string}> */
    public static function phones(): array
    {
        return [
            'Buenos Aires local' => ['11 5555-0000', '+541155550000'],
            'with trunk 0' => ['0351 422-1234', '+543514221234'],
            'international mobile' => ['+54 9 11 5555-0000', '+5491155550000'],
            'international without plus' => ['5491155550000', '+5491155550000'],
            '00 prefix' => ['0054 11 5555 0000', '+541155550000'],
            'other country' => ['+1 (415) 555-0100', '+14155550100'],
            'local mobile with 15 is ambiguous' => ['0388 15 412-3456', null],
            'no area code' => ['5555-0000', null],
            'letters' => ['llamar a la tarde', null],
        ];
    }

    #[DataProvider('phones')]
    public function test_phones_become_e164_or_are_refused(string $typed, ?string $expected): void
    {
        $this->assertSame($expected, PhoneNumber::e164($typed));
    }

    public function test_the_same_submit_twice_gives_one_contact_and_one_lead_and_the_second_reports_it(): void
    {
        $body = ['name' => 'Laura Gómez', 'phone' => '11 5555-0000', 'email' => 'Laura@Example.test'];
        $first = $this->actingAs($this->admin)->postJson('/api/v1/admin/leads', $body)->assertCreated()
            ->assertJsonPath('data.phone', '+541155550000')->assertJsonPath('data.source_channel', 'MANUAL')->json('data.id');
        $this->actingAs($this->admin)->postJson('/api/v1/admin/leads', $body)->assertOk()
            ->assertJsonPath('duplicate', true)->assertJsonPath('data.id', $first)->assertJsonPath('message', 'Este contacto ya tiene un lead abierto.');

        $this->assertSame(1, DB::table('leads')->where('tenant_id', $this->tenant->id)->count());
        $contact = DB::table('contacts')->where('tenant_id', $this->tenant->id)->sole();
        $this->assertSame(['+541155550000', 'laura@example.test'], [$contact->phone_e164, $contact->email]);
        $this->assertSame('+541155550000', DB::table('contact_identities')->where('contact_id', $contact->id)->where('channel_type', 'PHONE')->value('provider_user_id'));

        $this->actingAs($this->admin)->postJson('/api/v1/admin/leads', ['name' => 'X', 'phone' => '0388 15 412-3456'])
            ->assertUnprocessable()->assertJsonValidationErrors('phone');
    }

    public function test_a_manual_lead_and_a_web_form_from_the_same_person_share_the_contact(): void
    {
        $this->actingAs($this->admin)->postJson('/api/v1/admin/leads', ['name' => 'Laura Gómez', 'phone' => '11 5555-0000'])->assertCreated();
        app('auth')->forgetGuards();

        $this->withHeaders(['Idempotency-Key' => 'evp135-web-form-0001'])->postJson('/api/v1/public/leads', [
            'contact' => ['display_name' => 'Laura', 'phone_e164' => '+541155550000'],
            'identity' => ['channel_type' => 'PHONE', 'provider_user_id' => '+541155550000'],
            'consent' => ['purpose_code' => 'COMMERCIAL_CONTACT', 'status' => 'GRANTED', 'legal_text_version' => 'test-v1'],
            'lead' => ['source_channel' => 'WEB_FORM', 'source_kind' => 'CONTACT_FORM', 'priority' => 'NORMAL'],
            'touchpoint' => ['type' => 'WEB_FORM', 'summary' => 'EVP-135'],
        ])->assertSuccessful();

        $this->assertSame(1, DB::table('contacts')->where('tenant_id', $this->tenant->id)->count());
        $this->assertSame(1, DB::table('leads')->where('tenant_id', $this->tenant->id)->count(), 'the web form reuses the open lead');
    }

    public function test_a_retried_submit_without_phone_or_email_is_replayed_by_its_idempotency_key(): void
    {
        $headers = ['Idempotency-Key' => 'evp135-manual-'.$this->tenant->id];
        $first = $this->actingAs($this->admin)->withHeaders($headers)->postJson('/api/v1/admin/leads', ['name' => 'Solo nombre'])->assertCreated()->json('data.id');
        $this->actingAs($this->admin)->withHeaders($headers)->postJson('/api/v1/admin/leads', ['name' => 'Solo nombre'])->assertOk()->assertJsonPath('data.id', $first);
        $this->assertSame(1, DB::table('leads')->where('tenant_id', $this->tenant->id)->count());
        $this->actingAs($this->admin)->withHeaders(['Idempotency-Key' => 'x'])->postJson('/api/v1/admin/leads', ['name' => 'Otro'])->assertUnprocessable();
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
