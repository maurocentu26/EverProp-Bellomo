<?php

namespace Tests\Feature;

use App\Domain\Shared\Infrastructure\Database\SchemaContractVerifier;
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

    // The inventory FK case lives in Collections\CollectionSchemaTest on develop.

    public function test_contract_passes_without_database_drivers(): void
    {
        foreach ((new SchemaContractVerifier(DB::connection()))->verify() as $name => $check) {
            self::assertTrue($check['passed'], $name);
        }
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
