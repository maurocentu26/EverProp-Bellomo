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

        $panelHost = $this->panelHost($request);
        $selector = $hosts[$panelHost ?? strtolower($request->getHost())] ?? null;
        if ($panelHost !== null && (! is_string($selector) || $selector === '')) {
            throw TenantNotResolved::forRequest(); // a signed host must map to a tenant, never fall back to the session
        }

        return is_string($selector) && $selector !== ''
            ? $this->findActiveTenant($selector)
            : null;
    }

    /**
     * Host asserted by the panel proxy over the signed channel (S02, ADR 0005): HMAC-SHA256 of
     * "eversys-panel-host-v1\nhost\ntimestamp" with the shared panel key, fresh within the TTL. Null when the
     * panel did not sign (direct API calls keep using the request host); any signed header that fails
     * verification rejects the request instead of falling back. Outside local/testing a loopback name or an
     * IP is never a tenant domain: it means the panel signed its own server hostname, so it is refused.
     */
    private function panelHost(Request $request): ?string
    {
        $host = $request->headers->get('X-Eversys-Panel-Host');
        $timestamp = $request->headers->get('X-Eversys-Panel-Timestamp');
        $signature = $request->headers->get('X-Eversys-Panel-Signature');
        if ($host === null && $timestamp === null && $signature === null) {
            return null;
        }

        $key = (string) config('tenancy.panel_signing_key', '');
        $host = (string) $host;
        // Verify exactly what was signed; normalize only afterwards, for the host map lookup.
        if ($key === '' || preg_match('/\A[A-Za-z0-9.-]{1,253}\z/', $host) !== 1 || ! ctype_digit((string) $timestamp)
            || abs(time() - (int) $timestamp) > (int) config('tenancy.panel_signature_ttl', 60)
            || ! hash_equals(hash_hmac('sha256', "eversys-panel-host-v1\n".$host."\n".$timestamp, $key), (string) $signature)) {
            throw TenantNotResolved::forRequest();
        }
        $host = strtolower($host);
        if (! app()->environment(['local', 'testing']) && ($host === 'localhost' || str_ends_with($host, '.localhost')
            || filter_var($host, FILTER_VALIDATE_IP) !== false)) {
            throw TenantNotResolved::forRequest();
        }

        return $host;
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
