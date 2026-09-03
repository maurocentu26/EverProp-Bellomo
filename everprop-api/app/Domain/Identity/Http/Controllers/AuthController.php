<?php

namespace App\Domain\Identity\Http\Controllers;

use App\Domain\Identity\Http\Requests\LoginRequest;
use App\Domain\Identity\Http\Resources\UserResource;
use App\Domain\Tenancy\Exceptions\TenantNotResolved;
use App\Domain\Tenancy\TenantContext;
use App\Http\Controllers\Controller;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Support\Facades\Auth;

final class AuthController extends Controller
{
    public function login(LoginRequest $request, TenantContext $tenantContext): UserResource
    {
        $user = $request->authenticate($tenantContext);

        return UserResource::make($user->loadMissing('tenant'));
    }

    public function me(Request $request, TenantContext $tenantContext): UserResource
    {
        return UserResource::make($this->authenticatedUser($request, $tenantContext)->loadMissing('tenant'));
    }

    public function logout(Request $request, TenantContext $tenantContext): Response
    {
        $this->authenticatedUser($request, $tenantContext);

        Auth::guard('web')->logout();
        $request->session()->invalidate();
        $request->session()->regenerateToken();

        return response()->noContent();
    }

    private function authenticatedUser(Request $request, TenantContext $tenantContext): User
    {
        $user = $request->user();

        if (! $user instanceof User || ! $user->isActive() || (int) $user->tenant_id !== $tenantContext->id()) {
            throw TenantNotResolved::forRequest();
        }

        return $user;
    }
}
