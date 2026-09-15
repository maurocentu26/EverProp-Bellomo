<?php

namespace App\Console\Commands;

use App\Domain\Inventory\Services\InventorySourceImport;
use Illuminate\Console\Command;
use Illuminate\Database\QueryException;
use RuntimeException;
use Throwable;

final class ImportInventorySource extends Command
{
    protected $signature = 'everprop:inventory-import
        {mode : plan, rehearse, apply or verify}
        {--source= : Private JSON produced by extract-inventory-workbook.py}
        {--tenant= : Exact existing tenant slug, required for plan}
        {--currency=preserve : preserve, unset, ARS or USD; never inferred}
        {--cleanup= : Optional private JSON with reviewed project/property UUIDs}
        {--replace-metadata : Clear non-source media and commercial metadata on matched inventory}
        {--plan= : Private plan JSON path; new output for plan mode}
        {--plan-sha256= : Reviewed plan file SHA-256, required for rehearse/apply}
        {--backup= : Private before-image JSON path; new output for plan mode}';

    protected $description = 'Plan, rehearse, apply or verify a tenant-specific workbook import without automatic deletions';

    public function handle(InventorySourceImport $importer): int
    {
        try {
            $mode = (string) $this->argument('mode');
            if (! in_array($mode, ['plan', 'rehearse', 'apply', 'verify'], true)) {
                throw new RuntimeException('Mode must be plan, rehearse, apply or verify');
            }
            $source = $this->read((string) $this->option('source'));
            $planPath = (string) $this->option('plan');
            if ($mode === 'plan') {
                $slug = (string) $this->option('tenant');
                if ($slug === '') {
                    throw new RuntimeException('An explicit tenant slug is required');
                }
                $cleanup = $this->option('cleanup') ? $this->read((string) $this->option('cleanup')) : [];
                $plan = $importer->plan($source, $slug, (string) $this->option('currency'), $cleanup, (bool) $this->option('replace-metadata'));
                $rows = $importer->snapshot($plan['target']['tenant_id']);
                if ($importer->hash($rows) !== $plan['snapshot_hash']) {
                    throw new RuntimeException('Database changed during planning; retry');
                }
                $backup = ['target' => $plan['target'], 'rows' => $rows];
                $this->writeNew((string) $this->option('backup'), $importer->json($backup));
                $this->writeNew($planPath, $importer->json($plan));
                $this->line($importer->json(['target' => $plan['target'], 'counts' => $plan['counts'], 'issues' => $plan['issues'], 'currency_policy' => $plan['currency'], 'plan_sha256' => hash_file('sha256', $planPath)]));

                return self::SUCCESS;
            }
            $plan = $this->read($planPath);
            if ($importer->target($plan['target']['tenant_slug']) !== $plan['target'] || $importer->hash($source) !== $plan['source_hash']) {
                throw new RuntimeException('Plan target or source mismatch');
            }
            if ($mode === 'verify') {
                $importer->verify($source, $plan);
                $this->line('Imported inventory and catalog values match the plan.');

                return self::SUCCESS;
            }
            $approvedHash = (string) $this->option('plan-sha256');
            if (! preg_match('/^[a-f0-9]{64}$/i', $approvedHash) || ! hash_equals(strtolower($approvedHash), hash_file('sha256', $planPath))) {
                throw new RuntimeException('Supply the exact reviewed plan SHA-256');
            }
            $result = $importer->apply($source, $plan, $this->read((string) $this->option('backup')), $mode === 'rehearse');
            $this->line($importer->json($result));

            return self::SUCCESS;
        } catch (Throwable $e) {
            report($e);
            $this->error($e instanceof QueryException ? 'Database rejected the operation; data changes were rolled back. Check the private application log and referenced records.' : $e->getMessage());

            return self::FAILURE;
        }
    }

    /** @return array<string, mixed> */
    private function read(string $path): array
    {
        if (! is_file($path) || ! is_readable($path) || filesize($path) > 100 * 1024 * 1024) {
            throw new RuntimeException('A readable private JSON file (under 100 MB) is required');
        }
        $value = json_decode(file_get_contents($path), true, flags: JSON_THROW_ON_ERROR);
        if (! is_array($value)) {
            throw new RuntimeException('Expected a JSON object');
        }

        return $value;
    }

    private function writeNew(string $path, string $contents): void
    {
        if ($path === '' || ! is_dir(dirname($path))) {
            throw new RuntimeException('Choose a file in an existing private directory');
        }
        $handle = fopen($path, 'x');
        if ($handle === false) {
            throw new RuntimeException('Refusing to overwrite an existing plan or backup');
        }
        try {
            chmod($path, 0600);
            if (fwrite($handle, $contents) !== strlen($contents)) {
                throw new RuntimeException('Could not finish writing the private file');
            }
        } finally {
            fclose($handle);
        }
    }
}
