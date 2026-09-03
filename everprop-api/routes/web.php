<?php

use App\Domain\Shared\Http\Controllers\HealthController;
use App\Domain\Shared\Http\Controllers\ReadinessController;
use Illuminate\Support\Facades\Route;

Route::get('/healthz', HealthController::class)->name('health');
Route::get('/readyz', ReadinessController::class)->name('readiness');
