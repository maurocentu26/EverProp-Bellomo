<?php

namespace App\Domain\Tenancy\Resolvers;

use App\Domain\Tenancy\Contracts\TenantResolver;
use App\Domain\Tenancy\Exceptions\TenantNotResolved;
use App\Domain\Tenancy\Models\Tenant;
use Illuminate\Http\Request;

final class TrustedTenantResolver implements TenantResolver
{
    public function resolve(Request $request): Tenant
    {
        $resolvedTenant = $this->resolveFromTrustedHost($request);
        $localTenant = $this->resolveFromLocalOverride($request);
        $authenticatedTenant = $this->resolveFromAuthenticatedUser($request);

        $candidates = array_values(array_filter([
            $resolvedTenant,
            $localTenant,
            $authenticatedTenant,
        ]));

        if ($candidates === []) {
            throw TenantNotResolved::forRequest();
        }

        $tenant = $candidates[0];

        foreach ($candidates as $candidate) {
            if (! $candidate->is($tenant)) {
                throw TenantNotResolved::forRequest();
            }
        }

        return $tenant;
    }

    private function resolveFromTrustedHost(Request $request): ?Tenant
    {
        $hosts = config('tenancy.hosts', []);

        if (! is_array($hosts)) {
            return null;
        }

        $selector = $hosts[strtolower($request->getHost())] ?? null;

        return is_string($selector) && $selector !== ''
            ? $this->findActiveTenant($selector)
            : null;
    }

    private function resolveFromLocalOverride(Request $request): ?Tenant
    {
        $header = (string) config('tenancy.local_header', 'X-EverProp-Tenant');
        $selector = $request->headers->get($header);

        if (! is_string($selector) || $selector === '') {
            return null;
        }

        if (! app()->environment(['local', 'testing']) || ! config('tenancy.allow_local_resolver', false)) {
            throw TenantNotResolved::forRequest();
        }

        if (preg_match('/\A[a-zA-Z0-9][a-zA-Z0-9_-]{0,79}\z|\A[0-9a-fA-F-]{36}\z/', $selector) !== 1) {
            throw TenantNotResolved::forRequest();
        }

        return $this->findActiveTenant($selector);
    }

    private function resolveFromAuthenticatedUser(Request $request): ?Tenant
    {
        $user = $request->user();

        if ($user === null) {
            return null;
        }

        if (! $user->isActive()) {
            throw TenantNotResolved::forRequest();
        }

        return Tenant::query()
            ->active()
            ->whereKey($user->tenant_id)
            ->first() ?? throw TenantNotResolved::forRequest();
    }

    private function findActiveTenant(string $selector): Tenant
    {
        return Tenant::query()
            ->active()
            ->where(function ($query) use ($selector): void {
                $query->where('public_id', $selector)
                    ->orWhere('slug', $selector);
            })
            ->first() ?? throw TenantNotResolved::forRequest();
    }
}
