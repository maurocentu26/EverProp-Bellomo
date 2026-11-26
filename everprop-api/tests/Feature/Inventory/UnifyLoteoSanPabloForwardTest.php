<?php

namespace Tests\Feature\Inventory;

use App\Domain\Tenancy\Models\Tenant;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Tests\TestCase;

final class UnifyLoteoSanPabloForwardTest extends TestCase
{
    /** @var list<int> */
    private array $createdTenants = [];

    protected function tearDown(): void
    {
        if ($this->createdTenants !== []) {
            foreach ([
                'audit_logs',
                'lead_interests',
                'leads',
                'contacts',
                'pipeline_stages',
                'project_intake_units',
                'project_intakes',
                'user_inventory_scopes',
                'knowledge_documents',
                'project_landing_assets',
                'project_landing',
                'properties',
                'projects',
                'users',
            ] as $table) {
                DB::table($table)->whereIn('tenant_id', $this->createdTenants)->delete();
            }
            DB::table('tenants')->whereIn('id', $this->createdTenants)->delete();
            $this->createdTenants = [];
        }

        parent::tearDown();
    }

    public function test_forward_unifies_san_pablo_for_bellomo_only_and_is_rerunnable(): void
    {
        $existingStaging = Tenant::query()->where('slug', 'bellomito-staging')->first();
        $this->assertNull($existingStaging, 'Expected bellomito-staging not to pre-exist in the isolated test DB.');

        $bellomo = Tenant::factory()->create(['slug' => 'bellomito-staging']);
        $other = Tenant::factory()->create();
        $this->createdTenants = [(int) $bellomo->id, (int) $other->id];

        $sp1 = $this->insertProject((int) $bellomo->id, 70, 'LOTEO SAN PABLO 1', 1);
        $sp2 = $this->insertProject((int) $bellomo->id, 73, 'LOTEO SAN PABLO 2', 1);
        $foreignSp1 = $this->insertProject((int) $other->id, 70, 'LOTEO SAN PABLO 1', 1);
        $foreignSp2 = $this->insertProject((int) $other->id, 73, 'LOTEO SAN PABLO 2', 1);

        $prop1 = $this->insertProperty((int) $bellomo->id, $sp1, 'SP1-1');
        $prop2 = $this->insertProperty((int) $bellomo->id, $sp2, 'SP2-1');
        $foreignProp2 = $this->insertProperty((int) $other->id, $foreignSp2, 'FSP2-1');

        DB::table('project_landing')->insert([
            [
                'tenant_id' => $bellomo->id,
                'project_id' => $sp1,
                'slug' => 'loteo-san-pablo-1',
                'is_visible' => 1,
                'sort_order' => 5,
                'content' => json_encode(['name' => 'San Pablo 1', 'summary' => 'Tu balcón a la ciudad']),
            ],
            [
                'tenant_id' => $bellomo->id,
                'project_id' => $sp2,
                'slug' => 'loteo-san-pablo-2',
                'is_visible' => 1,
                'sort_order' => 6,
                'content' => json_encode(['name' => 'San Pablo 2']),
            ],
            [
                'tenant_id' => $other->id,
                'project_id' => $foreignSp2,
                'slug' => 'loteo-san-pablo-2',
                'is_visible' => 1,
                'sort_order' => 1,
                'content' => json_encode(['name' => 'San Pablo 2']),
            ],
        ]);

        DB::table('project_landing_assets')->insert([
            ['tenant_id' => $bellomo->id, 'project_id' => $sp1, 'url' => 'https://cdn.example.invalid/shared.webp', 'mime_type' => 'image/webp', 'title' => 'Shared'],
            ['tenant_id' => $bellomo->id, 'project_id' => $sp2, 'url' => 'https://cdn.example.invalid/shared.webp', 'mime_type' => 'image/webp', 'title' => 'Shared dup'],
            ['tenant_id' => $bellomo->id, 'project_id' => $sp2, 'url' => 'https://cdn.example.invalid/sp2-only.webp', 'mime_type' => 'image/webp', 'title' => 'Stage 2'],
        ]);

        $docId = (int) DB::table('knowledge_documents')->insertGetId([
            'tenant_id' => $bellomo->id,
            'public_id' => (string) Str::uuid(),
            'title' => 'Ficha San Pablo 2',
            'audience' => 'PUBLIC',
            'status' => 'APPROVED',
            'project_id' => $sp2,
            'body' => 'Detalle de lotes',
        ]);

        $userOverlap = $this->insertUser((int) $bellomo->id, 'overlap@example.invalid');
        $userOnlySp2 = $this->insertUser((int) $bellomo->id, 'onlysp2@example.invalid');
        DB::table('user_inventory_scopes')->insert([
            ['tenant_id' => $bellomo->id, 'user_id' => $userOverlap, 'scope_type' => 'PROJECT', 'project_id' => $sp1, 'can_view' => 1, 'can_edit' => 0, 'can_manage_prices' => 0],
            ['tenant_id' => $bellomo->id, 'user_id' => $userOverlap, 'scope_type' => 'PROJECT', 'project_id' => $sp2, 'can_view' => 1, 'can_edit' => 1, 'can_manage_prices' => 0],
            ['tenant_id' => $bellomo->id, 'user_id' => $userOnlySp2, 'scope_type' => 'PROJECT', 'project_id' => $sp2, 'can_view' => 1, 'can_edit' => 0, 'can_manage_prices' => 0],
        ]);

        DB::table('project_intakes')->insert([
            ['tenant_id' => $bellomo->id, 'request_key' => (string) Str::uuid(), 'payload_hash' => str_repeat('a', 64), 'project_id' => $sp1],
            ['tenant_id' => $bellomo->id, 'request_key' => (string) Str::uuid(), 'payload_hash' => str_repeat('b', 64), 'project_id' => $sp2],
        ]);
        $intakeUnitId = (int) DB::table('project_intake_units')->insertGetId([
            'tenant_id' => $bellomo->id,
            'request_key' => (string) Str::uuid(),
            'payload_hash' => str_repeat('c', 64),
            'project_id' => $sp2,
            'property_id' => $prop2,
        ]);

        $interestId = $this->insertLeadInterest((int) $bellomo->id, $sp2, $prop2);

        $script = (string) file_get_contents(base_path('database/schema/forward/2026-11-26.003_unify_loteo_san_pablo.sql'));
        DB::unprepared($script);

        $kept = DB::table('projects')->where('id', $sp1)->first();
        $dropped = DB::table('projects')->where('id', $sp2)->first();
        $this->assertSame('Loteo San Pablo', $kept->name);
        $this->assertNull($kept->deleted_at);
        $this->assertSame(2, (int) $kept->total_units);
        $this->assertNotNull($dropped->deleted_at);

        $this->assertSame([$sp1, $sp1], DB::table('properties')->whereIn('id', [$prop1, $prop2])->orderBy('id')->pluck('project_id')->map(fn ($v) => (int) $v)->all());
        $this->assertSame(2, DB::table('project_landing_assets')->where('tenant_id', $bellomo->id)->where('project_id', $sp1)->count());
        $this->assertSame(0, DB::table('project_landing_assets')->where('tenant_id', $bellomo->id)->where('project_id', $sp2)->count());
        $this->assertSame($sp1, (int) DB::table('knowledge_documents')->where('id', $docId)->value('project_id'));
        $this->assertSame($sp1, (int) DB::table('lead_interests')->where('id', $interestId)->value('project_id'));
        $this->assertSame($sp1, (int) DB::table('project_intake_units')->where('id', $intakeUnitId)->value('project_id'));
        $this->assertSame(1, DB::table('project_intakes')->where('tenant_id', $bellomo->id)->where('project_id', $sp1)->count());
        $this->assertSame(0, DB::table('project_intakes')->where('tenant_id', $bellomo->id)->where('project_id', $sp2)->count());

        $overlapScope = DB::table('user_inventory_scopes')->where('tenant_id', $bellomo->id)->where('user_id', $userOverlap)->first();
        $this->assertSame($sp1, (int) $overlapScope->project_id);
        $this->assertSame(1, (int) $overlapScope->can_edit);
        $this->assertSame($sp1, (int) DB::table('user_inventory_scopes')->where('tenant_id', $bellomo->id)->where('user_id', $userOnlySp2)->value('project_id'));

        $landing = DB::table('project_landing')->where('tenant_id', $bellomo->id)->where('project_id', $sp1)->first();
        $this->assertSame('loteo-san-pablo', $landing->slug);
        $this->assertSame('Loteo San Pablo', json_decode((string) $landing->content, true)['name']);
        $this->assertSame(0, DB::table('project_landing')->where('tenant_id', $bellomo->id)->where('project_id', $sp2)->count());

        // Foreign tenant must be completely untouched.
        $this->assertSame('LOTEO SAN PABLO 1', DB::table('projects')->where('id', $foreignSp1)->value('name'));
        $this->assertNull(DB::table('projects')->where('id', $foreignSp2)->value('deleted_at'));
        $this->assertSame($foreignSp2, (int) DB::table('properties')->where('id', $foreignProp2)->value('project_id'));
        $this->assertSame('loteo-san-pablo-2', DB::table('project_landing')->where('tenant_id', $other->id)->where('project_id', $foreignSp2)->value('slug'));

        $auditCount = DB::table('audit_logs')->where('tenant_id', $bellomo->id)->count();
        $this->assertSame(2, $auditCount);
        $this->assertTrue(DB::table('schema_versions')->where('version', '2026-11-26.003')->exists());

        // Re-running the forward is a no-op and writes no duplicate audit rows.
        DB::unprepared($script);
        $this->assertSame($auditCount, DB::table('audit_logs')->where('tenant_id', $bellomo->id)->count());

        // Re-seeding official copy keeps a single Loteo San Pablo and does not recreate San Pablo 2.
        $this->artisan('everprop:seed-bellomo-copy', ['--tenant' => $bellomo->id])->assertSuccessful();
        $this->assertSame(1, DB::table('project_landing')->where('tenant_id', $bellomo->id)->where('slug', 'loteo-san-pablo')->count());
        $this->assertSame(0, DB::table('project_landing')->where('tenant_id', $bellomo->id)->whereIn('slug', ['loteo-san-pablo-1', 'loteo-san-pablo-2'])->count());
        $this->assertSame(0, DB::table('projects')->where('tenant_id', $bellomo->id)->whereNull('deleted_at')->whereIn('name', ['San Pablo 1', 'San Pablo 2', 'Loteo San Pablo 1', 'Loteo San Pablo 2'])->count());
    }

