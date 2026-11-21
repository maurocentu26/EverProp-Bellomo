<?php

namespace Tests\Feature\CRM;

use App\Domain\Identity\Enums\RoleCode;
use App\Domain\Tenancy\Models\Tenant;
use App\Models\User;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/** EVP-177: extended contact profile under contacts.profile_json.extended. */
final class LeadExtendedProfileTest extends TestCase
{
    use DatabaseTransactions;

    private function tenant(): Tenant
    {
        $tenant = Tenant::factory()->create();
        DB::table('pipeline_stages')->insert(['tenant_id' => $tenant->id, 'code' => 'NEW', 'name' => 'Nuevo', 'category' => 'OPEN', 'position' => 1]);

        return $tenant;
    }

    private function user(Tenant $tenant, RoleCode $role): User
    {
        return User::factory()->for($tenant)->create(['role_code' => $role->value]);
    }

    private function as(Tenant $tenant, User $user): self
    {
        // Several tenants in one test: drop the cached guard and controllers (they hold the previous request's TenantContext).
        $this->app['auth']->forgetGuards();
        foreach ($this->app['router']->getRoutes()->getRoutes() as $route) {
            $route->flushController();
        }

        return $this->withHeaders(['X-Everprop-Tenant' => $tenant->public_id, 'Origin' => 'http://localhost:5173'])->actingAs($user);
    }

    /** @return array<string, mixed> */
    private function fullProfile(): array
    {
        return [
            'personal' => ['documentNumber' => '30.123.456', 'taxId' => '20-30123456-7', 'taxCondition' => 'Monotributo', 'nationality' => 'Argentina',
                'maritalStatus' => 'Casado', 'birthDate' => '1985-04-12', 'childrenCount' => 2],
            'addresses' => [
                ['street' => 'Belgrano 1200', 'floorAndUnit' => '3B', 'neighborhood' => 'Centro', 'city' => 'Salta', 'province' => 'Salta'],
                ['street' => 'Ruta 9 km 5', 'floorAndUnit' => null, 'neighborhood' => 'Tres Cerritos', 'city' => 'Salta', 'province' => 'Salta'],
            ],
            'employment' => ['employer' => 'ACME', 'phone' => '+543874000000', 'email' => 'rrhh@acme.test', 'profession' => 'Contador', 'role' => 'Jefe', 'income' => 1500000.5],
            'guarantor' => ['name' => 'Ana Garante', 'documentNumber' => '25111222', 'phone' => '+543874111111', 'address' => 'Mitre 1', 'employer' => 'Estado', 'role' => 'Docente', 'income' => 900000],
            'currentHousing' => ['status' => 'TENANT', 'notes' => 'Alquila hace 3 años', 'assets' => [
                ['value' => 12000000, 'typology' => 'Auto', 'quantity' => 1],
                ['value' => 30000000, 'typology' => 'Lote', 'quantity' => 2],
            ]],
        ];
    }

    public function test_round_trip_partial_updates_version_and_foreign_keys_preserved(): void
    {
        $tenant = $this->tenant();
        $admin = $this->user($tenant, RoleCode::TENANT_ADMIN);

        // Lead without profile: show returns null.
        $plain = $this->as($tenant, $admin)->postJson('/api/v1/admin/leads', ['name' => 'Sin perfil'])->assertCreated()->json('data.id');
        $this->getJson('/api/v1/admin/leads/'.$plain)->assertOk()->assertJsonPath('data.profile', null);

        $lead = $this->postJson('/api/v1/admin/leads', ['name' => 'Con perfil', 'profile' => $this->fullProfile()])->assertCreated()->json('data.id');
        $data = $this->getJson('/api/v1/admin/leads/'.$lead)->assertOk()->json('data');
        $this->assertSame(1, $data['profile']['version']);
        foreach ($this->fullProfile() as $block => $value) {
            $this->assertEquals($value, $data['profile'][$block], $block);
        }

        // Another component already wrote profile_json keys: they must survive.
        $contactId = DB::table('leads')->where('public_id', $lead)->value('contact_id');
        $raw = json_decode((string) DB::table('contacts')->where('id', $contactId)->value('profile_json'), true);
        $raw['declared_phone'] = '+5493874000000';
        DB::table('contacts')->where('id', $contactId)->update(['profile_json' => json_encode($raw)]);

        // Partial update: one field of personal, new addresses list; the rest stays.
        $version = $data['version'];
        $this->patchJson('/api/v1/admin/leads/'.$lead, ['version' => $version, 'profile' => [
            'personal' => ['maritalStatus' => 'Divorciado'],
            'addresses' => [['street' => 'Solo una', 'city' => 'Cafayate', 'province' => 'Salta']],
        ]])->assertOk()->assertJsonPath('version', $version + 1);
        $after = $this->getJson('/api/v1/admin/leads/'.$lead)->json('data.profile');
        $this->assertSame('Divorciado', $after['personal']['maritalStatus']);
        $this->assertSame('30.123.456', $after['personal']['documentNumber']);
        $this->assertCount(1, $after['addresses']);
        $this->assertEquals($this->fullProfile()['guarantor'], $after['guarantor']);
        $this->assertCount(2, $after['currentHousing']['assets']);
        $raw = json_decode((string) DB::table('contacts')->where('id', $contactId)->value('profile_json'), true);
        $this->assertSame('+5493874000000', $raw['declared_phone']);

        // Stale version: 409 and nothing written.
        $this->patchJson('/api/v1/admin/leads/'.$lead, ['version' => $version, 'profile' => ['personal' => ['maritalStatus' => 'Soltero']]])
            ->assertStatus(409)->assertJsonPath('error.code', 'LEAD_VERSION_CONFLICT');
        $this->assertSame('Divorciado', $this->getJson('/api/v1/admin/leads/'.$lead)->json('data.profile.personal.maritalStatus'));

        // A null block is removed.
        $this->patchJson('/api/v1/admin/leads/'.$lead, ['profile' => ['guarantor' => null]])->assertOk();
        $this->assertArrayNotHasKey('guarantor', $this->getJson('/api/v1/admin/leads/'.$lead)->json('data.profile'));

        // DNI/CUIT search, digits only.
        $ids = fn (string $doc): array => array_column((array) $this->getJson('/api/v1/admin/leads?document='.urlencode($doc))->assertOk()->json('data'), 'id');
        $this->assertSame([$lead], $ids('30123456'));
        $this->assertSame([$lead], $ids('20301234567'));
        $this->assertSame([], $ids('99999999'));
    }

