<?php

namespace App\Domain\Identity\Http\Middleware;

use Closure;
use Illuminate\Auth\AuthenticationException;
use Illuminate\Auth\SessionGuard;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Laravel\Sanctum\Http\Middleware\AuthenticateSession;
use Symfony\Component\HttpFoundation\Response;

final class VerifyPasswordSession extends AuthenticateSession
{
    public function handle(Request $request, Closure $next): Response
    {
        $guard = Auth::guard('web');
        if ($request->hasSession() && $guard instanceof SessionGuard
            && $request->session()->has($guard->getName()) && ! $request->session()->has('password_hash_web')) {
            // An old session without a snapshot cannot prove it predates a password reset.
            $guard->logoutCurrentDevice();
            $request->session()->invalidate();
            throw new AuthenticationException;
        }

        return parent::handle($request, $next);
    }
}
