<?php

namespace Tests\Feature\Inventory;

use App\Domain\AgentRuntime\Tools\PublicInventory;
use App\Domain\Tenancy\Models\Tenant;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Tests\TestCase;

final class SeedBellomoCopyStatusTest extends TestCase
{
    use DatabaseTransactions;

    private function project(int $tenantId, ?int $legacyId, string $name, string $status = 'PRE_SALE', string $city = 'Ciudad'): int
    {
        return (int) DB::table('projects')->insertGetId([
            'tenant_id' => $tenantId, 'public_id' => (string) Str::uuid(), 'legacy_id' => $legacyId, 'name' => $name,
            'project_type' => 'LAND_DEVELOPMENT', 'status' => $status, 'progress' => 7, 'total_units' => 3,
            'city' => $city, 'province' => 'Jujuy',
        ]);
    }

    private function unit(int $tenantId, int $projectId, string $city = 'Ciudad'): int
    {
        return (int) DB::table('properties')->insertGetId([
            'tenant_id' => $tenantId, 'project_id' => $projectId, 'public_id' => (string) Str::uuid(),
            'title' => 'Unidad', 'operation' => 'SALE', 'category' => 'LOT', 'status' => 'AVAILABLE',
            'city' => $city, 'province' => 'Jujuy',
        ]);
    }

    public function test_seed_sets_stage_from_copy_and_removes_invented_figures_for_bellomo_only(): void
    {
        $tenant = Tenant::query()->where('slug', 'bellomo')->first() ?? Tenant::factory()->create(['slug' => 'bellomo']);
        $other = Tenant::factory()->create();
        // The other tenant's rows go first, so a lookup without tenant_id would find them.
        $foreign = $this->project($other->id, 34, 'LAS COLINAS', 'UNKNOWN');
        $foreignByName = $this->project($other->id, null, 'Las Colinas 2', 'UNKNOWN');
        $foreignBlankCity = $this->project($other->id, 57, 'EL ROCIO', 'UNKNOWN', '');
        $foreignUnit = $this->unit($other->id, $foreignBlankCity, '');
        $colinas = $this->project($tenant->id, 34, 'LAS COLINAS');
        $rocio = $this->project($tenant->id, 57, 'EL ROCIO', 'PRE_SALE', '');
        $rocioUnit = $this->unit($tenant->id, $rocio, '');
        $remansoId = $this->project($tenant->id, null, 'Loteo El Remanso');
        $huasi = $this->project($tenant->id, null, 'Huasi I');
        $this->unit($tenant->id, $huasi);

        $this->artisan('everprop:seed-bellomo-copy', ['--tenant' => $tenant->id])->assertSuccessful();

        $projects = DB::table('projects')->where('tenant_id', $tenant->id);
        $byName = fn (string $name) => (clone $projects)->where('name', $name)->first();
        $landing = fn (string $slug) => json_decode(DB::table('project_landing')->where('tenant_id', $tenant->id)->where('slug', $slug)->value('content'), true);

        // Excel projects keep their unit totals and progress; the copy only sets the stage.
        $row = (clone $projects)->where('id', $colinas)->first();
        self::assertSame('COMPLETED', $row->status);
        self::assertSame(3, (int) $row->total_units);
        self::assertSame(7, (int) $row->progress);
        self::assertStringStartsWith('Vendido completamente', $landing('las-colinas')['status_label']);

        // A locality missing from the workbook comes from the copy, for the project and its units.
        $city = (clone $projects)->where('id', $rocio)->value('city');
        self::assertNotSame('', $city);
        self::assertSame($city, DB::table('properties')->where('id', $rocioUnit)->value('city'));

        // Projects outside the workbook lose their invented figures, and their stage follows the copy.
        $remanso = $byName('Loteo El Remanso');
        self::assertSame($remansoId, (int) $remanso->id);
        self::assertSame('PLANNING', $remanso->status);
        self::assertNull($remanso->progress);
        self::assertSame(0, (int) $remanso->total_units);
        self::assertSame('PRE_SALE', $byName('Huasi IX (Córdoba)')->status);
        self::assertSame('UNDER_CONSTRUCTION', $byName('Las Colinas 2')->status);

        // A project with units loaded through the panel keeps its figures.
        self::assertSame(3, (int) $byName('Huasi I')->total_units);

        // Percentages that contradict the official inventory are not published.
        foreach (['la-arbolada-2', 'los-cardinales'] as $slug) {
            self::assertEmpty(array_filter($landing($slug)['features'], fn (string $feature) => str_contains($feature, '% vendido')));
        }

        // Another tenant's rows are untouched, whether matched by legacy id or by name.
        foreach ([$foreign, $foreignByName, $foreignBlankCity] as $id) {
            $untouched = DB::table('projects')->where('id', $id)->first();
            self::assertSame('UNKNOWN', $untouched->status);
            self::assertSame(7, (int) $untouched->progress);
        }
        self::assertSame('', DB::table('projects')->where('id', $foreignBlankCity)->value('city'));
        self::assertSame('', DB::table('properties')->where('id', $foreignUnit)->value('city'));
        self::assertSame(0, DB::table('project_landing')->where('tenant_id', $other->id)->count());
        self::assertSame(0, app(PublicInventory::class)->query($other->id)->count());
    }

