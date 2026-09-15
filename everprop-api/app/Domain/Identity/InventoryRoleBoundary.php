<?php

namespace App\Domain\Identity;

use App\Domain\Identity\Enums\RoleCode;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

final class InventoryRoleBoundary
{
    public function handle(Request $request, Closure $next): Response
    {
        if ($request->user()?->role() === RoleCode::INVENTORY_MANAGER) {
            abort_unless($request->is('api/v1/admin/projects*', 'api/v1/admin/properties*', 'api/v1/admin/notifications*'), 403);
        }

        return $next($request);
    }
}
