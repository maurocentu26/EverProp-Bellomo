<?php

namespace App\Domain\Conversations\Services;

use Illuminate\Filesystem\FilesystemAdapter;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Symfony\Component\HttpFoundation\StreamedResponse;

/**
 * Photos and PDFs an advisor sends in a conversation (Fase 4). Private disk, path per tenant and
 * conversation, named by content hash (a retried upload overwrites itself instead of leaving copies).
 * Files are only ever read back through authorized endpoints: no public or long-lived URL exists.
 */
final class ConversationAttachments
{
    public const MAX_BYTES = 10 * 1024 * 1024;

    /** Content type is sniffed from the bytes (finfo), never taken from the client. */
    private const KINDS = [
        'image/jpeg' => ['IMAGE', 'jpg'], 'image/png' => ['IMAGE', 'png'], 'image/webp' => ['IMAGE', 'webp'],
        'application/pdf' => ['DOCUMENT', 'pdf'],
    ];

    /**
     * @return array{kind: string, disk: string, path: string, mime: string, size: int, sha256: string, name: string}|null null = type not allowed
     */
    public function store(int $tenantId, int $conversationId, UploadedFile $file): ?array
    {
        $size = $file->getSize();
        if (! $file->isValid() || ! is_int($size) || $size < 1 || $size > self::MAX_BYTES) {
            return null;
        }

        return $this->storeBytes($tenantId, $conversationId, $file->getContent(), $file->getClientOriginalName());
    }

    /**
     * Same rules for bytes from anywhere (an upload, or a file the client sent by WhatsApp).
     *
     * @return array{kind: string, disk: string, path: string, mime: string, size: int, sha256: string, name: string}|null
     */
    public function storeBytes(int $tenantId, int $conversationId, string $contents, string $originalName): ?array
    {
        $size = strlen($contents);
        if ($size < 1 || $size > self::MAX_BYTES) {
            return null;
        }
        $mime = (new \finfo(FILEINFO_MIME_TYPE))->buffer($contents);
        if (! is_string($mime) || ! isset(self::KINDS[$mime])) {
            return null;
        }
        [$kind, $extension] = self::KINDS[$mime];
        $sha = hash('sha256', $contents);
        $path = sprintf('tenants/%d/conversations/%d/%s.%s', $tenantId, $conversationId, $sha, $extension);
        $disk = (string) config('filesystems.private', 'local');
        if (! $this->disk($disk)->put($path, $contents, ['visibility' => 'private'])) {
            return null;
        }
        // Display name only: control characters and path separators removed, bounded, and always the detected
        // extension (a PDF never downloads as .html; a name without ASCII still has a valid header fallback).
        $base = pathinfo((string) preg_replace('/[\x00-\x1F\x7F\/\\\\]+/u', ' ', $originalName), PATHINFO_FILENAME);
        $base = mb_substr(trim($base), 0, 100);

        return ['kind' => $kind, 'disk' => $disk, 'path' => $path, 'mime' => $mime, 'size' => $size, 'sha256' => $sha,
            'name' => ($base !== '' ? $base : ($kind === 'IMAGE' ? 'foto' : 'documento')).'.'.$extension];
    }

    /**
     * Removes a stored file no message of the tenant uses (a send that failed after the upload).
     *
     * @param  array<string, mixed>  $media
     */
    public function discardIfUnused(int $tenantId, array $media): void
    {
        $used = DB::table('messages')->where('tenant_id', $tenantId)
            ->whereRaw("JSON_UNQUOTE(JSON_EXTRACT(media_json, '$.path')) = ?", [$media['path']])->exists();
        if (! $used) {
            $this->disk((string) config('filesystems.private', 'local'))->delete((string) $media['path']);
        }
    }

    /**
     * Bytes of a stored attachment, same path checks as stream() (for uploading it to a provider).
     *
     * @param  array<string, mixed>  $media
     */
    public function contents(int $tenantId, int $conversationId, array $media): string
    {
        $path = (string) ($media['path'] ?? '');
        if (! str_starts_with($path, sprintf('tenants/%d/conversations/%d/', $tenantId, $conversationId)) || str_contains($path, '..')) {
            throw new \RuntimeException('Attachment path outside its conversation.');
        }

        return (string) $this->disk((string) config('filesystems.private', 'local'))->get($path);
    }

    /** @param array<string, mixed> $media media_json of a message of this tenant and conversation */
    public function stream(int $tenantId, int $conversationId, array $media): StreamedResponse
    {
        $path = (string) ($media['path'] ?? '');
        $prefix = sprintf('tenants/%d/conversations/%d/', $tenantId, $conversationId);
        abort_unless(str_starts_with($path, $prefix) && ! str_contains($path, '..') && isset(self::KINDS[$media['mime'] ?? '']), 404);
        // Only the configured private disk: the stored value is never trusted to pick another one.
        $disk = $this->disk((string) config('filesystems.private', 'local'));
        abort_unless($disk->exists($path), 404);

        return $disk->response($path, (string) ($media['name'] ?? 'archivo'), [
            'Content-Type' => (string) $media['mime'],
            'X-Content-Type-Options' => 'nosniff',
            // Rendered on its own, a file can run nothing and reach nothing.
            'Content-Security-Policy' => "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox",
            'Cache-Control' => 'no-store',
        ], $media['kind'] === 'IMAGE' ? 'inline' : 'attachment');
    }

    /**
     * What the inbox and the widget show; the URL is an authorized endpoint, never the storage path.
     *
     * @return array{kind: string, name: string, mime: string, size: int, url: string}|null
     */
    public static function present(?string $mediaJson, string $url): ?array
    {
        $media = json_decode((string) $mediaJson, true);
        if (! is_array($media) || ! isset($media['kind'], $media['mime'])) {
            return null;
        }

        return ['kind' => (string) $media['kind'], 'name' => (string) ($media['name'] ?? ''), 'mime' => (string) $media['mime'],
            'size' => (int) ($media['size'] ?? 0), 'url' => $url];
    }

    private function disk(string $name): FilesystemAdapter
    {
        return Storage::disk($name);
    }
}
