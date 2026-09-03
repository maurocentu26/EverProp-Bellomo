<?php

namespace App\Domain\Tenancy\Http\Middleware;

use App\Domain\Tenancy\Resolvers\TrustedTenantResolver;
use App\Domain\Tenancy\TenantContext;
use Closure;
use Illuminate\Contracts\Container\Container;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

final readonly class ResolveTenant
{
    public function __construct(
        private TrustedTenantResolver $resolver,
        private Container $container,
    ) {}

    public function handle(Request $request, Closure $next): Response
    {
        $context = TenantContext::forTenant($this->resolver->resolve($request));

        $this->container->instance(TenantContext::class, $context);
        $request->attributes->set(TenantContext::class, $context);

        try {
            return $next($request);
        } finally {
            $this->container->forgetInstance(TenantContext::class);
            $request->attributes->remove(TenantContext::class);
        }
    }
}
