<?php

namespace Tests\Feature\Inventory;

use App\Domain\Inventory\Services\ProjectLanding;
use App\Domain\Tenancy\Models\Tenant;
use Illuminate\Database\Eloquent\ModelNotFoundException;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;
use Tests\TestCase;

final class ImportLandingContentTest extends TestCase
{
    use DatabaseTransactions;

    public function test_dry_run_rolls_back_and_apply_is_repeatable_without_overwriting_edits(): void
    {
        $tenant = Tenant::factory()->create();
        $uuid = (string) Str::uuid();
        $id = DB::table('projects')->insertGetId(['tenant_id' => $tenant->id, 'public_id' => $uuid,
            'name' => 'Inventario', 'project_type' => 'BUILDING', 'status' => 'PRE_SALE', 'city' => 'Jujuy', 'province' => 'Jujuy']);
        $payload = json_decode(file_get_contents(base_path('tests/Fixtures/landing-v1.json')), true)['data'][0];
        unset($payload['public_id'], $payload['updated_at']);
        $payload = array_replace($payload, ['name' => 'Editorial', 'is_visible' => false, 'is_featured' => false,
            'cover' => null, 'logo' => null, 'gallery' => [], 'documents' => []]);
        $asset = ['project_public_id' => $uuid, 'url' => ProjectLanding::ASSET_PREFIX.'approved/test.jpg', 'title' => 'Foto', 'mime_type' => 'image/jpeg'];
        $manifest = ['tenant_public_id' => $tenant->public_id, 'assets' => [$asset], 'projects' => [['public_id' => $uuid, 'presentation' => $payload]]];
        $path = tempnam(sys_get_temp_dir(), 'landing-content-');
        try {
            file_put_contents($path, json_encode($manifest, JSON_THROW_ON_ERROR));
            $this->artisan('everprop:landing-content', ['manifest' => $path])->assertSuccessful();
            $this->assertDatabaseMissing('project_landing', ['tenant_id' => $tenant->id, 'project_id' => $id]);
            $this->assertDatabaseMissing('project_landing_assets', ['tenant_id' => $tenant->id, 'project_id' => $id]);
            $invalid = $manifest;
            $invalid['projects'][] = ['public_id' => (string) Str::uuid(), 'presentation' => $payload];
            file_put_contents($path, json_encode($invalid, JSON_THROW_ON_ERROR));
            try {
                $this->artisan('everprop:landing-content', ['manifest' => $path, '--apply' => true])->run();
                $this->fail('A later invalid project must roll back previously imported content and assets.');
            } catch (ModelNotFoundException) {
                $this->assertDatabaseMissing('project_landing', ['tenant_id' => $tenant->id, 'project_id' => $id]);
                $this->assertDatabaseMissing('project_landing_assets', ['tenant_id' => $tenant->id, 'project_id' => $id]);
            }
            file_put_contents($path, json_encode($manifest, JSON_THROW_ON_ERROR));
            $this->artisan('everprop:landing-content', ['manifest' => $path, '--apply' => true])->assertSuccessful();
            $this->assertDatabaseHas('project_landing', ['tenant_id' => $tenant->id, 'project_id' => $id, 'is_visible' => false, 'first_published_at' => null]);
            DB::table('project_landing')->where('tenant_id', $tenant->id)->where('project_id', $id)->update(['content' => json_encode(['name' => 'Edición manual'])]);
            $this->artisan('everprop:landing-content', ['manifest' => $path, '--apply' => true])->assertSuccessful();
            $this->assertSame('Edición manual', json_decode(DB::table('project_landing')->where('tenant_id', $tenant->id)->where('project_id', $id)->value('content'), true)['name']);
            $this->assertSame(1, DB::table('project_landing_assets')->where('tenant_id', $tenant->id)->where('project_id', $id)->count());
            $this->assertDatabaseHas('projects', ['id' => $id, 'name' => 'Inventario']);
        } finally {
            unlink($path);
        }
    }

    public function test_foreign_project_rejects_the_manifest_and_rolls_back_its_assets(): void
    {
        $tenant = Tenant::factory()->create();
        $other = Tenant::factory()->create();
        $uuid = (string) Str::uuid();
        DB::table('projects')->insert(['tenant_id' => $other->id, 'public_id' => $uuid,
            'name' => 'Ajeno', 'project_type' => 'BUILDING', 'status' => 'PRE_SALE', 'city' => 'Jujuy', 'province' => 'Jujuy']);
        $manifest = ['tenant_public_id' => $tenant->public_id, 'assets' => [['project_public_id' => $uuid,
            'url' => ProjectLanding::ASSET_PREFIX.'approved/test.jpg', 'title' => 'Foto', 'mime_type' => 'image/jpeg']],
            'projects' => [['public_id' => $uuid, 'presentation' => ['is_visible' => false, 'is_featured' => false]]]];
        $path = tempnam(sys_get_temp_dir(), 'landing-content-');
        try {
            file_put_contents($path, json_encode($manifest, JSON_THROW_ON_ERROR));
            try {
                $this->artisan('everprop:landing-content', ['manifest' => $path, '--apply' => true])->run();
                $this->fail('A foreign project must reject the import.');
            } catch (ValidationException) {
                $this->assertDatabaseMissing('project_landing_assets', ['tenant_id' => $tenant->id]);
                $this->assertDatabaseMissing('project_landing', ['tenant_id' => $tenant->id]);
            }
        } finally {
            unlink($path);
        }
    }
}
