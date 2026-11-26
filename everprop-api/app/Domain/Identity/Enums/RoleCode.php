<?php

namespace App\Domain\Identity\Enums;

enum RoleCode: string
{
    case SUPER_ADMIN = 'SUPER_ADMIN';
    case TENANT_ADMIN = 'TENANT_ADMIN';
    case SALES_MANAGER = 'SALES_MANAGER';
    case SALES_ADVISOR = 'SALES_ADVISOR';
    case BOT_OPERATOR = 'BOT_OPERATOR';
    case READ_ONLY = 'READ_ONLY';
    case ROTATOR = 'ROTATOR';
    /** EVP-212: client QA account; RotatorRoleBoundary limits it to its own assistant test sessions and conversations. */
    case ASSISTANT_TESTER = 'ASSISTANT_TESTER';

    /** @return list<Capability> */
    public function capabilities(): array
    {
        return match ($this) {
            // No generic capability: every access is an explicit role check (deny by default).
            self::ASSISTANT_TESTER => [],
            self::SUPER_ADMIN, self::TENANT_ADMIN => Capability::cases(),
            self::ROTATOR => [Capability::VIEW_ANY, Capability::VIEW, Capability::ASSIGN],
            self::SALES_MANAGER => [
                Capability::VIEW_ANY,
                Capability::VIEW,
                Capability::CREATE,
                Capability::UPDATE,
                Capability::PUBLISH,
                Capability::ASSIGN,
            ],
            self::SALES_ADVISOR => [
                Capability::VIEW_ANY,
                Capability::VIEW,
                Capability::CREATE,
                Capability::UPDATE,
            ],
            self::BOT_OPERATOR => [
                Capability::VIEW_ANY,
                Capability::VIEW,
                Capability::CREATE,
                Capability::UPDATE,
            ],
            self::READ_ONLY => [
                Capability::VIEW_ANY,
                Capability::VIEW,
            ],
        };
    }

    public function allows(Capability $capability): bool
    {
        return in_array($capability, $this->capabilities(), true);
    }

    public function isPlatformAdministrator(): bool
    {
        return $this === self::SUPER_ADMIN;
    }
}
