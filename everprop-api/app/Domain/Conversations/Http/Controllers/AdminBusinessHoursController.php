<?php

namespace App\Domain\Conversations\Http\Controllers;

use App\Domain\Conversations\Services\BusinessHours;
use App\Domain\Identity\Enums\Capability;
use App\Domain\Identity\Services\AuthorizationService;
use App\Domain\Tenancy\TenantContext;
use App\Http\Controllers\Controller;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

/**
 * EVP-L02: the tenant admin sets the team's business hours and, optionally, the text a visitor gets while the team
 * is away. Same storage, RBAC and audit as the AI switches (ADR 0005 exception).
 */
final class AdminBusinessHoursController extends Controller
{
    public function show(Request $request, BusinessHours $hours): JsonResponse
    {
        $this->admin($request);

        return response()->json(['data' => $this->state(app(TenantContext::class)->id(), $hours)]);
    }

    public function update(Request $request, BusinessHours $hours): JsonResponse
    {
        $user = $this->admin($request);
        $data = $request->validate([
            'business_hours' => 'present|nullable|array',
            'away_message' => 'nullable|string|max:500',
        ]);
        $schedule = $data['business_hours'] === null ? null : BusinessHours::normalize($data['business_hours']);
        if ($data['business_hours'] !== null && $schedule === null) {
            return response()->json(['error' => ['code' => 'INVALID_SCHEDULE',
                'message' => 'Revisá el horario: hasta dos franjas por día, en formato HH:MM, la hora de inicio antes que la de fin y sin superponerse.']], 422);
        }
        $away = isset($data['away_message']) && trim($data['away_message']) !== '' ? trim($data['away_message']) : null;
        $tenantId = app(TenantContext::class)->id();

        DB::transaction(function () use ($tenantId, $user, $schedule, $away, $request): void {
            $settings = json_decode((string) DB::table('tenants')->where('id', $tenantId)->lockForUpdate()->value('settings_json'), true) ?: [];
            $current = is_array($settings['conversations'] ?? null) ? $settings['conversations'] : [];
            $before = ['business_hours' => BusinessHours::normalize($current['business_hours'] ?? null), 'away_message' => $current['away_message'] ?? null];
            $after = ['business_hours' => $schedule, 'away_message' => $away];
            if ($before === $after) {
                return; // nothing changed: no write, no audit row
            }
            $settings['conversations'] = array_merge($current, $after);
            DB::table('tenants')->where('id', $tenantId)->update(['settings_json' => json_encode($settings, JSON_THROW_ON_ERROR | JSON_UNESCAPED_UNICODE)]);
            $requestId = (string) $request->header('X-Request-Id');
            DB::table('audit_logs')->insert([
                'tenant_id' => $tenantId, 'actor_type' => 'USER', 'actor_user_id' => $user->id,
                'action_code' => 'CONVERSATIONS_BUSINESS_HOURS_UPDATED', 'entity_type' => 'TENANT', 'entity_id' => $tenantId,
                'request_id' => preg_match('/\A[A-Za-z0-9._:-]{1,191}\z/', $requestId) === 1 ? $requestId : null,
                'before_json' => json_encode($before, JSON_THROW_ON_ERROR | JSON_UNESCAPED_UNICODE),
                'after_json' => json_encode($after, JSON_THROW_ON_ERROR | JSON_UNESCAPED_UNICODE),
                'occurred_at' => now(),
            ]);
        });

        return response()->json(['data' => $this->state($tenantId, $hours)]);
    }

    /** @return array<string, mixed> */
    private function state(int $tenantId, BusinessHours $hours): array
    {
        $settings = $hours->settings($tenantId);

        return [
            'business_hours' => $settings['schedule'], // null = always open
            'away_message' => $settings['away_message'],
            'timezone' => $settings['timezone'],
            'summary' => $hours->describe($tenantId),
            'open_now' => $hours->isOpen($tenantId),
            // What a visitor would get right now if the team were away (the tenant's text or the default).
            'away_message_preview' => $settings['schedule'] === null ? null : $hours->awayMessage($tenantId),
        ];
    }

    /** Existing RBAC (D05): tenant admin of the resolved tenant. */
    private function admin(Request $request): User
    {
        /** @var User $user */
        $user = $request->user();
        abort_unless(app(AuthorizationService::class)->allows($user, Capability::MANAGE_INTEGRATIONS), 403);

        return $user;
    }
}
