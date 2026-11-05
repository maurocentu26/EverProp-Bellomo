<?php

namespace Tests\Feature;

use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

/** EVP-92: the dump is real (mysqldump against the test MySQL), restorable and carries its own checksum. */
final class BackupDatabaseTest extends TestCase
{
    public function test_dump_with_routines_is_uploaded_with_matching_sha256(): void
    {
        config(['filesystems.disks.backups.bucket' => 'evp92-test']);
        $disk = Storage::fake('backups');

        $this->artisan('everprop:backup:database')->assertSuccessful();

        $dumps = array_values(array_filter($disk->allFiles('mysql'), fn ($f) => str_ends_with($f, '.sql.gz')));
        $this->assertCount(1, $dumps);
        $bytes = $disk->get($dumps[0]);
        $this->assertSame(hash('sha256', $bytes), strtok($disk->get($dumps[0].'.sha256'), ' '));

        $sql = gzdecode($bytes);
        $this->assertStringContainsString('CREATE TABLE `users`', $sql);
        $this->assertMatchesRegularExpression('/CREATE\b.*\bPROCEDURE/', $sql, 'stored procedures must be in the dump');
        $password = (string) config('database.connections.mysql.password');
        $password === '' || $this->assertStringNotContainsString($password, $sql);
    }

    public function test_refuses_without_a_configured_bucket(): void
    {
        config(['filesystems.disks.backups.bucket' => null]);

        $this->artisan('everprop:backup:database')->assertFailed();
    }
}
