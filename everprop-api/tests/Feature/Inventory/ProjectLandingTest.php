<?php

namespace Tests\Feature\Inventory;

use App\Domain\AgentRuntime\Tools\PublicInventory;
use App\Domain\Identity\Enums\RoleCode;
use App\Domain\Inventory\Services\ProjectLanding;
use App\Domain\Tenancy\Models\Tenant;
use App\Models\User;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;
use Tests\TestCase;

final class ProjectLandingTest extends TestCase
{
    use DatabaseTransactions;

    protected function setUp(): void
    {
        parent::setUp();

        config()->set([
            'filesystems.disks.r2.driver' => 's3',
            'filesystems.disks.r2.key' => 'test-key',
            'filesystems.disks.r2.secret' => 'test-secret',
            'filesystems.disks.r2.region' => 'auto',
            'filesystems.disks.r2.endpoint' => 'https://example-account.r2.cloudflarestorage.com',
            'filesystems.disks.r2.bucket' => 'bellomo-assets',
            'filesystems.disks.r2.url' => 'https://pub-6e84e10f99f7480da92cffa0fbe4b8b3.r2.dev',
            'filesystems.disks.r2.use_path_style_endpoint' => true,
        ]);
    }

    private function identity(string $role = 'TENANT_ADMIN'): Tenant
    {
        $tenant = Tenant::factory()->create();
        $this->actingAs(User::factory()->for($tenant)->create(['role_code' => RoleCode::from($role)->value]));
        $this->withHeaders(['X-Everprop-Tenant' => $tenant->public_id, 'Origin' => 'http://localhost:3000']);

        return $tenant;
    }

    private function project(Tenant $tenant): object
    {
        $id = DB::table('projects')->insertGetId([
            'tenant_id' => $tenant->id, 'public_id' => (string) Str::uuid(), 'name' => 'Inventory name',
            'project_type' => 'BUILDING', 'status' => 'PRE_SALE', 'total_units' => 0, 'city' => 'Jujuy', 'province' => 'Jujuy',
        ]);

        return DB::table('projects')->find($id);
    }

    private function endpoint(object $project): string
    {
        return '/api/v1/admin/projects/'.$project->public_id.'/landing';
    }

    /** @return array<string, mixed> */
    private function payload(): array
    {
        return [
            'slug' => 'proyecto-prueba', 'is_visible' => true, 'is_featured' => false,
            'name' => 'Nombre editorial', 'summary' => 'Resumen público', 'description' => "Texto\nplano",
            'category' => 'HUASI', 'location' => ['city' => 'Jujuy', 'province' => 'Jujuy', 'address' => null],
            'status_label' => null, 'sort_order' => 10, 'featured_order' => 0,
            'cover' => null, 'logo' => null, 'gallery' => [], 'features' => [], 'documents' => [],
        ];
    }

    public function test_defaults_publication_snapshot_and_hide_are_separate_from_inventory(): void
    {
        $tenant = $this->identity();
        $project = $this->project($tenant);
        $this->getJson($this->endpoint($project))->assertOk()->assertJsonPath('data.is_visible', false);
        $this->getJson('/api/v1/public/landing/projects')->assertExactJson(['schema_version' => '1.0', 'data' => []]);
        $this->putJson($this->endpoint($project), $this->payload())->assertOk();
        $snapshot = $this->getJson('/api/v1/public/landing/projects')->assertOk()->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.name', 'Nombre editorial')->assertJsonPath('data.0.sort_order', 10);
        $this->assertStringContainsString('no-store', $snapshot->headers->get('Cache-Control'));
        $this->assertArrayNotHasKey('is_visible', $snapshot->json('data.0'));
        $this->assertArrayNotHasKey('id', $snapshot->json('data.0'));
        $this->assertDatabaseHas('projects', ['id' => $project->id, 'name' => 'Inventory name']);

        $this->putJson($this->endpoint($project), array_replace($this->payload(), ['is_visible' => false, 'is_featured' => true]))
            ->assertOk()->assertJsonPath('data.is_featured', false);
        $this->getJson('/api/v1/public/landing/projects')->assertJsonCount(0, 'data');
        $this->getJson('/api/v1/public/projects/'.$project->public_id)->assertNotFound();
        $this->getJson('/api/v1/public/projects')->assertJsonMissing(['public_id' => $project->public_id]);
    }