    public function test_invalid_payloads_are_rejected(): void
    {
        $tenant = $this->tenant();
        $admin = $this->user($tenant, RoleCode::TENANT_ADMIN);
        $lead = $this->as($tenant, $admin)->postJson('/api/v1/admin/leads', ['name' => 'Validar'])->assertCreated()->json('data.id');

        foreach ([
            'profile.personal.birthDate' => ['personal' => ['birthDate' => '2020-02-31']],
            'profile.currentHousing.status' => ['currentHousing' => ['status' => 'HOMELESS']],
            'profile.employment.income' => ['employment' => ['income' => -1]],
            'profile.guarantor.income' => ['guarantor' => ['income' => -10]],
            'profile.currentHousing.assets.0.value' => ['currentHousing' => ['assets' => [['value' => -5]]]],
            'profile.personal' => ['personal' => ['unknownKey' => 'x']],
            'profile' => ['tenant_id' => 1],
        ] as $field => $profile) {
            $this->patchJson('/api/v1/admin/leads/'.$lead, ['profile' => $profile])->assertUnprocessable()->assertJsonValidationErrors($field);
            $this->postJson('/api/v1/admin/leads', ['name' => 'X', 'profile' => $profile])->assertUnprocessable()->assertJsonValidationErrors($field);
        }
        $this->assertNull(DB::table('contacts')->where('id', DB::table('leads')->where('public_id', $lead)->value('contact_id'))->value('profile_json'));
    }

    public function test_tenant_isolation_and_rbac(): void
    {
        $a = $this->tenant();
        $b = $this->tenant();
        $adminA = $this->user($a, RoleCode::TENANT_ADMIN);
        $adminB = $this->user($b, RoleCode::TENANT_ADMIN);
        $advisor = $this->user($a, RoleCode::SALES_ADVISOR);
        $other = $this->user($a, RoleCode::SALES_ADVISOR);
        $readOnly = $this->user($a, RoleCode::READ_ONLY);
        $rotator = $this->user($a, RoleCode::ROTATOR);

        $this->as($b, $adminB)->postJson('/api/v1/admin/leads', ['name' => 'B', 'profile' => [
            'personal' => ['documentNumber' => '11111111', 'taxCondition' => 'SecretoB'],
            'addresses' => [['neighborhood' => 'BarrioB', 'city' => 'CiudadB', 'province' => 'ProvinciaB']],
        ]])->assertCreated();
        $leadA = $this->as($a, $adminA)->postJson('/api/v1/admin/leads', ['name' => 'A', 'agent_id' => $advisor->public_id, 'profile' => [
            'personal' => ['taxCondition' => 'Responsable Inscripto'],
            'addresses' => [['neighborhood' => 'Centro', 'city' => 'Salta', 'province' => 'Salta']],
        ]])->assertCreated()->json('data.id');

        $this->as($a, $adminA)->getJson('/api/v1/admin/leads/profile-suggestions')->assertOk()->assertExactJson(['data' => [
            'neighborhoods' => ['Centro'], 'cities' => ['Salta'], 'provinces' => ['Salta'], 'taxConditions' => ['Responsable Inscripto'],
        ]]);
        // Tenant A cannot find tenant B's DNI nor touch its leads.
        $this->assertSame([], $this->as($a, $adminA)->getJson('/api/v1/admin/leads?document=11111111')->json('data'));
        $this->as($b, $adminB)->patchJson('/api/v1/admin/leads/'.$leadA, ['profile' => ['personal' => ['nationality' => 'X']]])->assertNotFound();
        $this->as($b, $adminB)->getJson('/api/v1/admin/leads/'.$leadA)->assertNotFound();

        // RBAC: the assigned advisor edits; another advisor and READ_ONLY cannot; ROTATOR may (EVP-21 policy).
        $this->as($a, $advisor)->patchJson('/api/v1/admin/leads/'.$leadA, ['profile' => ['personal' => ['nationality' => 'Argentina']]])->assertOk();
        $this->as($a, $other)->patchJson('/api/v1/admin/leads/'.$leadA, ['profile' => ['personal' => ['nationality' => 'Otra']]])->assertForbidden();
        $this->as($a, $other)->getJson('/api/v1/admin/leads/'.$leadA)->assertNotFound();
        $this->as($a, $readOnly)->patchJson('/api/v1/admin/leads/'.$leadA, ['profile' => ['personal' => ['nationality' => 'Otra']]])->assertForbidden();
        $this->as($a, $rotator)->patchJson('/api/v1/admin/leads/'.$leadA, ['profile' => ['personal' => ['nationality' => 'Chilena']]])->assertOk();
        $this->as($a, $readOnly)->getJson('/api/v1/admin/leads/profile-suggestions')->assertOk();
    }

