<?php

namespace Tests\Feature;

use App\Domain\Shared\Infrastructure\Database\SchemaContractVerifier;
use App\Domain\Tenancy\Models\Tenant;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/**
 * EVP-183: the contract must pass on a clean import and on awake-dedication, which also has the inventory FKs
 * (created after the Excel import) and Laravel's cache/session tables (database drivers).
 */
final class SchemaContractVerifierTest extends TestCase
{
    use DatabaseTransactions;

    protected function setUp(): void
    {
        parent::setUp();
        self::assertStringContainsString('test', DB::connection()->getDatabaseName());
        config(['session.driver' => 'array', 'cache.default' => 'array']);
    }

    public function test_contract_accepts_empty_inventory_but_requires_relations_after_import(): void
    {
        $verifier = new SchemaContractVerifier(DB::connection());
        foreach ($verifier->verify() as $name => $check) {
            self::assertTrue($check['passed'], $name);
        }

        $tenant = Tenant::factory()->create();
        DB::table('inventory_source_imports')->insert([
            'tenant_id' => $tenant->id, 'source_sha256' => hash('sha256', 'evp183-schema-test'),
            'source_name' => 'isolated-fixture.json', 'workbook_json' => '{}', 'report_json' => '{}',
        ]);
        $after = $verifier->verify();
        self::assertSame(2, $after['inventory_foreign_keys']['expected']);
        self::assertSame($after['inventory_foreign_keys']['actual'] === 2, $after['inventory_foreign_keys']['passed']);
        self::assertSame(config('database-contract.foreign_keys') + 2, $after['foreign_keys']['expected']);
    }

    public function test_database_session_and_cache_drivers_require_their_tables(): void
    {
        config(['session.driver' => 'database', 'cache.default' => 'database']);
        $result = (new SchemaContractVerifier(DB::connection()))->verify();

        self::assertSame(config('database-contract.tables') + 3, $result['tables']['expected']);
        self::assertContains('sessions', $result['global_tables']['expected']);
        self::assertContains('cache_locks', $result['global_tables']['expected']);
        // The test schema has no such tables, so the contract must flag them as missing.
        self::assertFalse($result['tables']['passed']);
        self::assertFalse($result['global_tables']['passed']);
    }
}
