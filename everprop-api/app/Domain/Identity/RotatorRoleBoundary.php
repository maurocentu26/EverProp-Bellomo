<?php

namespace App\Domain\Identity;

use App\Domain\Identity\Enums\RoleCode;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

final class RotatorRoleBoundary
{
    public function handle(Request $request, Closure $next): Response
    {
        if ($request->user()?->role() === RoleCode::ROTATOR) {
            $reading = $request->isMethod('GET') && ($request->is('api/v1/admin/leads', 'api/v1/admin/lead-advisors', 'api/v1/admin/notifications*') || preg_match('#^api/v1/admin/leads/[^/]+$#', $request->path()));
            $assigning = in_array($request->method(), ['PUT', 'PATCH'], true) && preg_match('#^api/v1/admin/leads/[^/]+$#', $request->path());
            $creating = $request->isMethod('POST') && $request->is('api/v1/admin/leads');
            abort_unless($reading || $assigning || $creating, 403);
        }

        return $next($request);
    }
}
