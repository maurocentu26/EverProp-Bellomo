<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;
use Illuminate\Database\QueryException;
use Illuminate\Support\Facades\DB;
use RuntimeException;
use Throwable;

final class InventorySourceSchema extends Command
{
    protected $signature = 'everprop:inventory-source-schema
        {phase=prepare : prepare or relations (relations follows the data import)}
        {--apply : Apply the reviewed forward SQL; otherwise only show its identity}
        {--database= : Exact target database name}
        {--backup= : Verified full database backup file on the operator filesystem}
        {--backup-sha256= : SHA-256 of that full database backup}';

    protected $description = 'Inspect or explicitly apply rerunnable inventory source schema extensions';

    public function handle(): int
    {
        try {
            $phase = (string) $this->argument('phase');
            $file = match ($phase) {
                'prepare' => '2026-09-15.001_real_inventory_source.sql',
                'relations' => '2026-09-15.002_real_inventory_relations.sql',
                default => throw new RuntimeException('Choose prepare or relations'),
            };
            $path = database_path('schema/forward/'.$file);
            if (DB::connection()->getDriverName() !== 'mysql') {
                throw new RuntimeException('MySQL is required');
            }
            $this->line('Database: '.DB::connection()->getDatabaseName().'; migration: '.$file.'; SHA-256: '.hash_file('sha256', $path));
            if (! $this->option('apply')) {
                return self::SUCCESS;
            }
            $backup = (string) $this->option('backup');
            if ($this->option('database') !== DB::connection()->getDatabaseName()
                || ! is_file($backup) || filesize($backup) === 0
                || ! hash_equals(hash_file('sha256', $backup), strtolower((string) $this->option('backup-sha256')))) {
                throw new RuntimeException('Exact database name and verified full backup are required; no schema changed');
            }
            DB::unprepared(file_get_contents($path));
            $version = $phase === 'prepare' ? '2026-09-15.001' : '2026-09-15.002';
            if (! DB::table('schema_versions')->where('version', $version)->exists()) {
                throw new RuntimeException('Relationships are pending: import the catalogs and resolve pre-existing unmatched legacy references first');
            }
            $this->info('Schema phase completed.');

            return self::SUCCESS;
        } catch (Throwable $e) {
            report($e);
            $this->error($e instanceof QueryException ? 'Schema operation failed. MySQL DDL may have partially applied; consult the private log and rerun the idempotent phase after correcting the cause.' : $e->getMessage());

            return self::FAILURE;
        }
    }
}
