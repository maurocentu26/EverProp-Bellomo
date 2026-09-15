<?php

namespace Tests\Feature\Inventory;

use App\Domain\Inventory\Services\InventorySourceImport;
use App\Domain\Inventory\Services\WorkbookInventorySource;
use App\Domain\Tenancy\Models\Tenant;
use App\Models\User;
use Illuminate\Database\QueryException;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use RuntimeException;
use Tests\TestCase;

final class WorkbookImportTest extends TestCase
{
    use DatabaseTransactions;

    private InventorySourceImport $importer;

    private Tenant $tenant;

    protected function setUp(): void
    {
        parent::setUp();
        self::assertSame('mysql', DB::connection()->getDriverName());
        self::assertStringContainsString('test', DB::connection()->getDatabaseName());
        $this->tenant = Tenant::factory()->create();
        $this->importer = new InventorySourceImport;
    }

    public function test_plan_and_rehearsal_do_not_change_data_and_apply_is_repeatable(): void
    {
        $source = $this->source();
        $before = $this->importer->snapshot($this->tenant->id);
        $plan = $this->importer->plan($source, $this->tenant->slug);
        self::assertSame($before, $this->importer->snapshot($this->tenant->id));
        $backup = ['target' => $plan['target'], 'rows' => $before];
        $result = $this->importer->apply($source, $plan, $backup, true);
        self::assertSame('rehearsed_and_rolled_back', $result['status']);
        self::assertSame($before, $this->importer->snapshot($this->tenant->id));
        self::assertSame('applied', $this->importer->apply($source, $plan, $backup, false)['status']);
        $row = DB::table('properties')->where('tenant_id', $this->tenant->id)->first();
        self::assertSame('NOT_SELLABLE', $row->status);
        self::assertNull($row->price);
        self::assertNull($row->currency_code);
        self::assertSame(4250, json_decode($row->legacy_data_json, true)['ProPre']);
        self::assertSame('already_applied', $this->importer->apply($source, $plan, $backup, false)['status']);
        self::assertSame(1, DB::table('properties')->where('tenant_id', $this->tenant->id)->count());
    }

    public function test_existing_identity_prices_and_operational_metadata_are_preserved_by_default(): void
    {
        $source = $this->source();
        $this->applySource($source);
        $query = DB::table('properties')->where('tenant_id', $this->tenant->id);
        $id = $query->value('public_id');
        $query->update(['price' => 900, 'currency_code' => 'ARS', 'main_image_url' => 'https://example.test/real.jpg']);
        $source['sha256'] = str_repeat('b', 64);
        $source['sheets']['Productos']['records'][0]['data']['ProDes1'] = 'New source description';
        $this->applySource($source);
        $row = $query->first();
        self::assertSame($id, $row->public_id);
        self::assertSame('900.00', $row->price);
        self::assertSame('ARS', $row->currency_code);
        self::assertSame('https://example.test/real.jpg', $row->main_image_url);
        self::assertSame('New source description', $row->description);
    }

    public function test_other_tenants_are_unchanged_and_cross_tenant_cleanup_is_rejected(): void
    {
        $other = Tenant::factory()->create();
        $source = $this->source();
        $plan = $this->importer->plan($source, $other->slug);
        $backup = ['target' => $plan['target'], 'rows' => $this->importer->snapshot($other->id)];
        $this->importer->apply($source, $plan, $backup, false);
        $before = $this->importer->snapshot($other->id);
        $this->applySource($source);
        self::assertSame($before, $this->importer->snapshot($other->id));
        $foreignId = DB::table('properties')->where('tenant_id', $other->id)->value('public_id');
        $this->expectException(RuntimeException::class);
        $this->expectExceptionMessage('another tenant');
        $this->importer->plan($source, $this->tenant->slug, cleanup: ['properties' => [$foreignId]]);
    }

    public function test_stale_plan_source_target_and_backup_are_rejected_without_writes(): void
    {
        $source = $this->source();
        $plan = $this->importer->plan($source, $this->tenant->slug);
        $backup = ['target' => $plan['target'], 'rows' => $this->importer->snapshot($this->tenant->id)];
        foreach (['target', 'source', 'backup', 'changes'] as $fault) {
            $badPlan = $plan;
            $badSource = $source;
            $badBackup = $backup;
            if ($fault === 'target') {
                $badPlan['target']['server_uuid'] = 'another-server';
            }
            if ($fault === 'source') {
                $badSource['sheets']['Productos']['records'][0]['data']['ProPre'] = 1;
            }
            if ($fault === 'backup') {
                $badBackup['rows'] = [];
            }
            if ($fault === 'changes') {
                $badPlan['changes']['properties'][0]['after']['price'] = 1;
            }
            try {
                $this->importer->apply($badSource, $badPlan, $badBackup, false);
                self::fail('Rejected input was accepted: '.$fault);
            } catch (RuntimeException $e) {
                self::assertNotSame('', $e->getMessage());
            }
            self::assertSame($backup['rows'], $this->importer->snapshot($this->tenant->id));
        }
        $this->insertUnrelatedProperty();
        $this->expectExceptionMessage('Database changed since review');
        $this->importer->apply($source, $plan, $backup, false);
    }