    public function test_read_only_does_not_see_sensitive_fields_nor_search_by_document(): void
    {
        $tenant = $this->tenant();
        $admin = $this->user($tenant, RoleCode::TENANT_ADMIN);
        $readOnly = $this->user($tenant, RoleCode::READ_ONLY);
        $lead = $this->as($tenant, $admin)->postJson('/api/v1/admin/leads', ['name' => 'Sensible', 'profile' => $this->fullProfile()])->assertCreated()->json('data.id');

        $this->assertSame('30.123.456', $this->getJson('/api/v1/admin/leads/'.$lead)->json('data.profile.personal.documentNumber'));
        $profile = $this->as($tenant, $readOnly)->getJson('/api/v1/admin/leads/'.$lead)->assertOk()->json('data.profile');
        $this->assertSame('Casado', $profile['personal']['maritalStatus']);
        $this->assertArrayNotHasKey('documentNumber', $profile['personal']);
        $this->assertArrayNotHasKey('taxId', $profile['personal']);
        $this->assertArrayNotHasKey('income', $profile['employment']);
        $this->assertArrayNotHasKey('guarantor', $profile);
        $this->assertStringNotContainsString('30.123.456', (string) json_encode($profile));
        $this->getJson('/api/v1/admin/leads?document=30123456')->assertForbidden();
    }

    public function test_document_search_respects_advisor_and_tenant_scope(): void
    {
        $a = $this->tenant();
        $b = $this->tenant();
        $adminA = $this->user($a, RoleCode::TENANT_ADMIN);
        $adminB = $this->user($b, RoleCode::TENANT_ADMIN);
        $ana = $this->user($a, RoleCode::SALES_ADVISOR);
        $beto = $this->user($a, RoleCode::SALES_ADVISOR);
        $dni = ['personal' => ['documentNumber' => '33444555']];

        $leadA = $this->as($a, $adminA)->postJson('/api/v1/admin/leads', ['name' => 'De Ana', 'agent_id' => $ana->public_id, 'profile' => $dni])->assertCreated()->json('data.id');
        $leadB = $this->as($b, $adminB)->postJson('/api/v1/admin/leads', ['name' => 'De B', 'profile' => $dni])->assertCreated()->json('data.id');
        $ids = fn (): array => array_column((array) $this->getJson('/api/v1/admin/leads?document=33444555')->assertOk()->json('data'), 'id');

        $this->as($a, $adminA);
        $this->assertSame([$leadA], $ids());
        $this->as($b, $adminB);
        $this->assertSame([$leadB], $ids());
        $this->as($a, $ana);
        $this->assertSame([$leadA], $ids());
        $this->as($a, $beto);
        $this->assertSame([], $ids());
    }

    public function test_profile_only_patch_with_stale_version_is_409_and_leaves_profile_intact(): void
    {
        $tenant = $this->tenant();
        $admin = $this->user($tenant, RoleCode::TENANT_ADMIN);
        $lead = $this->as($tenant, $admin)->postJson('/api/v1/admin/leads', ['name' => 'Version', 'profile' => $this->fullProfile()])->assertCreated()->json('data.id');
        $contactId = DB::table('leads')->where('public_id', $lead)->value('contact_id');
        $before = DB::table('contacts')->where('id', $contactId)->value('profile_json');
        $version = $this->getJson('/api/v1/admin/leads/'.$lead)->json('data.version');
        $this->patchJson('/api/v1/admin/leads/'.$lead, ['profile' => ['currentHousing' => ['status' => 'OWNER']]])->assertOk();
        $current = DB::table('contacts')->where('id', $contactId)->value('profile_json');
        $this->assertNotSame($before, $current);

        $this->patchJson('/api/v1/admin/leads/'.$lead, ['version' => $version, 'profile' => ['personal' => ['nationality' => 'Otra'], 'guarantor' => null]])
            ->assertStatus(409)->assertJsonPath('error.code', 'LEAD_VERSION_CONFLICT');
        $this->assertSame($current, DB::table('contacts')->where('id', $contactId)->value('profile_json'));
    }
}
