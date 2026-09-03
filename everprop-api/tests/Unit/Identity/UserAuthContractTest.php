<?php

namespace Tests\Unit\Identity;

use App\Domain\Identity\Enums\RoleCode;
use App\Domain\Identity\Enums\UserStatus;
use App\Models\User;
use PHPUnit\Framework\TestCase;
use ReflectionProperty;

final class UserAuthContractTest extends TestCase
{
    public function test_it_uses_the_forward_only_password_hash_column(): void
    {
        $user = new User;
        $user->setRawAttributes([
            'password_hash' => '$2y$10$example',
            'role_code' => 'READ_ONLY',
            'status' => 'ACTIVE',
        ]);

        self::assertSame('password_hash', $user->getAuthPasswordName());
        self::assertSame('$2y$10$example', $user->getAuthPassword());
        self::assertNull((new ReflectionProperty($user, 'rememberTokenName'))->getValue($user));
    }

    public function test_it_casts_canonical_role_and_status_codes(): void
    {
        $user = new User;
        $user->setRawAttributes([
            'role_code' => 'SALES_ADVISOR',
            'status' => 'ACTIVE',
        ]);

        self::assertSame(RoleCode::SALES_ADVISOR, $user->role());
        self::assertSame(UserStatus::ACTIVE, $user->status);
        self::assertTrue($user->isActive());
    }
}