    public function test_linked_inventory_cannot_be_deleted_and_partial_import_rolls_back(): void
    {
        $id = $this->insertUnrelatedProperty();
        DB::table('property_features')->insert([
            'tenant_id' => $this->tenant->id, 'property_id' => $id, 'feature_group' => 'OTHER',
            'feature_code' => 'real-feature', 'label' => 'Keep me', 'feature_value' => '{}',
        ]);
        $uuid = DB::table('properties')->where('tenant_id', $this->tenant->id)->where('id', $id)->value('public_id');
        $source = $this->source();
        $plan = $this->importer->plan($source, $this->tenant->slug, cleanup: ['properties' => [$uuid]]);
        $before = $this->importer->snapshot($this->tenant->id);
        try {
            $this->importer->apply($source, $plan, ['target' => $plan['target'], 'rows' => $before], false);
            self::fail('Referenced property was deleted');
        } catch (QueryException) {
            self::assertSame($before, $this->importer->snapshot($this->tenant->id));
        }
    }

    public function test_missing_parent_and_zero_area_are_retained_without_fabricated_values(): void
    {
        $source = $this->source();
        $source['sheets']['Productos']['records'][0]['data']['EdId'] = 999;
        $source['sheets']['Productos']['records'][0]['data']['ProM2'] = 0;
        $this->applySource($source);
        $row = DB::table('properties')->where('tenant_id', $this->tenant->id)->first();
        self::assertNull($row->project_id);
        self::assertNull($row->area_m2);
        self::assertSame(999, $row->legacy_ed_id);
        self::assertSame(0, json_decode($row->legacy_data_json, true)['ProM2']);
    }

    public function test_duplicate_keys_and_unrecognized_headers_are_rejected(): void
    {
        $source = $this->source();
        $source['sheets']['Productos']['records'][] = $source['sheets']['Productos']['records'][0];
        try {
            (new WorkbookInventorySource)->normalize($source);
            self::fail('Duplicate key was accepted');
        } catch (\InvalidArgumentException $e) {
            self::assertStringContainsString('Duplicate', $e->getMessage());
        }
        $source = $this->source();
        $source['sheets']['Productos']['headers'][0] = 'wrong';
        $this->expectException(\InvalidArgumentException::class);
        (new WorkbookInventorySource)->normalize($source);
    }

    /** @param array<string, mixed> $source */
    private function applySource(array $source): void
    {
        $plan = $this->importer->plan($source, $this->tenant->slug);
        $this->importer->apply($source, $plan, ['target' => $plan['target'], 'rows' => $this->importer->snapshot($this->tenant->id)], false);
    }

    private function insertUnrelatedProperty(): int
    {
        return DB::table('properties')->insertGetId([
            'tenant_id' => $this->tenant->id, 'public_id' => (string) Str::uuid(),
            'title' => 'Existing operational property', 'operation' => 'SALE', 'category' => 'HOUSE',
            'status' => 'AVAILABLE', 'city' => 'Test city', 'province' => 'Test province',
        ]);
    }

    public function test_source_price_is_hidden_when_viewing_prices_is_forbidden(): void
    {
        $this->applySource($this->source());
        $user = User::factory()->for($this->tenant)->create(['role_code' => 'READ_ONLY']);
        DB::table('user_inventory_settings')->insert([
            'tenant_id' => $this->tenant->id, 'user_id' => $user->id,
            'visibility_mode' => 'ALL', 'can_view_prices' => false,
        ]);
        $id = DB::table('properties')->where('tenant_id', $this->tenant->id)->value('public_id');
        $this->actingAs($user)->withHeaders(['X-Everprop-Tenant' => $this->tenant->public_id, 'Origin' => 'http://localhost:5173'])
            ->getJson('/api/v1/admin/properties/'.$id)->assertOk()
            ->assertJsonMissingPath('data.price')->assertJsonMissingPath('data.legacy.data');
    }

    public function test_new_status_is_rejected_until_forward_schema_is_prepared(): void
    {
        DB::table('schema_versions')->where('version', '2026-09-15.001')->delete();
        $user = User::factory()->for($this->tenant)->create(['role_code' => 'TENANT_ADMIN']);
        $payload = ['title' => 'Test property', 'operation' => 'SALE', 'category' => 'LOT', 'status' => 'UNKNOWN', 'city' => 'Test', 'province' => 'Test'];
        $this->actingAs($user)->withHeaders(['X-Everprop-Tenant' => $this->tenant->public_id, 'Origin' => 'http://localhost:5173'])
            ->postJson('/api/v1/admin/properties', $payload)->assertUnprocessable()->assertJsonValidationErrors('status');
        $payload['status'] = 'AVAILABLE';
        $this->postJson('/api/v1/admin/properties', $payload)->assertCreated();
    }

    /** @return array<string, mixed> */
    private function source(): array
    {
        $data = [
            'Productos' => ['EdId' => 41, 'ProPis' => ' A ', 'ProDep' => ' 01 ', 'ProDes1' => 'Source description', 'ProTId' => 9, 'ProEId' => 7, 'ProPre' => 4250, 'ProM2' => 125.25],
            'Edificio' => ['EdId' => 41, 'EdNom' => 'Test loteo', 'LocCod' => 1],
            'ProdT01' => ['ProTId' => 9, 'ProTTip' => 'LOTES'],
            'Estado' => ['ProEId' => 7, 'ProEEst' => 'NO VENDIBLE'],
            'Localidades' => ['LocCod' => 1, 'LocDes' => 'Test city'],
        ];
        $source = ['source' => 'synthetic-test.xlsx', 'sha256' => str_repeat('a', 64), 'sheets' => []];
        foreach (WorkbookInventorySource::HEADERS as $sheet => $headers) {
            $source['sheets'][$sheet] = [
                'headers' => $headers, 'header_row' => 1, 'formulas' => [],
                'records' => [['row' => 2, 'data' => array_replace(array_fill_keys($headers, null), $data[$sheet])]],
            ];
        }

        return $source;
    }
}
