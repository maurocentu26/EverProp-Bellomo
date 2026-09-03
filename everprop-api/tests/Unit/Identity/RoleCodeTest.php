<?php

namespace Tests\Unit\Identity;

use App\Domain\Identity\Enums\Capability;
use App\Domain\Identity\Enums\RoleCode;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;

final class RoleCodeTest extends TestCase
{
    #[DataProvider('allowedCapabilities')]
    public function test_role_capabilities_are_allowlisted(RoleCode $role, Capability $capability): void
    {
        self::assertTrue($role->allows($capability));
    }

    /** @return iterable<string, array{RoleCode, Capability}> */
    public static function allowedCapabilities(): iterable
    {
        yield 'tenant admin manages users' => [RoleCode::TENANT_ADMIN, Capability::MANAGE_USERS];
        yield 'manager assigns' => [RoleCode::SALES_MANAGER, Capability::ASSIGN];
        yield 'advisor updates' => [RoleCode::SALES_ADVISOR, Capability::UPDATE];
        yield 'viewer reads' => [RoleCode::READ_ONLY, Capability::VIEW];
    }

    public function test_read_only_role_cannot_mutate(): void
    {
        self::assertFalse(RoleCode::READ_ONLY->allows(Capability::CREATE));
        self::assertFalse(RoleCode::READ_ONLY->allows(Capability::UPDATE));
        self::assertFalse(RoleCode::READ_ONLY->allows(Capability::DELETE));
        self::assertFalse(RoleCode::READ_ONLY->allows(Capability::PUBLISH));
        self::assertFalse(RoleCode::READ_ONLY->allows(Capability::ASSIGN));
    }

    public function test_advisor_cannot_assign_or_administer(): void
    {
        self::assertFalse(RoleCode::SALES_ADVISOR->allows(Capability::ASSIGN));
        self::assertFalse(RoleCode::SALES_ADVISOR->allows(Capability::MANAGE_USERS));
        self::assertFalse(RoleCode::SALES_ADVISOR->allows(Capability::MANAGE_INTEGRATIONS));
    }
}
