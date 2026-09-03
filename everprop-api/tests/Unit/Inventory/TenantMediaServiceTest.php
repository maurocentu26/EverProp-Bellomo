<?php

namespace Tests\Unit\Inventory;

use App\Domain\Inventory\Enums\PropertyMediaType;
use App\Domain\Inventory\Exceptions\InvalidMedia;
use App\Domain\Inventory\Models\Property;
use App\Domain\Inventory\Models\PropertyMedia;
use App\Domain\Inventory\Services\TenantMediaService;
use App\Domain\Tenancy\Models\Tenant;
use App\Domain\Tenancy\TenantContext;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

final class TenantMediaServiceTest extends TestCase
{
    private TenantMediaService $service;

    protected function setUp(): void
    {
        parent::setUp();

        $tenant = new Tenant;
        $tenant->forceFill(['id' => 7]);
        $tenant->exists = true;
        $this->app->instance(TenantContext::class, TenantContext::forTenant($tenant));
        config()->set('filesystems.default', 'local');
        Storage::fake('local');
        $this->service = $this->app->make(TenantMediaService::class);
    }

    public function test_it_stores_a_private_file_under_a_tenant_safe_random_path(): void
    {
        $file = UploadedFile::fake()->createWithContent('unsafe name.png', $this->onePixelPng());

        $stored = $this->service->store($this->property(11, 7), $file, PropertyMediaType::IMAGE);

        self::assertMatchesRegularExpression(
            '#^tenants/7/properties/11/[0-9a-f-]{36}\.png$#',
            $stored['url'],
        );
        self::assertSame('private', $stored['metadata_json']['visibility']);
        self::assertSame('image/png', $stored['metadata_json']['mime']);
        self::assertSame(hash('sha256', $this->onePixelPng()), $stored['metadata_json']['sha256']);
        Storage::disk('local')->assertExists($stored['url']);
    }

    public function test_it_rejects_a_file_whose_real_mime_does_not_match_the_media_type(): void
    {
        $file = UploadedFile::fake()->create('pretend.jpg', 5, 'application/pdf');

        $this->expectException(InvalidMedia::class);
        $this->service->store($this->property(11, 7), $file, PropertyMediaType::IMAGE);
    }

    public function test_it_rejects_cross_tenant_properties(): void
    {
        $file = UploadedFile::fake()->createWithContent('image.png', $this->onePixelPng());

        $this->expectException(InvalidMedia::class);
        $this->service->store($this->property(11, 8), $file, PropertyMediaType::IMAGE);
    }

    public function test_it_rejects_path_traversal_before_deletion(): void
    {
        $media = new PropertyMedia;
        $media->forceFill([
            'tenant_id' => 7,
            'property_id' => 11,
            'url' => 'tenants/7/properties/11/../../outside.pdf',
            'metadata_json' => [
                'disk' => 'local',
                'path' => 'tenants/7/properties/11/../../outside.pdf',
            ],
        ]);

        $this->expectException(InvalidMedia::class);
        $this->service->delete($media);
    }

    private function property(int $id, int $tenantId): Property
    {
        $property = new Property;
        $property->forceFill(['id' => $id, 'tenant_id' => $tenantId]);
        $property->exists = true;

        return $property;
    }

    private function onePixelPng(): string
    {
        return (string) base64_decode(
            'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl2nJwAAAAASUVORK5CYII=',
            true,
        );
    }
}
