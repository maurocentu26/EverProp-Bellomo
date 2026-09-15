<?php

namespace Tests\Feature\CRM;

use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Symfony\Component\Process\Process;
use Tests\TestCase;

final class ReleaseSchemaTest extends TestCase
{
    public function test_extensions_can_be_repeated_without_modifying_existing_records(): void
    {
        $this->assertTrue(app()->environment('testing'));
        $this->assertSame('mysql', DB::connection()->getDriverName());
        // Only the dedicated test database is eligible for a DDL verification.
        $database = DB::connection()->getDatabaseName();
        $this->assertStringContainsString('test', strtolower($database));
        $before = [];
        foreach (['visits', 'lead_follow_ups', 'web_push_subscriptions', 'projects', 'properties', 'legacy_property_types', 'legacy_property_statuses', 'legacy_localities', 'inventory_source_imports'] as $table) {
            $before[$table] = DB::table($table)->orderBy(Schema::hasColumn($table, 'id') ? 'id' : 'tenant_id')->get()->toJson();
        }
        foreach (range(1, 2) as $attempt) {
            foreach (['2026-09-15.001_real_inventory_source.sql', '2026-09-15.002_real_inventory_relations.sql'] as $migration) {
                DB::unprepared(file_get_contents(database_path('schema/forward/'.$migration)));
            }
            foreach (['apply-visit-extension.php', 'apply-web-push.php'] as $script) {
                $process = new Process([PHP_BINARY, 'scripts/'.$script], base_path(), [
                    'APP_ENV' => 'testing', 'DB_DATABASE' => $database,
                ]);
                $process->mustRun();
            }
        }
        $this->assertTrue(Schema::hasColumns('visits', ['follow_up_id', 'guest_name', 'guest_phone', 'guest_email']));
        foreach ($before as $table => $snapshot) {
            $this->assertSame($snapshot, DB::table($table)->orderBy(Schema::hasColumn($table, 'id') ? 'id' : 'tenant_id')->get()->toJson(), $table);
        }
    }
}