    public function test_invalid_publication_is_atomic_and_urls_remain_fixed_after_hiding(): void
    {
        $tenant = $this->identity();
        $project = $this->project($tenant);
        $this->putJson($this->endpoint($project), array_replace($this->payload(), ['is_visible' => '1', 'name' => '']))
            ->assertUnprocessable()->assertJsonValidationErrors('is_visible');
        $this->putJson($this->endpoint($project), array_replace($this->payload(), ['summary' => '', 'is_featured' => true]))
            ->assertUnprocessable()->assertJsonValidationErrors(['summary', 'cover']);
        $this->assertDatabaseMissing('project_landing', ['project_id' => $project->id]);
        $this->putJson($this->endpoint($project), $this->payload())->assertOk();
        $this->putJson($this->endpoint($project), array_replace($this->payload(), ['slug' => 'otra-url', 'is_visible' => false]))
            ->assertUnprocessable()->assertJsonValidationErrors('slug');
        $this->getJson('/api/v1/public/landing/projects')->assertJsonPath('data.0.slug', 'proyecto-prueba');
        $duplicate = $this->project($tenant);
        $this->putJson($this->endpoint($duplicate), $this->payload())->assertUnprocessable()->assertJsonValidationErrors('slug');
    }

    public function test_assets_must_belong_to_the_project_and_output_preserves_types(): void
    {
        $tenant = $this->identity();
        $project = $this->project($tenant);
        $url = ProjectLanding::ASSET_PREFIX.'approved/cover.jpg';
        $image = ['url' => $url, 'alt' => 'Fachada', 'kind' => 'RENDER'];
        $payload = array_replace($this->payload(), ['cover' => $image, 'is_featured' => true, 'featured_order' => '12']);
        $this->putJson($this->endpoint($project), $payload)->assertUnprocessable()->assertJsonValidationErrors('cover.url');
        DB::table('project_landing_assets')->insert(['tenant_id' => $tenant->id, 'project_id' => $project->id, 'url' => $url, 'mime_type' => 'image/jpeg', 'title' => 'Portada']);
        $this->putJson($this->endpoint($project), $payload)->assertOk()->assertJsonPath('data.featured_order', 12);
        $this->getJson('/api/v1/public/landing/projects')->assertJsonPath('data.0.is_featured', true)->assertJsonPath('data.0.cover.alt', 'Fachada');
        foreach (['../private.jpg', 'approved/%2e%2e/private.jpg', 'cover.jpg?token=secret', 'cover.jpg#x', 'file name.jpg'] as $path) {
            $this->assertFalse(ProjectLanding::validAssetUrl(ProjectLanding::ASSET_PREFIX.$path));
        }
        $this->assertTrue(ProjectLanding::validAssetUrl(ProjectLanding::ASSET_PREFIX.'H7%20-%20ALTO/cover.jpg'));
        $otherProject = $this->project($tenant);
        $payload['slug'] = 'otro';
        $this->putJson($this->endpoint($otherProject), $payload)->assertUnprocessable()->assertJsonValidationErrors('cover.url');
    }

    public function test_cross_tenant_access_is_denied(): void
    {
        $this->identity();
        $other = $this->project(Tenant::factory()->create());
        $this->getJson($this->endpoint($other))->assertNotFound();
        $this->putJson($this->endpoint($other), $this->payload())->assertNotFound();
    }

    public function test_read_only_writes_are_denied(): void
    {
        $tenant = $this->identity('READ_ONLY');
        $project = $this->project($tenant);
        $this->putJson($this->endpoint($project), $this->payload())->assertForbidden();
    }

    public function test_null_is_allowed_but_empty_image_objects_are_not(): void
    {
        $tenant = $this->identity();
        $project = $this->project($tenant);
        foreach (['cover', 'logo'] as $field) {
            $this->putJson($this->endpoint($project), array_replace($this->payload(), [$field => []]))
                ->assertUnprocessable()->assertJsonValidationErrors($field);
        }
    }

    public function test_landing_channel_never_exposes_unconfigured_projects(): void
    {
        $tenant = $this->identity();
        $project = $this->project($tenant);
        $this->getJson('/api/v1/public/projects?channel=landing')->assertJsonMissing(['public_id' => $project->public_id]);
        $this->getJson('/api/v1/public/projects/'.$project->public_id.'?channel=landing')->assertNotFound();
        $this->getJson('/api/v1/public/projects/'.$project->public_id)->assertOk();
    }