    public function test_seed_does_not_republish_a_withdrawn_project(): void
    {
        $tenant = Tenant::query()->where('slug', 'bellomo')->first() ?? Tenant::factory()->create(['slug' => 'bellomo']);
        $byStatus = $this->project($tenant->id, 144, 'LA ARBOLADA 2', 'UNKNOWN');
        $this->unit($tenant->id, $byStatus);
        $byLanding = $this->project($tenant->id, 59, 'LOTEO CARDINALES');
        $this->unit($tenant->id, $byLanding);
        DB::table('project_landing')->insert([
            'tenant_id' => $tenant->id, 'project_id' => $byLanding, 'slug' => 'los-cardinales',
            'is_visible' => 0, 'sort_order' => 1, 'content' => '{}',
        ]);
        // The official slug sits visible on a duplicate while the real project's landing is hidden.
        $moved = $this->project($tenant->id, 72, 'LOTEO SANTA EMILIA MONTERRICO');
        $this->unit($tenant->id, $moved);
        $duplicate = $this->project($tenant->id, null, 'Duplicado Santa Emilia');
        DB::table('project_landing')->insert([
            ['tenant_id' => $tenant->id, 'project_id' => $moved, 'slug' => 'santa-emilia-oculta', 'is_visible' => 0, 'sort_order' => 2, 'content' => '{}'],
            ['tenant_id' => $tenant->id, 'project_id' => $duplicate, 'slug' => 'santa-emilia', 'is_visible' => 1, 'sort_order' => 3, 'content' => '{}'],
        ]);

        $this->artisan('everprop:seed-bellomo-copy', ['--tenant' => $tenant->id])->assertSuccessful();

        self::assertSame('UNKNOWN', DB::table('projects')->where('id', $byStatus)->value('status'));
        self::assertSame(0, (int) DB::table('project_landing')->where('project_id', $byLanding)->value('is_visible'));
        self::assertSame(0, (int) DB::table('project_landing')->where('project_id', $moved)->value('is_visible'));
        self::assertSame(0, app(PublicInventory::class)->query($tenant->id)->count());
    }

    public function test_link_legacy_only_assigns_ids_to_existing_projects_of_this_tenant(): void
    {
        $tenant = Tenant::query()->where('slug', 'bellomo')->first() ?? Tenant::factory()->create(['slug' => 'bellomo']);
        $other = Tenant::factory()->create();
        $foreign = $this->project($other->id, null, 'Las Colinas 1');
        $colinas = $this->project($tenant->id, null, 'Las Colinas 1');
        $outside = $this->project($tenant->id, null, 'Las Colinas 2');

        $this->artisan('everprop:seed-bellomo-copy', ['--tenant' => $tenant->id, '--link-legacy' => true])->assertSuccessful();

        $row = DB::table('projects')->where('id', $colinas)->first();
        self::assertSame(34, (int) $row->legacy_id);
        self::assertSame('PRE_SALE', $row->status);
        self::assertSame(7, (int) $row->progress);
        self::assertNull(DB::table('projects')->where('id', $outside)->value('legacy_id'));
        self::assertNull(DB::table('projects')->where('id', $foreign)->value('legacy_id'));
        self::assertSame(0, DB::table('project_landing')->where('tenant_id', $tenant->id)->count());
    }

    public function test_seed_rejects_any_target_other_than_bellomo(): void
    {
        $other = Tenant::factory()->create();
        $project = $this->project($other->id, 34, 'LAS COLINAS', 'UNKNOWN');

        $this->artisan('everprop:seed-bellomo-copy', ['--tenant' => $other->id])->assertFailed();
        $this->artisan('everprop:seed-bellomo-copy', ['--tenant' => $other->id.'abc'])->assertFailed();

        self::assertSame('UNKNOWN', DB::table('projects')->where('id', $project)->value('status'));
        self::assertSame(1, DB::table('projects')->where('tenant_id', $other->id)->count());
        self::assertSame(0, DB::table('project_landing')->where('tenant_id', $other->id)->count());
    }
}
