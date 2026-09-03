<?php

namespace Tests\Unit\Tenancy;

use App\Domain\Tenancy\Exceptions\TenantContextMissing;
use App\Domain\Tenancy\Models\Tenant;
use App\Domain\Tenancy\TenantContext;
use PHPUnit\Framework\TestCase;

final class TenantContextTest extends TestCase
{
    public function test_it_exposes_one_immutable_tenant(): void
    {
        $tenant = new Tenant;
        $tenant->setRawAttributes(['id' => 41, 'status' => 'ACTIVE']);

        $context = TenantContext::forTenant($tenant);

        self::assertSame(41, $context->id());
        self::assertSame($tenant, $context->tenant());
        self::assertFalse($context->isPlatform());
        self::assertNull($context->reason());
    }

    public function test_platform_context_cannot_be_used_as_a_tenant_context(): void
    {
        $context = TenantContext::forPlatform('support.audit');

        self::assertTrue($context->isPlatform());
        self::assertSame('support.audit', $context->reason());

        $this->expectException(TenantContextMissing::class);

        $context->id();
    }
}
