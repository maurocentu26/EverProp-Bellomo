<?php

use Illuminate\Contracts\Console\Kernel;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

require __DIR__.'/../vendor/autoload.php';
$app = require __DIR__.'/../bootstrap/app.php';
$app->make(Kernel::class)->bootstrap();
$columns = ['follow_up_id', 'guest_name', 'guest_phone', 'guest_email'];
$existing = array_filter($columns, fn ($column) => Schema::hasColumn('visits', $column));
if (count($existing) > 0 && count($existing) < count($columns)) {
    fwrite(STDERR, "Incomplete visit extension: review the schema before retrying; no changes applied.\n");
    exit(1);
}
if (count($existing) === 0) {
    DB::unprepared(file_get_contents(__DIR__.'/../database/schema/forward/2026-09-14.001_visit_follow_up_origin.sql'));
}
echo "Visit extension ready\n";
