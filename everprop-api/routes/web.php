<?php

use App\Domain\Shared\Http\Controllers\HealthController;
use App\Domain\Shared\Http\Controllers\ReadinessController;
use Illuminate\Support\Facades\Route;

Route::get('/healthz', HealthController::class)->name('health');
Route::get('/readyz', ReadinessController::class)->name('readiness');

Route::get('/setup-simulation-database', function () {
    \Illuminate\Support\Facades\Artisan::call('db:setup-simulation');
    return response()->json([
        'status' => 'ok',
        'message' => 'Base de datos de simulación configurada con éxito en Bellomo CRM',
        'output' => \Illuminate\Support\Facades\Artisan::output(),
    ]);
});

Route::get('/api/setup-simulation-database', function () {
    \Illuminate\Support\Facades\Artisan::call('db:setup-simulation');
    return response()->json([
        'status' => 'ok',
        'message' => 'Base de datos de simulación configurada con éxito en Bellomo CRM',
        'output' => \Illuminate\Support\Facades\Artisan::output(),
    ]);
});