    private function insertProject(int $tenantId, int $legacyId, string $name, int $totalUnits): int
    {
        return (int) DB::table('projects')->insertGetId([
            'tenant_id' => $tenantId,
            'public_id' => (string) Str::uuid(),
            'legacy_id' => $legacyId,
            'name' => $name,
            'project_type' => 'LAND_DEVELOPMENT',
            'status' => 'PRE_SALE',
            'progress' => 0,
            'total_units' => $totalUnits,
            'city' => 'San Salvador de Jujuy',
            'province' => 'Jujuy',
        ]);
    }

    private function insertProperty(int $tenantId, int $projectId, string $code): int
    {
        return (int) DB::table('properties')->insertGetId([
            'tenant_id' => $tenantId,
            'project_id' => $projectId,
            'public_id' => (string) Str::uuid(),
            'code' => $code,
            'title' => 'Lote '.$code,
            'operation' => 'SALE',
            'category' => 'LOT',
            'status' => 'AVAILABLE',
            'city' => 'San Salvador de Jujuy',
            'province' => 'Jujuy',
        ]);
    }

    private function insertUser(int $tenantId, string $email): int
    {
        return (int) DB::table('users')->insertGetId([
            'tenant_id' => $tenantId,
            'public_id' => (string) Str::uuid(),
            'email' => $email,
            'display_name' => $email,
            'role_code' => 'SALES_ADVISOR',
            'status' => 'ACTIVE',
        ]);
    }