    public function test_snapshot_is_ordered_and_a_tenant_cannot_read_another_snapshot(): void
    {
        $tenant = $this->identity();
        $one = $this->project($tenant);
        $two = $this->project($tenant);
        $this->putJson($this->endpoint($one), $this->payload())->assertOk();
        $this->putJson($this->endpoint($two), array_replace($this->payload(), ['slug' => 'primero', 'sort_order' => 0]))->assertOk();
        $this->getJson('/api/v1/public/landing/projects?per_page=1')->assertJsonCount(2, 'data')->assertJsonPath('data.0.public_id', $two->public_id);
        $otherTenant = Tenant::factory()->create();
        $this->withHeaders(['X-Everprop-Tenant' => $otherTenant->public_id])->getJson('/api/v1/public/landing/projects')->assertNotFound()->assertJsonMissingPath('data');
    }

    public function test_anonymous_visitors_can_read_but_cannot_write(): void
    {
        $tenant = Tenant::factory()->create();
        $project = $this->project($tenant);
        $this->withHeaders(['X-Everprop-Tenant' => $tenant->public_id])->getJson('/api/v1/public/landing/projects')
            ->assertOk()->assertExactJson(['schema_version' => '1.0', 'data' => []]);
        $this->putJson($this->endpoint($project), $this->payload())->assertUnauthorized();
        $this->flushHeaders();
        $this->getJson('/api/v1/public/landing/projects')->assertNotFound();
    }

    public function test_snapshot_matches_the_shared_landing_fixture(): void
    {
        $fixture = json_decode(file_get_contents(base_path('tests/Fixtures/landing-v1.json')), true, flags: JSON_THROW_ON_ERROR);
        $expected = $fixture['data'][0];
        $tenant = $this->identity();
        $project = $this->project($tenant);
        DB::table('projects')->where('id', $project->id)->update(['public_id' => $expected['public_id']]);
        $project->public_id = $expected['public_id'];
        DB::table('project_landing_assets')->insert([
            'tenant_id' => $tenant->id, 'project_id' => $project->id, 'url' => $expected['cover']['url'],
            'mime_type' => 'image/jpeg', 'title' => 'Fixture portada',
        ]);
        $payload = $expected;
        unset($payload['public_id'], $payload['updated_at']);
        $payload['is_visible'] = true;
        $this->putJson($this->endpoint($project), $payload)->assertOk();
        $actual = $this->getJson('/api/v1/public/landing/projects')->assertOk()->json('data.0');
        $this->assertNotNull($actual['updated_at']);
        unset($actual['updated_at'], $expected['updated_at']);
        $this->assertEquals($expected, $actual);
    }

    public function test_snapshot_rejects_over_limit_without_sending_a_partial_catalog(): void
    {
        $tenant = $this->identity();
        $projects = [];
        for ($i = 0; $i < 1001; $i++) {
            $projects[] = ['tenant_id' => $tenant->id, 'public_id' => (string) Str::uuid(), 'name' => 'Limit test',
                'project_type' => 'BUILDING', 'status' => 'PRE_SALE', 'total_units' => 0, 'city' => 'Jujuy', 'province' => 'Jujuy'];
        }
        foreach (array_chunk($projects, 250) as $chunk) {
            DB::table('projects')->insert($chunk);
        }
        $landing = DB::table('projects')->where('tenant_id', $tenant->id)->pluck('id')->map(fn ($id) => [
            'tenant_id' => $tenant->id, 'project_id' => $id, 'slug' => 'limit-'.$id, 'is_visible' => true, 'content' => '{}',
        ])->all();
        foreach (array_chunk($landing, 250) as $chunk) {
            DB::table('project_landing')->insert($chunk);
        }
        $this->getJson('/api/v1/public/landing/projects')->assertStatus(503)->assertJsonMissingPath('data');
    }

    public function test_hiding_also_removes_units_from_public_api_and_bellomito(): void
    {
        $tenant = $this->identity();
        $project = $this->project($tenant);
        $publicId = (string) Str::uuid();
        DB::table('properties')->insert(['tenant_id' => $tenant->id, 'project_id' => $project->id, 'public_id' => $publicId,
            'title' => 'Unidad', 'operation' => 'SALE', 'category' => 'APARTMENT', 'status' => 'AVAILABLE', 'city' => 'Jujuy', 'province' => 'Jujuy']);
        $this->putJson($this->endpoint($project), array_replace($this->payload(), ['is_visible' => false]))->assertOk();
        $this->getJson('/api/v1/public/properties/'.$publicId)->assertNotFound();
        $this->getJson('/api/v1/public/properties')->assertJsonMissing(['public_id' => $publicId]);
        $this->assertNull(app(PublicInventory::class)->find($tenant->id, $publicId));
    }

