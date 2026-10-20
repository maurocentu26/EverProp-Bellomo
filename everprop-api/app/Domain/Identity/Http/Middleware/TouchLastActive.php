<?php

namespace App\Domain\Identity\Http\Middleware;

use App\Models\User;
use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Symfony\Component\HttpFoundation\Response;

/** EVP-50: records real panel use for re-engagement nudges, at most one write per user per hour. */
final class TouchLastActive
{
    public function handle(Request $request, Closure $next): Response
    {
        $user = $request->user();
        if ($user instanceof User) {
            $hourAgo = now()->subHour();
            DB::table('users')->where('tenant_id', $user->tenant_id)->where('id', $user->id)
                ->where(fn ($q) => $q->whereNull('last_active_at')->orWhere('last_active_at', '<', $hourAgo))
                ->update(['last_active_at' => now()]);
        }

        return $next($request);
    }
}
