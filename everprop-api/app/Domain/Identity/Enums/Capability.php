<?php

namespace App\Domain\Identity\Enums;

enum Capability: string
{
    case VIEW_ANY = 'viewAny';
    case VIEW = 'view';
    case CREATE = 'create';
    case UPDATE = 'update';
    case DELETE = 'delete';
    case PUBLISH = 'publish';
    case ASSIGN = 'assign';
    case MANAGE_USERS = 'manageUsers';
    case MANAGE_INTEGRATIONS = 'manageIntegrations';
}
