<?php

namespace App\Domain\Tenancy;

use App\Domain\Tenancy\Exceptions\TenantContextMissing;
use App\Domain\Tenancy\Models\Tenant;

final readonly class TenantContext
{
    private function __construct(
        private ?Tenant $tenant,
        private bool $platform,
        private ?string $operationCode,
    ) {}

    public static function forTenant(Tenant $tenant): self
    {
        return new self($tenant, false, null);
    }

    /**
     * Platform contexts must only be created through PlatformAccess.
     *
     * @internal
     */
    public static function forPlatform(string $operationCode): self
    {
        return new self(null, true, $operationCode);
    }

    public function id(): int
    {
        return (int) $this->tenant()->getKey();
    }

    public function tenant(): Tenant
    {
        return $this->tenant ?? throw TenantContextMissing::forTenantOperation();
    }

    public function isPlatform(): bool
    {
        return $this->platform;
    }

    public function reason(): ?string
    {
        return $this->operationCode;
    }
}
