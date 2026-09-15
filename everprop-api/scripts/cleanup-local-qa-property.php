<?php
// Reversible maintenance of the documented QA property only.
require __DIR__.'/../vendor/autoload.php';
$app = require __DIR__.'/../bootstrap/app.php';
$app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();
use Illuminate\Support\Facades\DB;
if (!app()->environment('local')) exit(1);
$mode = $argv[1] ?? '--preview';
if (!in_array($mode, ['--preview', '--apply', '--restore'], true)) exit(1);
try {
    DB::transaction(function () use ($mode) {
        $property = DB::table('properties')->where('tenant_id', 1)
            ->where('public_id', '69023e32-9369-4d19-8527-1b65a78d6eb7')->lockForUpdate()->first();
        if (!$property || $property->title !== 'PRUEBA QA · Casa de validación 14-09'
            || $property->description !== 'Registro ficticio de QA local. No comercializar.') throw new RuntimeException('QA identity mismatch.');
        $path = storage_path('app/qa-property-2026-09-14-backup.json');
        if ($mode === '--preview') {
            echo $property->deleted_at === null ? "QA property active.\n" : "QA property retired.\n";
            return;
        }
        if ($mode === '--apply') {
            if ($property->deleted_at !== null) throw new RuntimeException('Already retired.');
            $linked = DB::table('lead_properties as lp')->join('leads as l', 'l.id', '=', 'lp.lead_id')
                ->where('lp.property_id', $property->id)->whereNull('l.deleted_at')->exists();
            if ($linked) throw new RuntimeException('Active lead references this property; aborting.');
            $backup = ['database' => DB::connection()->getDatabaseName(), 'marker' => now()->format('Y-m-d H:i:s.v'), 'row' => $property];
            $file = @fopen($path, 'x');
            if (!$file) throw new RuntimeException('Backup exists or is unavailable.');
            $json = json_encode($backup, JSON_PRETTY_PRINT | JSON_THROW_ON_ERROR);
            $written = fwrite($file, $json); fflush($file); fclose($file);
            if ($written !== strlen($json)) throw new RuntimeException('Incomplete backup.');
            @chmod($path, 0600);
            DB::table('properties')->where('tenant_id', 1)->where('id', $property->id)
                ->update(['deleted_at' => $backup['marker'], 'updated_at' => $property->updated_at]);
            echo "QA property retired reversibly; backup saved in storage/app.\n";
        } else {
            $backup = json_decode(file_get_contents($path), true, 512, JSON_THROW_ON_ERROR);
            if ($backup['database'] !== DB::connection()->getDatabaseName() || $backup['row']['id'] !== $property->id
                || $backup['row']['tenant_id'] !== $property->tenant_id || $property->deleted_at !== $backup['marker']
                || $property->updated_at !== $backup['row']['updated_at']) throw new RuntimeException('Record changed; restore aborted.');
            DB::table('properties')->where('tenant_id', 1)->where('id', $property->id)
                ->update(['deleted_at' => $backup['row']['deleted_at'], 'updated_at' => $backup['row']['updated_at']]);
            echo "QA property restored. Backup retained.\n";
        }
    });
} catch (Throwable $exception) {
    fwrite(STDERR, $exception->getMessage()."\n"); exit(1);
}