    public function test_editor_without_publish_cannot_withdraw_an_unconfigured_public_project(): void
    {
        $tenant = $this->identity('SALES_ADVISOR');
        $project = $this->project($tenant);
        DB::table('user_inventory_settings')->insert([
            'tenant_id' => $tenant->id, 'user_id' => auth()->id(), 'workspace_mode' => 'BOTH',
            'visibility_mode' => 'ALL', 'can_manage_inventory' => true, 'can_manage_prices' => false, 'can_view_prices' => true,
        ]);
        $this->putJson($this->endpoint($project), array_replace($this->payload(), ['is_visible' => false]))->assertForbidden();
        $this->assertDatabaseMissing('project_landing', ['project_id' => $project->id]);
    }

    public function test_asset_manifest_is_repeatable_and_rolls_back_cross_tenant_entries(): void
    {
        $tenant = $this->identity();
        $project = $this->project($tenant);
        $other = $this->project(Tenant::factory()->create());
        $path = tempnam(sys_get_temp_dir(), 'evp55-assets-');
        $asset = ['project_public_id' => $project->public_id, 'url' => ProjectLanding::ASSET_PREFIX.'approved/cover.jpg', 'mime_type' => 'image/jpeg', 'title' => 'Portada'];
        try {
            file_put_contents($path, json_encode(['tenant_public_id' => $tenant->public_id, 'assets' => [$asset]], JSON_THROW_ON_ERROR));
            foreach ([1, 2] as $_) {
                $this->artisan('everprop:landing-assets', ['manifest' => $path])->assertSuccessful();
            }
            $this->assertSame(1, DB::table('project_landing_assets')->where('tenant_id', $tenant->id)->count());
            $asset['url'] = ProjectLanding::ASSET_PREFIX.'approved/new.jpg';
            $foreign = array_replace($asset, ['project_public_id' => $other->public_id]);
            file_put_contents($path, json_encode(['tenant_public_id' => $tenant->public_id, 'assets' => [$asset, $foreign]], JSON_THROW_ON_ERROR));
            try {
                $this->artisan('everprop:landing-assets', ['manifest' => $path])->run();
                $this->fail('A foreign project must reject the entire manifest.');
            } catch (ValidationException) {
                $this->assertSame(1, DB::table('project_landing_assets')->where('tenant_id', $tenant->id)->count());
            }
        } finally {
            unlink($path);
        }
    }

    public function test_upload_contract_issues_presigned_ticket_with_isolated_paths(): void
    {
        $tenant = $this->identity();
        $project = $this->project($tenant);

        // Success for image/jpeg
        $res = $this->postJson($this->endpoint($project).'/media/upload-url', [
            'filename' => 'fachada principal.jpg',
            'mime_type' => 'image/jpeg',
            'file_size' => 2 * 1024 * 1024,
        ])->assertCreated();

        $ticket = $res->json('data');
        $this->assertNotEmpty($ticket['upload_url']);
        $this->assertStringStartsWith(ProjectLanding::ASSET_PREFIX, $ticket['public_url']);
        $this->assertStringStartsWith('assets/tenants/'.$tenant->public_id.'/projects/'.$project->public_id.'/', $ticket['key']);
        $this->assertStringEndsWith('.jpg', $ticket['key']);
        $this->assertSame(900, $ticket['expires_in_seconds']);

        // Success for PDF document
        $pdfRes = $this->postJson($this->endpoint($project).'/media/upload-url', [
            'filename' => 'memoria_descriptiva.pdf',
            'mime_type' => 'application/pdf',
            'file_size' => 1024 * 1024,
        ])->assertCreated();
        $this->assertStringEndsWith('.pdf', $pdfRes->json('data.key'));

        // Reject invalid mime type (e.g. video or unapproved media)
        $this->postJson($this->endpoint($project).'/media/upload-url', [
            'filename' => 'video.mp4',
            'mime_type' => 'video/mp4',
            'file_size' => 1024,
        ])->assertUnprocessable()->assertJsonValidationErrors('mime_type');

        // Reject file size over limit (16 MB)
        $this->postJson($this->endpoint($project).'/media/upload-url', [
            'filename' => 'heavy.jpg',
            'mime_type' => 'image/jpeg',
            'file_size' => 16 * 1024 * 1024,
        ])->assertUnprocessable()->assertJsonValidationErrors('file_size');

        // Cross-tenant access is rejected
        $other = $this->project(Tenant::factory()->create());
        $this->postJson($this->endpoint($other).'/media/upload-url', [
            'filename' => 'other.jpg',
            'mime_type' => 'image/jpeg',
            'file_size' => 1024,
        ])->assertNotFound();
    }

