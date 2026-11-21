<?php

namespace Tests\Feature\CRM;

use App\Domain\Tenancy\Models\Tenant;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Str;
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
            foreach (['2026-09-15.001_real_inventory_source.sql', '2026-09-15.002_real_inventory_relations.sql', '2026-10-11.001_web_push_out_of_hours.sql'] as $migration) {
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

    /** EVP-178: the lead_interests forward backfills each unit link once, however many times it runs. */
    public function test_lead_interests_forward_backfills_unit_links_once(): void
    {
        $this->assertStringContainsString('test', strtolower(DB::connection()->getDatabaseName()));
        $tenant = Tenant::factory()->create();
        try {
            $contact = DB::table('contacts')->insertGetId([
                'tenant_id' => $tenant->id, 'public_id' => (string) Str::uuid(), 'display_name' => 'Backfill', 'first_seen_at' => now(), 'last_seen_at' => now(),
            ]);
            $stage = DB::table('pipeline_stages')->insertGetId(['tenant_id' => $tenant->id, 'code' => 'NEW', 'name' => 'New', 'category' => 'OPEN', 'position' => 1]);
            $lead = DB::table('leads')->insertGetId([
                'tenant_id' => $tenant->id, 'public_id' => (string) Str::uuid(), 'contact_id' => $contact, 'stage_id' => $stage,
                'source_channel' => 'WEB_FORM', 'source_kind' => 'CONTACT_FORM', 'title' => 'Backfill', 'first_touch_at' => now(), 'last_touch_at' => now(),
            ]);
            // Real inventory (forward 2026-09-15.001) also holds LEASING and UNKNOWN operations/categories.
            foreach ([['SALE', 'HOUSE'], ['LEASING', 'UNKNOWN'], ['UNKNOWN', 'UNKNOWN']] as [$operation, $category]) {
                $property = DB::table('properties')->insertGetId([
                    'tenant_id' => $tenant->id, 'public_id' => (string) Str::uuid(), 'title' => 'Backfill unit', 'operation' => $operation,
                    'category' => $category, 'status' => 'AVAILABLE', 'city' => 'Salta', 'province' => 'Salta',
                ]);
                DB::table('lead_properties')->insert([
                    'tenant_id' => $tenant->id, 'lead_id' => $lead, 'property_id' => $property, 'interest_level' => 'HIGH', 'status' => 'NEGOTIATING',
                    'quoted_price' => 1000, 'quoted_currency_code' => 'ARS', 'notes' => 'Nota previa',
                ]);
            }
            $links = DB::table('lead_properties')->where('tenant_id', $tenant->id)->orderBy('property_id')->get()->toJson();
            foreach (range(1, 2) as $attempt) {
                DB::unprepared((string) file_get_contents(database_path('schema/forward/2026-11-21.001_lead_interests.sql')));
            }
            $interests = DB::table('lead_interests')->where('tenant_id', $tenant->id)->orderBy('property_id')->get();
            $this->assertSame(['SALE', 'LEASING', 'UNKNOWN'], $interests->pluck('operation')->all());
            $this->assertSame(['HOUSE', 'UNKNOWN', 'UNKNOWN'], $interests->pluck('category')->all());
            $this->assertSame(array_fill(0, 3, 'NEGOTIATING'), $interests->pluck('status')->all());
            $this->assertSame(array_fill(0, 3, 'Nota previa'), $interests->pluck('notes')->all());
            $this->assertSame($links, DB::table('lead_properties')->where('tenant_id', $tenant->id)->orderBy('property_id')->get()->toJson());
            $this->assertTrue(DB::table('schema_versions')->where('version', '2026-11-21.001')->exists());
        } finally {
            foreach (['lead_interests', 'lead_properties', 'leads', 'properties', 'pipeline_stages', 'contacts'] as $table) {
                DB::table($table)->where('tenant_id', $tenant->id)->delete();
            }
            $tenant->delete();
        }
    }
}
