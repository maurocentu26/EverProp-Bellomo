<?php

namespace App\Domain\Integrations\Http\Controllers;

use App\Domain\Identity\Enums\Capability;
use App\Domain\Identity\Services\AuthorizationService;
use App\Domain\Integrations\Exceptions\OnboardingFailed;
use App\Domain\Integrations\Services\WhatsAppOnboarding;
use App\Domain\Tenancy\TenantContext;
use App\Http\Controllers\Controller;
use App\Models\User;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Embedded Signup endpoints for the panel (Tech Provider W4/W5). Only a tenant admin connects a
 * WhatsApp number, always to the tenant resolved by the server; tokens never leave the backend.
 */
final class WhatsAppConnectionController extends Controller
{
    /** Public values the panel needs to open Meta's signup dialog; null ids when it is not available here. */
    public function config(Request $request): JsonResponse
    {
        $this->admin($request);
        $enabled = config('services.meta.onboarding_enabled') && config('services.meta.app_id') && config('services.meta.embedded_signup_config_id');

        return response()->json(['data' => [
            'enabled' => (bool) $enabled,
            'app_id' => $enabled ? (string) config('services.meta.app_id') : null,
            'config_id' => $enabled ? (string) config('services.meta.embedded_signup_config_id') : null,
            'graph_version' => (string) config('services.meta.graph_version'),
        ]]);
    }

    public function connect(Request $request, WhatsAppOnboarding $onboarding): JsonResponse
    {
        $user = $this->admin($request);
        $signup = $request->validate([
            'code' => 'required|string|max:2048',
            'waba_id' => 'required|string|regex:/^\d{1,32}$/',
            'phone_number_id' => 'required|string|regex:/^\d{1,32}$/',
            'business_id' => 'nullable|string|regex:/^\d{1,32}$/',
        ]);

        try {
            $result = $onboarding->connect(app(TenantContext::class)->id(), $user, $signup + ['business_id' => null]);
        } catch (OnboardingFailed $failure) {
            return response()->json(['error' => ['code' => $failure->reason, 'message' => $failure->getMessage()]], $failure->status);
        } catch (ConnectionException) {
            return response()->json(['error' => ['code' => 'META_UNREACHABLE', 'message' => 'No pudimos comunicarnos con Meta. Volvé a intentarlo.']], 502);
        }

        return response()->json(['data' => $result], $result['state'] === 'ACTIVE' ? 201 : 202);
    }

    /** Existing RBAC (D05): manageIntegrations also checks an active user of the resolved tenant. */
    private function admin(Request $request): User
    {
        /** @var User $user */
        $user = $request->user();
        abort_unless(app(AuthorizationService::class)->allows($user, Capability::MANAGE_INTEGRATIONS), 403);

        return $user;
    }
}
