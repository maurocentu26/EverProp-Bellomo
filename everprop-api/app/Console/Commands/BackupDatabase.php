<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;
use Illuminate\Support\Facades\Storage;
use Symfony\Component\Process\Process;

/** EVP-92: daily logical dump of the app database to the off-platform `backups` disk (its own R2 bucket and keys). */
final class BackupDatabase extends Command
{
    protected $signature = 'everprop:backup:database';

    protected $description = 'Dump the MySQL database (routines, triggers, events), gzip it and upload it with its sha256 to the backups disk.';

    public function handle(): int
    {
        if (blank(config('filesystems.disks.backups.bucket')) && config('filesystems.disks.backups.driver') === 's3') {
            $this->error('BACKUP_BUCKET is not configured; nothing was dumped.');

            return self::FAILURE;
        }

        $db = config('database.connections.'.config('database.default'));
        $file = tempnam(sys_get_temp_dir(), 'evp-backup-');

        try {
            // ponytail: the dump buffers to a temp file on local disk; fine for a few GB, stream to the bucket beyond that.
            $dump = new Process(
                ['bash', '-c', 'set -o pipefail; mysqldump --host="$DB_HOST" --port="$DB_PORT" --user="$DB_USER" --single-transaction --quick --routines --triggers --events --no-tablespaces "$DB_NAME" | gzip -9 > "$OUT"'],
                null,
                ['DB_HOST' => $db['host'], 'DB_PORT' => (string) $db['port'], 'DB_USER' => $db['username'], 'MYSQL_PWD' => $db['password'], 'DB_NAME' => $db['database'], 'OUT' => $file],
                null,
                3600,
            );
            $dump->run();

            if (! $dump->isSuccessful() || filesize($file) === 0) {
                // stderr only: mysqldump never prints the password, which travels in MYSQL_PWD.
                $this->error('mysqldump failed: '.trim($dump->getErrorOutput()));

                return self::FAILURE;
            }

            $hash = hash_file('sha256', $file);
            $name = sprintf('mysql/%s/%s-%s.sql.gz', now('UTC')->format('Y/m/d'), $db['database'], now('UTC')->format('Ymd\THis\Z'));
            $disk = Storage::disk('backups');
            $stream = fopen($file, 'rb');
            $disk->writeStream($name, $stream);
            is_resource($stream) && fclose($stream);
            $disk->put($name.'.sha256', $hash.'  '.basename($name)."\n");

            $this->info(sprintf('Backup %s (%d bytes, sha256 %s).', $name, filesize($file), $hash));

            return self::SUCCESS;
        } finally {
            @unlink($file);
        }
    }
}
