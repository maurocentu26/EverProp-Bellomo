<?php

namespace App\Domain\Conversations\Http\Controllers;

use App\Domain\Conversations\Services\ConversationControl;
use App\Domain\Conversations\Services\InboundMessageService;
use App\Domain\Identity\Enums\Capability;
use App\Domain\Identity\Services\AuthorizationService;
use App\Domain\Tenancy\TenantContext;
use App\Http\Controllers\Controller;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

/**
 * Per-tenant switch for the assistant and the copilot (EVP-L01): the tenant admin turns them on or off without a
 * redeploy. The platform switches (env) still win: a tenant switch can only narrow what the platform allows.
 */
final class AdminAiSettingsController extends Controller
{
    public function show(Request $request): JsonResponse
    {
        $this->admin($request);

        return response()->json(['data' => $this->state(app(TenantContext::class)->id())]);
    }

    public function update(Request $request): JsonResponse
    {
        $user = $this->admin($request);
        $data = $request->validate([
            'mode' => 'sometimes|required|in:AUTONOMOUS,COPILOT,DISABLED',
            'ai_enabled' => ['sometimes', 'boolean', Rule::prohibitedIf($request->has('mode'))],
            'copilot_enabled' => ['sometimes', 'boolean', Rule::prohibitedIf($request->has('mode'))],
        ]);
        if (isset($data['mode'])) {
            $data = [
                'ai_enabled' => $data['mode'] === 'AUTONOMOUS',
                'copilot_enabled' => $data['mode'] !== 'DISABLED',
            ];
        }
        $tenantId = app(TenantContext::class)->id();

        $turnedOff = DB::transaction(function () use ($tenantId, $user, $data, $request): bool {
            $raw = DB::table('tenants')->where('id', $tenantId)->lockForUpdate()->value('settings_json');
            $settings = json_decode((string) $raw, true) ?: [];
            $current = is_array($settings['conversations'] ?? null) ? $settings['conversations'] : [];
            $before = ['ai_enabled' => ($current['ai_enabled'] ?? false) === true, 'copilot_enabled' => ($current['copilot_enabled'] ?? false) === true];
            $after = array_merge($before, array_map(fn ($v) => (bool) $v, $data));
            if ($after === $before) {
                return false; // nothing changed: no write, no audit row
            }
            $settings['conversations'] = array_merge($current, $after);
            DB::table('tenants')->where('id', $tenantId)->update(['settings_json' => json_encode($settings, JSON_THROW_ON_ERROR)]);
            $requestId = (string) $request->header('X-Request-Id');
            DB::table('audit_logs')->insert([
                'tenant_id' => $tenantId, 'actor_type' => 'USER', 'actor_user_id' => $user->id,
                'action_code' => 'CONVERSATIONS_AI_SETTINGS_UPDATED', 'entity_type' => 'TENANT', 'entity_id' => $tenantId,
                'request_id' => preg_match('/\A[A-Za-z0-9._:-]{1,191}\z/', $requestId) === 1 ? $requestId : null,
                'before_json' => json_encode($before, JSON_THROW_ON_ERROR), 'after_json' => json_encode($after, JSON_THROW_ON_ERROR),
                'occurred_at' => now(),
            ]);

            return $before['ai_enabled'] && ! $after['ai_enabled'];
        });

        if ($turnedOff) {
            $this->handOffBotConversations($tenantId);
        }

        return response()->json(['data' => $this->state($tenantId)]);
    }

    /**
     * Turning the assistant off hands its recent conversations to humans right away. The handoff raises the
     * control epoch, so whatever a turn in flight still does is discarded by the existing fence: its reply, a
     * handoff notice the model wrote, mutating tools and bot sends still queued (requestHuman cancels them).
     * Older bot conversations go to a human with the visitor's next message (accept()).
     */
    private function handOffBotConversations(int $tenantId): void
    {
        DB::table('conversations')->where('tenant_id', $tenantId)->whereIn('control_state', ConversationControl::BOT_STATES)
            ->where('status', 'OPEN')->whereNull('closed_at')
            ->where('last_activity_at', '>=', now()->subHours((int) config('conversations.ai_off_sweep_hours', 72)))
            // ponytail: one request handles the pilot's volume; thousands of open bot chats would need a queued job.
            ->orderBy('id')->pluck('id')
            ->each(fn ($id) => rescue(fn () => InboundMessageService::handOffOrphanedBotConversation($tenantId, (int) $id)));
    }

    /** @return array{mode: string, ai_enabled: bool, copilot_enabled: bool, ai_available: bool, copilot_available: bool} */
    private function state(int $tenantId): array
    {
        $settings = json_decode((string) DB::table('tenants')->where('id', $tenantId)->value('settings_json'), true) ?: [];
        $current = is_array($settings['conversations'] ?? null) ? $settings['conversations'] : [];

        return [
            // What the tenant chose, and whether the platform lets it take effect.
            'mode' => ($current['ai_enabled'] ?? false) === true ? 'AUTONOMOUS' : (($current['copilot_enabled'] ?? false) === true ? 'COPILOT' : 'DISABLED'),
            'ai_enabled' => ($current['ai_enabled'] ?? false) === true,
            'copilot_enabled' => ($current['copilot_enabled'] ?? false) === true,
            'ai_available' => InboundMessageService::aiAvailable(),
            'copilot_available' => InboundMessageService::copilotAvailable(),
        ];
    }

    /** Existing RBAC (D05): the same capability that connects integrations (tenant admin of the resolved tenant). */
    private function admin(Request $request): User
    {
        /** @var User $user */
        $user = $request->user();
        abort_unless(app(AuthorizationService::class)->allows($user, Capability::MANAGE_INTEGRATIONS), 403);

        return $user;
    }
}