    private function insertLeadInterest(int $tenantId, int $projectId, int $propertyId): int
    {
        $stageId = (int) DB::table('pipeline_stages')->insertGetId([
            'tenant_id' => $tenantId,
            'code' => 'NEW',
            'name' => 'Nuevo',
            'category' => 'OPEN',
            'position' => 1,
            'is_active' => 1,
        ]);
        $now = now()->format('Y-m-d H:i:s.v');
        $contactId = (int) DB::table('contacts')->insertGetId([
            'tenant_id' => $tenantId,
            'public_id' => (string) Str::uuid(),
            'display_name' => 'Contacto Prueba',
            'first_seen_at' => $now,
            'last_seen_at' => $now,
        ]);
        $leadId = (int) DB::table('leads')->insertGetId([
            'tenant_id' => $tenantId,
            'public_id' => (string) Str::uuid(),
            'contact_id' => $contactId,
            'stage_id' => $stageId,
            'source_channel' => 'WEB',
            'source_kind' => 'LANDING_FORM',
            'title' => 'Consulta San Pablo',
            'first_touch_at' => $now,
            'last_touch_at' => $now,
        ]);

        return (int) DB::table('lead_interests')->insertGetId([
            'public_id' => (string) Str::uuid(),
            'tenant_id' => $tenantId,
            'lead_id' => $leadId,
            'project_id' => $projectId,
            'property_id' => $propertyId,
            'operation' => 'SALE',
            'category' => 'LOT',
        ]);
    }
}
