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
            // ponytail: acceso comercial provisorio para rol rotador por decisión de cliente (EVP-21). Revocar al migrar al rol comercial definitivo.
            $isLeadAction = $request->is(
                'api/v1/admin/leads',
                'api/v1/admin/leads/*',
                'api/v1/admin/lead-advisors',
                'api/v1/admin/notifications*',
                'api/v1/admin/follow-ups*',
                'api/v1/admin/visits',
                'api/v1/admin/visits/*/cancel'
            );

            $isCatalogRead = $request->isMethod('GET') && $request->is(
                'api/v1/admin/projects',
                'api/v1/admin/projects/*',
                'api/v1/admin/properties',
                'api/v1/admin/properties/*'
            );

            $allowedMethod = in_array($request->method(), ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'], true);
            $allowed = ($isLeadAction && $allowedMethod) || $isCatalogRead;

            abort_unless($allowed, 403);
        }

        return $next($request);
    }
}
