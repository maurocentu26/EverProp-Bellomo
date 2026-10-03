<?php

use App\Domain\Tenancy\Http\Middleware\ResolveTenant;
use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;
use Illuminate\Http\Request;

return Application::configure(basePath: dirname(__DIR__))
    ->withRouting(
        web: __DIR__.'/../routes/web.php',
        api: __DIR__.'/../routes/api.php',
        commands: __DIR__.'/../routes/console.php',
        apiPrefix: 'api/v1',
    )
    ->withMiddleware(function (Middleware $middleware): void {
        $middleware->statefulApi();
        // The chat widget is served from the panel origin (a Sanctum stateful domain) but authenticates with
        // a bearer session token and sends no cookies (credentials: omit); CSRF protects cookie sessions only.
        // Without this, every widget POST from the panel origin gets 419 outside tests.
        $middleware->validateCsrfTokens(except: ['api/v1/public/chat/sessions', 'api/v1/public/chat/messages']);
        $middleware->trustProxies(
            headers: Request::HEADER_X_FORWARDED_FOR | Request::HEADER_X_FORWARDED_PORT | Request::HEADER_X_FORWARDED_PROTO,
        );
        $middleware->trustHosts(
            at: static fn (): array => array_map(
                static fn (string $host): string => '^'.preg_quote($host, '/').'$',
                config('tenancy.trusted_hosts', []),
            ),
            subdomains: false,
        );
        $middleware->alias([
            'tenant' => ResolveTenant::class,
        ]);
    })
    ->withExceptions(function (Exceptions $exceptions): void {
        $exceptions->shouldRenderJsonWhen(
            fn (Request $request) => $request->is('api/*'),
        );
    })->create();
