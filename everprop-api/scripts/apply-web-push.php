<?php

use Illuminate\Contracts\Console\Kernel;
use Illuminate\Support\Facades\DB;

require __DIR__.'/../vendor/autoload.php';
$app = require __DIR__.'/../bootstrap/app.php';
$app->make(Kernel::class)->bootstrap();
DB::unprepared(file_get_contents(__DIR__.'/../database/schema/forward/2026-09-14.002_web_push.sql'));
echo "Web push schema ready\n";
