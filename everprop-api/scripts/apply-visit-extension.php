<?php
require __DIR__.'/../vendor/autoload.php';
$app = require __DIR__.'/../bootstrap/app.php';
$app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();
if (!Illuminate\Support\Facades\Schema::hasColumn('visits', 'follow_up_id')) {
    Illuminate\Support\Facades\DB::unprepared(file_get_contents(__DIR__.'/../database/schema/forward/2026-09-14.001_visit_follow_up_origin.sql'));
}
echo "Visit extension ready\n";
