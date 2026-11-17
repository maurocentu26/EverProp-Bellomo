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

// EVP-148: the outbox has no consumer yet (ADR D20); keep it bounded.
Schedule::command('everprop:outbox:prune')->dailyAt('04:30')->withoutOverlapping()->onOneServer();

Artisan::command('inspire', function () {
    $this->comment(Inspiring::quote());
})->purpose('Display an inspiring quote');

// EVP-128: renew Instagram tokens before they expire and alert integration admins when one is about to. Daily at
// 09:00 UTC (06:00 in Argentina), so a failed renewal is visible during the working day.
Schedule::command('everprop:integrations:refresh-tokens')->dailyAt('09:00')->withoutOverlapping()->onOneServer();

// EVP-50: follow-up alerts and advisor nudges; claims are atomic, onOneServer keeps replicas from racing.
Schedule::command('everprop:leads:follow-up-alerts')->hourly()->withoutOverlapping()->onOneServer();
