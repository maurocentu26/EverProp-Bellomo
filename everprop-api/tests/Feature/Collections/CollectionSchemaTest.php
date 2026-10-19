<?php

namespace Tests\Feature\Collections;

use App\Domain\Shared\Infrastructure\Database\SchemaContractVerifier;
use App\Domain\Tenancy\Models\Tenant;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

final class CollectionSchemaTest extends TestCase
{
    use DatabaseTransactions;

    public function test_contract_accepts_empty_inventory_but_requires_relations_after_import(): void
    {
        self::assertSame('mysql', DB::connection()->getDriverName());
        self::assertStringContainsString('test', DB::connection()->getDatabaseName());
        $verifier = new SchemaContractVerifier(DB::connection());
        $before = $verifier->verify();
        foreach ($before as $check) {
            self::assertTrue($check['passed']);
        }
        $tenant = Tenant::factory()->create();
        DB::table('inventory_source_imports')->insert([
            'tenant_id' => $tenant->id, 'source_sha256' => hash('sha256', 'isolated-schema-test'),
            'source_name' => 'isolated-fixture.json', 'workbook_json' => '{}', 'report_json' => '{}',
        ]);
        $after = $verifier->verify();
        self::assertSame(2, $after['inventory_foreign_keys']['expected']);
        self::assertSame($after['inventory_foreign_keys']['actual'] === 2, $after['inventory_foreign_keys']['passed']);
        self::assertSame(config('database-contract.foreign_keys') + 2, $after['foreign_keys']['expected']);
        config(['database-contract.baseline_sha256' => str_repeat('0', 64)]);
        self::assertFalse($verifier->verify()['baseline_sha256']['passed']);
    }
}
