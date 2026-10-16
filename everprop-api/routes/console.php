<?php

use Illuminate\Foundation\Inspiring;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Schedule;

// Every ACTIVE tenant; no tenant is hardcoded in the scheduler (S02).
Schedule::command('everprop:collections:notify')
    ->hourly()->withoutOverlapping();

// EVP-31: upcoming-installment emails. Hourly; the command itself waits for the tenant's local hour and notifies
// each installment once, so a missed run is caught up by the next one.
Schedule::command('everprop:collections:notify-upcoming')->hourly()->withoutOverlapping();

Schedule::command('everprop:conversations:reconcile')->everyMinute()->withoutOverlapping();

Artisan::command('inspire', function () {
    $this->comment(Inspiring::quote());
})->purpose('Display an inspiring quote');
