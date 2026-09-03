<?php

namespace App\Domain\Tenancy;

use App\Domain\Identity\Enums\RoleCode;
use App\Models\User;
use Closure;
use Illuminate\Auth\Access\AuthorizationException;
use Illuminate\Contracts\Container\Container;
use Psr\Log\LoggerInterface;

final readonly class PlatformAccess
{
    public function __construct(
        private Container $container,
        private LoggerInterface $logger,
    ) {}

    public function run(User $actor, string $operationCode, Closure $operation): mixed
    {
        if (! $actor->isActive() || $actor->role() !== RoleCode::SUPER_ADMIN) {
            throw new AuthorizationException('This action is unauthorized.');
        }

        if (preg_match('/\A[a-z0-9][a-z0-9._-]{2,99}\z/', $operationCode) !== 1) {
            throw new \InvalidArgumentException('The platform operation code is invalid.');
        }

        $hadPreviousContext = $this->container->bound(TenantContext::class);
        $previousContext = $hadPreviousContext ? $this->container->make(TenantContext::class) : null;

        $this->container->instance(TenantContext::class, TenantContext::forPlatform($operationCode));
        $this->logger->notice('Platform tenant access started.', [
            'actor_public_id' => $actor->public_id,
            'operation_code' => $operationCode,
        ]);

        try {
            return $operation();
        } finally {
            $this->logger->notice('Platform tenant access finished.', [
                'actor_public_id' => $actor->public_id,
                'operation_code' => $operationCode,
            ]);

            if ($previousContext instanceof TenantContext) {
                $this->container->instance(TenantContext::class, $previousContext);
            } else {
                $this->container->forgetInstance(TenantContext::class);
            }
        }
    }
}
