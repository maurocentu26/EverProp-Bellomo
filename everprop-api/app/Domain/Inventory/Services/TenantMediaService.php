<?php

namespace App\Domain\Inventory\Services;

use App\Domain\Inventory\Enums\PropertyMediaType;
use App\Domain\Inventory\Exceptions\InvalidMedia;
use App\Domain\Inventory\Models\Property;
use App\Domain\Inventory\Models\PropertyMedia;
use App\Domain\Tenancy\TenantContext;
use Illuminate\Filesystem\FilesystemAdapter;
use Illuminate\Filesystem\FilesystemManager;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Str;
use Throwable;

final class TenantMediaService
{
    private const MAX_BYTES = 15 * 1024 * 1024;

    /** @var array<string, string> */
    private const EXTENSIONS_BY_MIME = [
        'image/jpeg' => 'jpg',
        'image/png' => 'png',
        'image/webp' => 'webp',
        'image/avif' => 'avif',
        'application/pdf' => 'pdf',
        'video/mp4' => 'mp4',
        'video/webm' => 'webm',
    ];

    /** @var array<string, list<string>> */
    private const MIMES_BY_TYPE = [
        'IMAGE' => ['image/jpeg', 'image/png', 'image/webp', 'image/avif'],
        'FLOORPLAN' => ['image/jpeg', 'image/png', 'image/webp', 'image/avif', 'application/pdf'],
        'DOCUMENT' => ['application/pdf'],
        'VIDEO' => ['video/mp4', 'video/webm'],
        'VIRTUAL_TOUR' => [],
    ];

    public function __construct(
        private readonly FilesystemManager $filesystems,
        private readonly TenantContext $tenantContext,
    ) {}

    /**
     * @return array{url: string, metadata_json: array{disk: string, path: string, mime: string, size: int, visibility: string, sha256: string}}
     */
    public function store(Property $property, UploadedFile $file, PropertyMediaType $type): array
    {
        $this->assertPropertyTenant($property);

        if (! $file->isValid()) {
            throw new InvalidMedia('The uploaded file is not valid.');
        }

        $size = $file->getSize();
        $mime = $file->getMimeType();

        if (! is_int($size) || $size < 1 || $size > self::MAX_BYTES) {
            throw new InvalidMedia('The uploaded file size is not allowed.');
        }

        if (! is_string($mime) || ! in_array($mime, self::MIMES_BY_TYPE[$type->value], true)) {
            throw new InvalidMedia('The uploaded file MIME type does not match its media type.');
        }

        $contents = $file->getContent();
        $path = sprintf(
            'tenants/%d/properties/%d/%s.%s',
            $this->tenantContext->id(),
            $property->getKey(),
            Str::uuid()->toString(),
            self::EXTENSIONS_BY_MIME[$mime],
        );
        $disk = $this->diskName();

        if (! $this->disk($disk)->put($path, $contents, ['visibility' => 'private'])) {
            throw new InvalidMedia('The media could not be stored.');
        }

        return [
            'url' => $path,
            'metadata_json' => [
                'disk' => $disk,
                'path' => $path,
                'mime' => $mime,
                'size' => $size,
                'visibility' => 'private',
                'sha256' => hash('sha256', $contents),
            ],
        ];
    }

    public function temporaryUrl(PropertyMedia $media, int $minutes = 5): ?string
    {
        if ($this->isExternalUrl($media->url)) {
            return $media->url;
        }

        $path = $this->storedPath($media);

        if ($path === null) {
            return null;
        }

        $this->assertSafePath($media, $path);

        try {
            return $this->disk($this->storedDisk($media))->temporaryUrl($path, now()->addMinutes($minutes));
        } catch (Throwable) {
            return null;
        }
    }

    public function delete(PropertyMedia $media): void
    {
        if ($this->isExternalUrl($media->url)) {
            return;
        }

        $path = $this->storedPath($media);

        if ($path === null) {
            return;
        }

        $this->assertSafePath($media, $path);
        $this->disk($this->storedDisk($media))->delete($path);
    }

    private function assertPropertyTenant(Property $property): void
    {
        if ((int) $property->tenant_id !== $this->tenantContext->id() || ! $property->exists) {
            throw new InvalidMedia('The property is not available in the active tenant.');
        }
    }

    private function assertSafePath(PropertyMedia $media, string $path): void
    {
        $expectedPrefix = sprintf('tenants/%d/properties/%d/', $media->tenant_id, $media->property_id);

        if (! str_starts_with($path, $expectedPrefix)
            || str_contains($path, '..')
            || str_contains($path, '\\')
            || str_contains($path, "\0")) {
            throw new InvalidMedia('The stored media path is invalid.');
        }
    }

    private function storedPath(PropertyMedia $media): ?string
    {
        $metadata = $media->getAttribute('metadata_json');
        $path = is_array($metadata) ? ($metadata['path'] ?? $media->url) : $media->url;

        return is_string($path) && $path !== '' ? $path : null;
    }

    private function storedDisk(PropertyMedia $media): string
    {
        $metadata = $media->getAttribute('metadata_json');
        $disk = is_array($metadata) ? ($metadata['disk'] ?? $this->diskName()) : $this->diskName();

        return is_string($disk) && $disk !== '' ? $disk : $this->diskName();
    }

    private function diskName(): string
    {
        return (string) config('filesystems.private', 'local');
    }

    private function disk(string $name): FilesystemAdapter
    {
        $disk = $this->filesystems->disk($name);

        if (! $disk instanceof FilesystemAdapter) {
            throw new InvalidMedia('The configured media disk is not supported.');
        }

        return $disk;
    }

    private function isExternalUrl(?string $url): bool
    {
        return is_string($url) && preg_match('/^https:\/\//i', $url) === 1;
    }
}
