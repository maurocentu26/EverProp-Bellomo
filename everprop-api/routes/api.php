<?php

use App\Domain\AgentRuntime\Knowledge\Http\AdminKnowledgeController;
use App\Domain\AgentRuntime\VisitRequests\AdminVisitRequestController;
use App\Domain\Collections\CollectionsController;
use App\Domain\Conversations\Http\Controllers\AdminConversationController;
use App\Domain\Conversations\Http\Controllers\MetaWhatsAppWebhookController;
use App\Domain\Conversations\Http\Controllers\PublicChatController;
use App\Domain\CRM\Http\Controllers\AdminLeadController;
use App\Domain\CRM\Http\Controllers\AdminLeadFollowUpController;
use App\Domain\CRM\Http\Controllers\AdminVisitController;
use App\Domain\CRM\Http\Controllers\PublicLeadController;
use App\Domain\Identity\Http\Controllers\AdminNotificationController;
use App\Domain\Identity\Http\Controllers\AdminUserController;
use App\Domain\Identity\Http\Controllers\AuthController;
use App\Domain\Identity\Http\Controllers\WebPushController;
use App\Domain\Identity\InventoryRoleBoundary;
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
    Route::post('/auth/activate', [AdminUserController::class, 'activate']);
});

Route::middleware(['tenant', 'auth:sanctum'])->group(function (): void {
    Route::get('/auth/me', [AuthController::class, 'me'])->name('auth.me');
    Route::post('/auth/logout', [AuthController::class, 'logout'])->name('auth.logout');

    Route::prefix('admin')->name('admin.')->middleware(InventoryRoleBoundary::class)->group(function (): void {
        Route::get('/users', [AdminUserController::class, 'index']);
        Route::post('/users', [AdminUserController::class, 'store']);
        Route::post('/users/{user}/activation', [AdminUserController::class, 'renew']);
        Route::get('/payment-agreements', [CollectionsController::class, 'agreements']);
        Route::post('/payment-agreements', [CollectionsController::class, 'store']);
        Route::get('/payment-agreements/{agreement}', [CollectionsController::class, 'show']);
        Route::get('/installments', [CollectionsController::class, 'installments']);
        Route::get('/installments/{installment}/payments', [CollectionsController::class, 'payments']);
        Route::post('/installments/{installment}/payments', [CollectionsController::class, 'pay']);
        Route::post('/payments/{payment}/reverse', [CollectionsController::class, 'reverse']);
        Route::get('/collections/summary', [CollectionsController::class, 'summary']);
        Route::get('/collections/leads', [CollectionsController::class, 'leads']);
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

        Route::get('lead-advisors', [AdminLeadController::class, 'advisors']);
        Route::apiResource('leads', AdminLeadController::class);
        Route::get('/visits', [AdminVisitController::class, 'index']);
        Route::post('/visits', [AdminVisitController::class, 'store']);
        Route::patch('/visits/{visit}/cancel', [AdminVisitController::class, 'cancel']);
        Route::get('/visits/today', [AdminVisitController::class, 'today'])->name('visits.today');
        Route::post('/leads/{lead}/properties', [AdminLeadController::class, 'attachProperty'])->name('leads.properties.attach');
        Route::patch('/leads/{lead}/properties/{property}', [AdminLeadController::class, 'updateProperty'])->name('leads.properties.update');
        Route::delete('/leads/{lead}/properties/{property}', [AdminLeadController::class, 'detachProperty'])->name('leads.properties.detach');
        Route::get('/follow-ups', [AdminLeadFollowUpController::class, 'indexAll'])->name('follow-ups.index-all');
        Route::get('/leads/{lead}/follow-ups', [AdminLeadFollowUpController::class, 'index'])->name('leads.follow-ups.index');
        Route::post('/leads/{lead}/follow-ups', [AdminLeadFollowUpController::class, 'store'])->name('leads.follow-ups.store');

        Route::get('/conversations', [AdminConversationController::class, 'index']);
        Route::get('/conversations/{conversation}/messages', [AdminConversationController::class, 'messages'])->whereUuid('conversation');
        Route::post('/conversations/{conversation}/takeover', [AdminConversationController::class, 'takeover'])->whereUuid('conversation');
        Route::post('/conversations/{conversation}/resume', [AdminConversationController::class, 'resume'])->whereUuid('conversation');
        Route::post('/conversations/{conversation}/messages', [AdminConversationController::class, 'reply'])->whereUuid('conversation');
        Route::post('/conversations/{conversation}/close', [AdminConversationController::class, 'close'])->whereUuid('conversation');
        Route::post('/conversations/{conversation}/resolve-unknown', [AdminConversationController::class, 'resolveUnknown'])->whereUuid('conversation');

        Route::get('/knowledge', [AdminKnowledgeController::class, 'index']);
        Route::post('/knowledge', [AdminKnowledgeController::class, 'store']);
        Route::post('/knowledge/{document}/approve', [AdminKnowledgeController::class, 'approve'])->whereUuid('document');
        Route::post('/knowledge/{document}/revoke', [AdminKnowledgeController::class, 'revoke'])->whereUuid('document');

        Route::get('/visit-requests', [AdminVisitRequestController::class, 'index']);
        Route::post('/visit-requests/{visitRequest}/confirm', [AdminVisitRequestController::class, 'confirm'])->whereUuid('visitRequest');
        Route::post('/visit-requests/{visitRequest}/decline', [AdminVisitRequestController::class, 'decline'])->whereUuid('visitRequest');

        Route::get('/push/config', [WebPushController::class, 'config']);
        Route::post('/push/subscriptions', [WebPushController::class, 'store'])->middleware('throttle:30,1');
        Route::delete('/push/subscriptions', [WebPushController::class, 'destroy']);
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

    Route::middleware('throttle:public-chat')->group(function (): void {
        Route::post('/public/chat/sessions', [PublicChatController::class, 'start']);
        Route::post('/public/chat/messages', [PublicChatController::class, 'send']);
    });
    Route::get('/public/chat/messages', [PublicChatController::class, 'messages'])->middleware('throttle:public-chat-read');

    Route::post('/public/leads', PublicLeadController::class)
        ->middleware('throttle:public-leads')
        ->name('public.leads.store');

    Route::post('/webhooks/{integrationPublicId}', ReceiveWebhookController::class)
        ->whereUuid('integrationPublicId')
        ->middleware('throttle:webhooks')
        ->name('webhooks.receive');
});

// Meta app-level webhook (every tenant). No tenant middleware: the tenant is derived from the
// signed payload's phone_number_id mapping inside the controller.
Route::middleware('throttle:meta-webhooks')->group(function (): void {
    Route::get('/webhooks/meta/whatsapp', [MetaWhatsAppWebhookController::class, 'verify']);
    Route::post('/webhooks/meta/whatsapp', [MetaWhatsAppWebhookController::class, 'receive']);
});

Route::fallback(static fn () => response()->json([
    'message' => 'Endpoint not found.',
    'code' => 'NOT_FOUND',
], 404));
