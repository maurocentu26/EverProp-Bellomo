<?php

use Illuminate\Foundation\Inspiring;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Schedule;

// Every ACTIVE tenant; no tenant is hardcoded in the scheduler (S02).
Schedule::command('everprop:collections:notify')
    ->hourly()->withoutOverlapping();

Schedule::command('everprop:conversations:reconcile')->everyMinute()->withoutOverlapping();

Artisan::command('inspire', function () {
    $this->comment(Inspiring::quote());
})->purpose('Display an inspiring quote');
