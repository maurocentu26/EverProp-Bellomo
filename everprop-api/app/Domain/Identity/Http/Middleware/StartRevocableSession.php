<?php

namespace App\Domain\Identity\Http\Middleware;

use Illuminate\Contracts\Session\Session;
use Illuminate\Http\Request;
use Illuminate\Session\Middleware\StartSession;
use Illuminate\Support\Facades\Redis;
use Illuminate\Support\Str;

final class StartRevocableSession extends StartSession
{
    public function getSession(Request $request): Session
    {
        $session = parent::getSession($request);
        if (Redis::connection('session')->exists('revoked-session:'.$session->getId())) {
            // Before loading attributes or resolving auth: a late response cannot revive this ID.
            $session->setId(Str::random(40));
        }

        return $session;
    }
}
