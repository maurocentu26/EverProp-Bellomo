<?php

use Illuminate\Contracts\Console\Kernel;
use Illuminate\Support\Facades\DB;

require __DIR__.'/../vendor/autoload.php';
$app = require __DIR__.'/../bootstrap/app.php';
$app->make(Kernel::class)->bootstrap();
if (! $app->environment('testing') || ! str_ends_with(DB::connection()->getDatabaseName(), '_test')
    || DB::connection()->getDriverName() !== 'mysql') {
    throw new RuntimeException('Only the isolated MySQL test database is eligible.');
}
DB::unprepared(file_get_contents(__DIR__.'/../database/schema/forward/2026-10-07.001_collection_email_attempts.sql'));
echo "Collection email audit schema ready in test database only.\n";
