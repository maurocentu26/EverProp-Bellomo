<?php

namespace Tests\Feature;

use Tests\TestCase;

final class ProductionEnvironmentTest extends TestCase
{
    public function test_simulation_routes_are_not_exposed(): void
    {
        foreach (['/setup-simulation-database', '/api/setup-simulation-database', '/api/v1/setup-simulation-database'] as $path) {
            $this->getJson($path)->assertNotFound();
        }
    }

    public function test_production_check_rejects_local_and_accepts_secure_configuration(): void
    {
        $this->artisan('everprop:production-check')->assertFailed();
        $this->app->detectEnvironment(fn () => 'production');
        config([
            'app.debug' => false, 'app.key' => 'base64:'.base64_encode(str_repeat('x', 32)),
            'app.url' => 'https://api.example.com', 'database.default' => 'mysql',
            'session.driver' => 'redis', 'cache.default' => 'redis', 'queue.default' => 'redis',
            'session.secure' => true, 'session.http_only' => true, 'session.encrypt' => true,
            'tenancy.hosts' => ['api.example.com' => 'bellomo'], 'tenancy.trusted_hosts' => ['api.example.com'],
            'tenancy.allow_local_resolver' => false, 'cors.allowed_origins' => ['https://app.example.com'],
        ]);
        $this->artisan('everprop:production-check')->assertSuccessful();
        config(['app.key' => 'REPLACE_WITH_EXISTING_PRODUCTION_KEY']);
        $this->artisan('everprop:production-check')->assertFailed();
    }
}
