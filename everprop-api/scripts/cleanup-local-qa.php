<?php

// Maintenance for the five documented local QA leads, not a product feature.
require __DIR__.'/../vendor/autoload.php';
$app = require __DIR__.'/../bootstrap/app.php';
$app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();

use Illuminate\Support\Facades\DB;

if (!app()->environment('local')) {
    fwrite(STDERR, "This maintenance operation is restricted to APP_ENV=local.\n");
    exit(1);
}
$mode = $argv[1] ?? '--preview';
if (!in_array($mode, ['--preview', '--apply', '--restore', '--check-restore'], true)) exit(1);
$manifest = [
    'b0aa57bf-bf17-46e5-8c41-9b2f8f4c33f4' => 'semaforo.vencido@example.invalid',
    'a8b13168-7b92-4d5b-8aad-3888f914eab1' => 'semaforo.hoy@example.invalid',
    '8fe033d6-d1d6-4cea-b830-32a22e48a4b1' => 'semaforo.aldia@example.invalid',
    'a5bd6038-2a62-4372-bdc8-cfee5733d521' => 'semaforo.nuevo@example.invalid',
    'ab1ed1fa-b81e-4d29-b584-7b9b347b2068' => 'qa.recorrido@example.invalid',
];
$backupPath = storage_path('app/qa-leads-2026-09-14-backup.json');
try {
    DB::transaction(function () use ($manifest, $mode, $backupPath) {
        $rows = DB::table('leads as l')->join('contacts as c', function ($join) {
            $join->on('c.id', '=', 'l.contact_id')->on('c.tenant_id', '=', 'l.tenant_id');
        })->where('l.tenant_id', 1)->whereIn('l.public_id', array_keys($manifest))
            ->lockForUpdate()->get(['l.id', 'l.public_id', 'l.tenant_id', 'l.deleted_at', 'l.updated_at', 'c.email']);
        if ($rows->count() !== count($manifest)) throw new RuntimeException('Manifest mismatch; no changes applied.');
        foreach ($rows as $row) {
            if ($manifest[$row->public_id] !== $row->email) throw new RuntimeException('Identity mismatch; no changes applied.');
        }
        if ($mode === '--preview') {
            echo json_encode($rows->map(fn ($row) => ['id' => $row->public_id, 'active' => $row->deleted_at === null]), JSON_PRETTY_PRINT)."\n";
            return;
        }
        if ($mode === '--apply') {
            if ($rows->contains(fn ($row) => $row->deleted_at !== null)) throw new RuntimeException('Already retired or modified; inspect before retrying.');
            $backup = ['database' => DB::connection()->getDatabaseName(), 'marker' => now()->format('Y-m-d H:i:s.v'), 'rows' => $rows];
            $file = @fopen($backupPath, 'x');
            if (!$file) throw new RuntimeException('Backup already exists or cannot be created; no changes applied.');
            $json = json_encode($backup, JSON_PRETTY_PRINT | JSON_THROW_ON_ERROR);
            $written = fwrite($file, $json);
            fflush($file);
            fclose($file);
            if ($written !== strlen($json)) throw new RuntimeException('Incomplete backup; no changes applied.');
            @chmod($backupPath, 0600);
            foreach ($rows as $row) {
                DB::table('leads')->where('tenant_id', $row->tenant_id)->where('id', $row->id)
                    ->whereNull('deleted_at')->update(['deleted_at' => $backup['marker'], 'updated_at' => $row->updated_at]);
            }
            echo "Retired 5 local QA leads reversibly. Backup: storage/app/qa-leads-2026-09-14-backup.json\n";
        } else {
            $backup = json_decode(file_get_contents($backupPath), true, 512, JSON_THROW_ON_ERROR);
            if ($backup['database'] !== DB::connection()->getDatabaseName() || count($backup['rows']) !== 5) throw new RuntimeException('Backup mismatch.');
            foreach ($backup['rows'] as $saved) {
                $current = $rows->firstWhere('public_id', $saved['public_id']);
                if (!$current || $current->id !== $saved['id'] || $current->tenant_id !== $saved['tenant_id']
                    || $current->deleted_at !== $backup['marker'] || $current->updated_at !== $saved['updated_at']) {
                    throw new RuntimeException('Record changed after cleanup; restore aborted.');
                }
            }
            if ($mode === '--check-restore') {
                echo "Backup and 5 retired records match; restore is available.\n";
                return;
            }
            foreach ($backup['rows'] as $saved) {
                DB::table('leads')->where('tenant_id', $saved['tenant_id'])->where('id', $saved['id'])
                    ->update(['deleted_at' => $saved['deleted_at'], 'updated_at' => $saved['updated_at']]);
            }
            echo "Restored 5 local QA leads. Backup retained.\n";
        }
    });
} catch (Throwable $exception) {
    fwrite(STDERR, $exception->getMessage()."\n");
    exit(1);
}
