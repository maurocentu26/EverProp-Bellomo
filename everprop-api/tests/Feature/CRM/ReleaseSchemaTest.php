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
        foreach (['visits', 'lead_follow_ups', 'web_push_subscriptions'] as $table) {
            $before[$table] = DB::table($table)->orderBy('id')->get()->toJson();
        }
        foreach (range(1, 2) as $attempt) {
            foreach (['apply-visit-extension.php', 'apply-web-push.php'] as $script) {
                $process = new Process([PHP_BINARY, 'scripts/'.$script], base_path(), [
                    'APP_ENV' => 'testing', 'DB_DATABASE' => $database,
                ]);
                $process->mustRun();
            }
        }
        $this->assertTrue(Schema::hasColumns('visits', ['follow_up_id', 'guest_name', 'guest_phone', 'guest_email']));
        foreach ($before as $table => $snapshot) {
            $this->assertSame($snapshot, DB::table($table)->orderBy('id')->get()->toJson(), $table);
        }
    }
}
