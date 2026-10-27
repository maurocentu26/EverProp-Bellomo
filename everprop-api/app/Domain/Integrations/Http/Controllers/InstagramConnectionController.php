<?php

namespace App\Domain\Integrations\Http\Controllers;

use App\Domain\Identity\Enums\Capability;
use App\Domain\Identity\Services\AuthorizationService;
use App\Domain\Integrations\Exceptions\OnboardingFailed;
use App\Domain\Integrations\Services\InstagramOnboarding;
use App\Domain\Tenancy\TenantContext;
use App\Http\Controllers\Controller;
use App\Models\User;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

final class InstagramConnectionController extends Controller
{
    public function config(Request $request, InstagramOnboarding $onboarding): JsonResponse
    {
        $this->admin($request);
        $tenant = app(TenantContext::class)->tenant();

        return response()->json(['data' => ['enabled' => $onboarding->enabled($tenant), 'connections' => $onboarding->connections($tenant->id)]])->header('Cache-Control', 'no-store');
    }

    public function authorize(Request $request, InstagramOnboarding $onboarding): JsonResponse
    {
        $user = $this->admin($request);
        abort_unless($request->hasSession(), 403);

        return $this->result(fn () => ['authorization_url' => $onboarding->authorize(app(TenantContext::class)->tenant(), $user, $request->session()->getId())]);
    }

    public function connect(Request $request, InstagramOnboarding $onboarding): JsonResponse
    {
        $user = $this->admin($request);
        abort_unless($request->hasSession(), 403);
        $input = $request->validate([
            'state' => 'required|string|regex:/^[a-f0-9]{64}$/', 'code' => 'nullable|string|max:2048',
            'error' => 'nullable|string|max:100', 'tenant_id' => 'prohibited', 'user_id' => 'prohibited', 'redirect_uri' => 'prohibited',
        ]);

        return $this->result(fn () => $onboarding->connect(app(TenantContext::class)->tenant(), $user, $request->session()->getId(), $input['state'], $input['code'] ?? null, isset($input['error'])), 201);
    }

    public function refresh(Request $request, string $integration, InstagramOnboarding $onboarding): JsonResponse
    {
        $user = $this->admin($request);

        return $this->result(fn () => $onboarding->refresh(app(TenantContext::class)->tenant(), $user, $integration));
    }

    /** @param callable(): array<string, mixed> $operation */
    private function result(callable $operation, int $status = 200): JsonResponse
    {
        try {
            return response()->json(['data' => $operation()], $status)->header('Cache-Control', 'no-store');
        } catch (OnboardingFailed $failure) {
            return response()->json(['error' => ['code' => $failure->reason, 'message' => $failure->getMessage()]], $failure->status)->header('Cache-Control', 'no-store');
        } catch (ConnectionException) {
            return response()->json(['error' => ['code' => 'META_UNREACHABLE', 'message' => 'No pudimos comunicarnos con Meta. Volvé a iniciar la conexión.']], 502)->header('Cache-Control', 'no-store');
        }
    }

    private function admin(Request $request): User
    {
        /** @var User $user */
        $user = $request->user();
        abort_unless(app(AuthorizationService::class)->allows($user, Capability::MANAGE_INTEGRATIONS), 403);

        return $user;
    }
}
