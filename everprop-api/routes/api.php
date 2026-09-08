<?php

use App\Domain\CRM\Http\Controllers\AdminLeadController;
use App\Domain\CRM\Http\Controllers\AdminLeadFollowUpController;
use App\Domain\CRM\Http\Controllers\PublicLeadController;
use App\Domain\Identity\Http\Controllers\AdminNotificationController;
use App\Domain\Identity\Http\Controllers\AuthController;
use App\Domain\Integrations\Http\Controllers\ReceiveWebhookController;
use App\Domain\Inventory\Http\Controllers\AdminProjectController;
use App\Domain\Inventory\Http\Controllers\AdminPropertyController;
use App\Domain\Inventory\Http\Controllers\AdminPropertyFeatureController;
use App\Domain\Inventory\Http\Controllers\AdminPropertyMediaController;
use App\Domain\Inventory\Http\Controllers\PublicProjectController;
use App\Domain\Inventory\Http\Controllers\PublicPropertyController;
use Illuminate\Support\Facades\Route;

Route::middleware(['tenant', 'throttle:login'])->group(function (): void {
    Route::post('/auth/login', [AuthController::class, 'login'])->name('auth.login');
});

Route::middleware(['tenant', 'auth:sanctum'])->group(function (): void {
    Route::get('/auth/me', [AuthController::class, 'me'])->name('auth.me');
    Route::post('/auth/logout', [AuthController::class, 'logout'])->name('auth.logout');

    Route::prefix('admin')->name('admin.')->group(function (): void {
        Route::apiResource('projects', AdminProjectController::class);
        Route::patch('/projects/{project}/publish', [AdminProjectController::class, 'publish'])
            ->name('projects.publish');

        Route::post('/properties/batch-generate', [AdminPropertyController::class, 'batchGenerate'])
            ->name('properties.batch-generate');
        Route::apiResource('properties', AdminPropertyController::class);
        Route::patch('/properties/{property}/publish', [AdminPropertyController::class, 'publish'])
            ->name('properties.publish');

        Route::apiResource('properties.features', AdminPropertyFeatureController::class)
            ->parameters(['features' => 'feature']);
        Route::apiResource('properties.media', AdminPropertyMediaController::class)
            ->parameters(['media' => 'media']);

        Route::apiResource('leads', AdminLeadController::class)->except(['destroy']);
        Route::post('/leads/{lead}/properties', [AdminLeadController::class, 'attachProperty'])->name('leads.properties.attach');
        Route::patch('/leads/{lead}/properties/{property}', [AdminLeadController::class, 'updateProperty'])->name('leads.properties.update');
        Route::delete('/leads/{lead}/properties/{property}', [AdminLeadController::class, 'detachProperty'])->name('leads.properties.detach');
        Route::get('/follow-ups', [AdminLeadFollowUpController::class, 'indexAll'])->name('follow-ups.index-all');
        Route::get('/leads/{lead}/follow-ups', [AdminLeadFollowUpController::class, 'index'])->name('leads.follow-ups.index');
        Route::post('/leads/{lead}/follow-ups', [AdminLeadFollowUpController::class, 'store'])->name('leads.follow-ups.store');

        Route::get('/notifications', [AdminNotificationController::class, 'index'])->name('notifications.index');
        Route::get('/notifications/count', [AdminNotificationController::class, 'count'])->name('notifications.count');
        Route::post('/notifications/mark-all-read', [AdminNotificationController::class, 'markAllAsRead'])->name('notifications.mark-all-read');
        Route::patch('/notifications/{id}/read', [AdminNotificationController::class, 'markAsRead'])->name('notifications.read');
        Route::delete('/notifications', [AdminNotificationController::class, 'destroyAll'])->name('notifications.destroy-all');
    });
});

Route::middleware('tenant')->group(function (): void {
    Route::get('/public/projects', [PublicProjectController::class, 'index'])->name('public.projects.index');
    Route::get('/public/projects/{project}', [PublicProjectController::class, 'show'])->name('public.projects.show');
    Route::get('/public/properties', [PublicPropertyController::class, 'index'])->name('public.properties.index');
    Route::get('/public/properties/{property}', [PublicPropertyController::class, 'show'])->name('public.properties.show');

    Route::post('/public/leads', PublicLeadController::class)
        ->middleware('throttle:public-leads')
        ->name('public.leads.store');

    Route::post('/webhooks/{integrationPublicId}', ReceiveWebhookController::class)
        ->whereUuid('integrationPublicId')
        ->middleware('throttle:webhooks')
        ->name('webhooks.receive');
});

Route::fallback(static fn () => response()->json([
    'message' => 'Endpoint not found.',
    'code' => 'NOT_FOUND',
], 404));