    public function test_upload_confirm_validates_r2_domain_scoping_and_persists_assets(): void
    {
        $tenant = $this->identity();
        $project = $this->project($tenant);

        // Upload ticket to obtain standard scoped url
        $ticketRes = $this->postJson($this->endpoint($project).'/media/upload-url', [
            'filename' => 'plano.pdf',
            'mime_type' => 'application/pdf',
            'file_size' => 500000,
        ])->assertCreated();
        $publicUrl = $ticketRes->json('data.public_url');

        // Confirm success
        $this->postJson($this->endpoint($project).'/media/confirm', [
            'url' => $publicUrl,
            'mime_type' => 'application/pdf',
            'title' => 'Plano General',
        ])->assertCreated()->assertJsonPath('data.title', 'Plano General');

        $this->assertDatabaseHas('project_landing_assets', [
            'tenant_id' => $tenant->id,
            'project_id' => $project->id,
            'url' => $publicUrl,
            'mime_type' => 'application/pdf',
            'title' => 'Plano General',
        ]);

        // List assets endpoint
        $listRes = $this->getJson($this->endpoint($project).'/media')->assertOk();
        $this->assertCount(1, $listRes->json('data'));
        $this->assertSame('Plano General', $listRes->json('data.0.title'));

        // Reject HTML in title
        $this->postJson($this->endpoint($project).'/media/confirm', [
            'url' => $publicUrl,
            'mime_type' => 'application/pdf',
            'title' => '<script>alert(1)</script>Plano',
        ])->assertUnprocessable()->assertJsonValidationErrors('title');

        // Reject foreign project asset URL
        $otherTenant = Tenant::factory()->create();
        $foreignUrl = ProjectLanding::ASSET_PREFIX.'tenants/'.$otherTenant->public_id.'/projects/'.(string) Str::uuid().'/file.jpg';
        $this->postJson($this->endpoint($project).'/media/confirm', [
            'url' => $foreignUrl,
            'mime_type' => 'image/jpeg',
            'title' => 'Foto sospechosa',
        ])->assertUnprocessable()->assertJsonValidationErrors('url');

        // Reject external non-R2 URL
        $this->postJson($this->endpoint($project).'/media/confirm', [
            'url' => 'https://malicious.site/phishing.jpg',
            'mime_type' => 'image/jpeg',
            'title' => 'Foto externa',
        ])->assertUnprocessable()->assertJsonValidationErrors('url');
    }

    public function test_delete_asset_safeguards_active_landing_usage(): void
    {
        $tenant = $this->identity();
        $project = $this->project($tenant);

        $url = ProjectLanding::ASSET_PREFIX.'tenants/'.$tenant->public_id.'/projects/'.$project->public_id.'/foto.jpg';
        DB::table('project_landing_assets')->insert([
            'tenant_id' => $tenant->id,
            'project_id' => $project->id,
            'url' => $url,
            'mime_type' => 'image/jpeg',
            'title' => 'Foto de prueba',
        ]);

        // Put asset into landing presentation (as cover)
        $payload = array_replace($this->payload(), [
            'cover' => ['url' => $url, 'alt' => 'Portada', 'kind' => 'PHOTO'],
        ]);
        $this->putJson($this->endpoint($project), $payload)->assertOk();

        // Trying to delete while in use in landing is rejected
        $this->deleteJson($this->endpoint($project).'/media', ['url' => $url])
            ->assertUnprocessable()->assertJsonValidationErrors('url');
        $this->assertDatabaseHas('project_landing_assets', ['url' => $url]);

        // Unlink from cover
        $this->putJson($this->endpoint($project), array_replace($this->payload(), ['cover' => null]))->assertOk();

        // Deleting unused asset succeeds
        $this->deleteJson($this->endpoint($project).'/media', ['url' => $url])
            ->assertOk()->assertJsonPath('deleted', true);
        $this->assertDatabaseMissing('project_landing_assets', ['url' => $url]);
    }
}
