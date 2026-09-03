<?php

namespace Tests\Feature\Inventory;

use App\Domain\Tenancy\Models\Tenant;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Tests\TestCase;

final class PublicInventoryTest extends TestCase
{
    use DatabaseTransactions;

    public function test_public_catalog_hides_drafts_unavailable_inventory_and_other_tenants(): void
    {
        $tenantA = Tenant::factory()->create();
        $tenantB = Tenant::factory()->create();
        $publicProject = $this->project($tenantA->id, 'PRE_SALE', 'Visible project');
        $draftProject = $this->project($tenantA->id, 'PLANNING', 'Draft project');
        $otherProject = $this->project($tenantB->id, 'PRE_SALE', 'Other tenant project');
        $visibleProperty = $this->property($tenantA->id, $publicProject['id'], 'AVAILABLE', 'Visible property');
        $reservedProperty = $this->property($tenantA->id, $publicProject['id'], 'RESERVED', 'Reserved property');
        $draftProperty = $this->property($tenantA->id, $draftProject['id'], 'AVAILABLE', 'Draft property');
        $otherProperty = $this->property($tenantB->id, $otherProject['id'], 'AVAILABLE', 'Other property');
        $headers = $this->tenantHeaders($tenantA);

        $this->withHeaders($headers)
            ->getJson('/api/v1/public/projects?per_page=1&sort=name&direction=asc')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonFragment(['public_id' => $publicProject['public_id']])
            ->assertJsonMissing(['public_id' => $draftProject['public_id']])
            ->assertJsonMissing(['public_id' => $otherProject['public_id']]);

        $this->withHeaders($headers)
            ->getJson('/api/v1/public/properties?category=HOUSE&per_page=10')
            ->assertOk()
            ->assertJsonFragment(['public_id' => $visibleProperty['public_id']])
            ->assertJsonMissing(['public_id' => $reservedProperty['public_id']])
            ->assertJsonMissing(['public_id' => $draftProperty['public_id']])
            ->assertJsonMissing(['public_id' => $otherProperty['public_id']]);

        $this->withHeaders($headers)
            ->getJson('/api/v1/public/properties/'.$reservedProperty['public_id'])
            ->assertNotFound();
    }

    /** @return array{id: int, public_id: string} */
    private function project(int $tenantId, string $status, string $name): array
    {
        $publicId = (string) Str::uuid();
        $id = (int) DB::table('projects')->insertGetId([
            'tenant_id' => $tenantId,
            'public_id' => $publicId,
            'name' => $name,
            'project_type' => 'BUILDING',
            'status' => $status,
            'progress' => 0,
            'total_units' => 1,
            'city' => 'Salta',
            'province' => 'Salta',
        ]);

        return ['id' => $id, 'public_id' => $publicId];
    }

    /** @return array{id: int, public_id: string} */
    private function property(int $tenantId, int $projectId, string $status, string $title): array
    {
        $publicId = (string) Str::uuid();
        $id = (int) DB::table('properties')->insertGetId([
            'tenant_id' => $tenantId,
            'project_id' => $projectId,
            'public_id' => $publicId,
            'title' => $title,
            'operation' => 'SALE',
            'category' => 'HOUSE',
            'status' => $status,
            'price' => '100000.00',
            'currency_code' => 'USD',
            'city' => 'Salta',
            'province' => 'Salta',
        ]);

        return ['id' => $id, 'public_id' => $publicId];
    }

    /** @return array<string, string> */
    private function tenantHeaders(Tenant $tenant): array
    {
        return [
            'X-Everprop-Tenant' => $tenant->public_id,
            'Origin' => 'http://localhost:3000',
        ];
    }
}
