<?php

namespace Tests\Feature\Inventory;

use App\Domain\AgentRuntime\Tools\PublicInventory;
use App\Domain\Identity\Enums\RoleCode;
use App\Domain\Tenancy\Models\Tenant;
use App\Models\User;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Tests\TestCase;

final class ProjectIntakeTest extends TestCase
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
        foreach (app('router')->getRoutes()->getRoutes() as $route) {
            $route->flushController();
        }
        $tenant = Tenant::factory()->create();
        $this->actingAs(User::factory()->for($tenant)->create(['role_code' => RoleCode::from($role)->value]));
        $this->withHeaders(['X-Everprop-Tenant' => $tenant->public_id, 'Origin' => 'http://localhost:3000']);

        return $tenant;
    }

    /** @return array<string, string> */
    private function payload(): array
    {
        return ['request_key' => (string) Str::uuid(), 'name' => 'Nuevo edificio', 'code' => 'NUEVO',
            'project_type' => 'BUILDING', 'city' => 'Jujuy', 'province' => 'Jujuy'];
    }

    public function test_creation_is_hidden_and_unknown_until_explicit_publication(): void
    {
        $tenant = $this->identity();
        $response = $this->postJson('/api/v1/admin/project-intakes', $this->payload() + ['progress' => null])->assertCreated()
            ->assertJsonPath('data.project.status', 'UNKNOWN')->assertJsonPath('data.project.progress', null)
            ->assertJsonPath('data.project.properties_count', 0)->assertJsonPath('data.landing.is_visible', false)
            ->assertJsonPath('data.can_edit', true)->assertJsonPath('data.can_publish', true);
        $uuid = $response->json('data.project.public_id');
        $this->getJson('/api/v1/admin/project-intakes/'.$uuid)->assertOk()->assertJsonPath('data.project.public_id', $uuid);
        $this->getJson('/api/v1/admin/project-intakes')->assertOk()->assertJsonCount(1, 'data')
            ->assertJsonPath('can_create', true)->assertJsonPath('data.0.is_visible', false);
        $this->getJson('/api/v1/public/landing/projects')->assertJsonCount(0, 'data');
        $this->getJson('/api/v1/public/projects/'.$uuid)->assertNotFound();
        // Even an explicitly commercial status and available unit do not publish a guided intake before Step 5.
        $this->patchJson('/api/v1/admin/projects/'.$uuid, ['status' => 'PRE_SALE', 'progress' => 12])->assertOk();
        $this->patchJson('/api/v1/admin/projects/'.$uuid, ['progress' => null])->assertOk()->assertJsonPath('data.progress', null);
        $propertyUuid = $this->postJson('/api/v1/admin/project-intakes/'.$uuid.'/units', [
            'request_key' => (string) Str::uuid(), 'title' => 'Unidad oculta', 'operation' => 'SALE',
            'category' => 'APARTMENT', 'status' => 'AVAILABLE', 'city' => 'Jujuy', 'province' => 'Jujuy',
        ])->assertCreated()->json('data.public_id');
        $this->getJson('/api/v1/public/projects/'.$uuid)->assertNotFound();
        $this->getJson('/api/v1/public/properties/'.$propertyUuid)->assertNotFound();
        $this->assertNull(app(PublicInventory::class)->find($tenant->id, $propertyUuid));

        $ticket = $this->postJson('/api/v1/admin/projects/'.$uuid.'/landing/media/upload-url', [
            'filename' => 'brochure.pdf', 'mime_type' => 'application/pdf', 'file_size' => 32,
        ])->assertCreated()->json('data');
        Storage::fake('r2')->put('pending/'.$ticket['key'], "%PDF-1.4\n".str_repeat(' ', 23));
        $asset = $this->postJson('/api/v1/admin/projects/'.$uuid.'/landing/media/confirm', [
            'upload_token' => $ticket['upload_token'], 'url' => $ticket['public_url'],
            'mime_type' => 'application/pdf', 'title' => 'Brochure comercial',
        ])->assertCreated()->json('data');

        $landing = $this->getJson('/api/v1/admin/projects/'.$uuid.'/landing')->json('data');
        unset($landing['public_id'], $landing['updated_at']);
        $landing['slug'] = 'nuevo-edificio';
        $landing['summary'] = 'Presentación pública';
        $landing['documents'] = [['title' => $asset['title'], 'url' => $asset['url']]];
        $this->putJson('/api/v1/admin/projects/'.$uuid.'/landing', $landing)->assertOk()
            ->assertJsonPath('data.is_visible', false);
        $this->getJson('/api/v1/public/landing/projects')->assertJsonCount(0, 'data');
        $this->assertNull(app(PublicInventory::class)->find($tenant->id, $propertyUuid));

        $landing['is_visible'] = true;
        $this->putJson('/api/v1/admin/projects/'.$uuid.'/landing', $landing)->assertOk()
            ->assertJsonPath('data.is_visible', true);
        $this->getJson('/api/v1/public/landing/projects')->assertJsonPath('data.0.public_id', $uuid)
            ->assertJsonPath('data.0.documents.0.url', $asset['url']);
        $this->getJson('/api/v1/public/properties/'.$propertyUuid)->assertOk();
        $this->assertNotNull(app(PublicInventory::class)->find($tenant->id, $propertyUuid));
    }

    public function test_creation_retries_are_durable_and_conflicting_payloads_return_conflict(): void
    {
        $tenant = $this->identity();
        $payload = $this->payload();
        $id = $this->postJson('/api/v1/admin/project-intakes', $payload)->assertCreated()->json('data.project.public_id');
        $this->postJson('/api/v1/admin/project-intakes', array_reverse($payload, true))->assertOk()
            ->assertJsonPath('data.project.public_id', $id);
        $this->postJson('/api/v1/admin/project-intakes', array_replace($payload, ['name' => 'Otro nombre']))->assertConflict();
        $this->assertSame(1, DB::table('projects')->where('tenant_id', $tenant->id)->count());
        $this->assertSame(1, DB::table('project_intakes')->where('tenant_id', $tenant->id)->count());
        $other = $this->identity();
        $this->postJson('/api/v1/admin/project-intakes', $payload)->assertCreated();
        $this->assertSame(1, DB::table('project_intakes')->where('tenant_id', $other->id)->count());
    }

    public function test_invalid_inputs_roll_back_and_the_same_key_can_be_corrected(): void
    {
        $tenant = $this->identity();
        $payload = $this->payload();
        $this->postJson('/api/v1/admin/project-intakes', array_replace($payload, ['name' => '', 'tenant_id' => $tenant->id]))
            ->assertUnprocessable()->assertJsonValidationErrors(['name', 'tenant_id']);
        $this->assertSame(0, DB::table('project_intakes')->where('tenant_id', $tenant->id)->count());
        $this->assertSame(0, DB::table('project_landing')->where('tenant_id', $tenant->id)->count());
        $this->postJson('/api/v1/admin/project-intakes', $payload)->assertCreated();
    }

    public function test_other_tenants_and_roles_cannot_create_or_resume_private_intakes(): void
    {
        $tenant = $this->identity();
        $uuid = $this->postJson('/api/v1/admin/project-intakes', $this->payload())->assertCreated()->json('data.project.public_id');
        $this->identity();
        $this->getJson('/api/v1/admin/project-intakes/'.$uuid)->assertNotFound();
        $this->getJson('/api/v1/admin/project-intakes')->assertJsonCount(0, 'data');
        $viewer = User::factory()->for($tenant)->create(['role_code' => RoleCode::READ_ONLY->value]);
        DB::table('user_inventory_settings')->insert(['tenant_id' => $tenant->id, 'user_id' => $viewer->id,
            'visibility_mode' => 'ALL', 'can_manage_inventory' => false, 'can_manage_prices' => false]);
        foreach (app('router')->getRoutes()->getRoutes() as $route) {
            $route->flushController();
        }
        $this->actingAs($viewer)->withHeaders(['X-Everprop-Tenant' => $tenant->public_id]);
        $this->getJson('/api/v1/admin/project-intakes')->assertOk()->assertJsonPath('can_create', false);
        $this->getJson('/api/v1/admin/project-intakes/'.$uuid)->assertOk()->assertJsonPath('data.can_edit', false);
        $this->postJson('/api/v1/admin/project-intakes', $this->payload())->assertForbidden();
        $this->identity('ROTATOR');
        $this->getJson('/api/v1/admin/project-intakes')->assertForbidden();
        $this->postJson('/api/v1/admin/project-intakes', $this->payload())->assertForbidden();
    }

    public function test_manual_unit_creation_replays_without_duplicates_after_edits_and_rejects_conflicts(): void
    {
        $tenant = $this->identity();
        $project = $this->postJson('/api/v1/admin/project-intakes', $this->payload())->assertCreated()->json('data.project');
        $endpoint = '/api/v1/admin/project-intakes/'.$project['public_id'].'/units';
        $payload = ['request_key' => (string) Str::uuid(), 'title' => 'Departamento 1A', 'operation' => 'SALE',
            'category' => 'APARTMENT', 'city' => 'Jujuy', 'province' => 'Jujuy', 'unit_number' => '1A'];
        $unit = $this->postJson($endpoint, $payload)->assertCreated()->assertJsonPath('data.status', 'UNKNOWN')->json('data');
        DB::table('properties')->where('tenant_id', $tenant->id)->where('id', $unit['id'])->update(['title' => 'Nombre actualizado']);
        $this->postJson($endpoint, $payload)->assertOk()->assertJsonPath('data.public_id', $unit['public_id'])
            ->assertJsonPath('data.title', 'Nombre actualizado');
        $this->postJson($endpoint, array_replace($payload, ['unit_number' => '1B']))->assertConflict();
        $this->assertSame(1, DB::table('properties')->where('tenant_id', $tenant->id)->count());
        $this->assertSame(1, DB::table('project_intake_units')->where('tenant_id', $tenant->id)->count());
        $this->assertNull(app(PublicInventory::class)->find($tenant->id, $unit['public_id']));
        $this->postJson($endpoint, array_replace($payload, ['request_key' => (string) Str::uuid(), 'price' => '100']))
            ->assertUnprocessable()->assertJsonValidationErrors('price');
        $this->postJson($endpoint, array_replace($payload, ['request_key' => (string) Str::uuid(), 'project_id' => $project['id']]))
            ->assertUnprocessable()->assertJsonValidationErrors('project_id');
        $this->identity();
        $this->postJson($endpoint, $payload)->assertNotFound();
    }

    public function test_retries_recheck_current_creation_and_project_permissions(): void
    {
        $tenant = $this->identity();
        $payload = $this->payload();
        $project = $this->postJson('/api/v1/admin/project-intakes', $payload)->assertCreated()->json('data.project');
        $endpoint = '/api/v1/admin/project-intakes/'.$project['public_id'].'/units';
        $unitPayload = ['request_key' => (string) Str::uuid(), 'title' => 'Unidad', 'operation' => 'SALE',
            'category' => 'APARTMENT', 'city' => 'Jujuy', 'province' => 'Jujuy'];
        $this->postJson($endpoint, $unitPayload)->assertCreated();
        $user = User::query()->findOrFail(auth()->id());
        $user->role_code = RoleCode::READ_ONLY->value;
        $user->save();
        $this->actingAs($user);
        $this->postJson('/api/v1/admin/project-intakes', $payload)->assertForbidden();
        $this->postJson($endpoint, $unitPayload)->assertForbidden();

        $user->role_code = RoleCode::TENANT_ADMIN->value;
        $user->save();
        DB::table('user_inventory_settings')->insert(['tenant_id' => $tenant->id, 'user_id' => $user->id,
            'visibility_mode' => 'SCOPED', 'can_manage_inventory' => true, 'can_manage_prices' => false]);
        // Each real FPM request constructs its own policy and inventory settings cache.
        foreach (app('router')->getRoutes()->getRoutes() as $route) {
            $route->flushController();
        }
        $this->actingAs($user);
        $this->postJson('/api/v1/admin/project-intakes', $payload)->assertForbidden();
        $this->postJson($endpoint, $unitPayload)->assertForbidden();
        $this->assertSame(1, DB::table('projects')->where('tenant_id', $tenant->id)->count());
        $this->assertSame(1, DB::table('properties')->where('tenant_id', $tenant->id)->count());
    }
}
