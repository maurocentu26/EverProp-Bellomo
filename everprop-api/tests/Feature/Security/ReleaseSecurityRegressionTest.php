<?php

namespace Tests\Feature\Security;

use Illuminate\Console\Command;
use Tests\TestCase;

final class ReleaseSecurityRegressionTest extends TestCase
{
    public function test_simulation_database_setup_is_not_http_addressable(): void
    {
        $this->getJson('/setup-simulation-database')->assertNotFound();
        $this->getJson('/api/setup-simulation-database')->assertNotFound();
        $this->getJson('/api/v1/setup-simulation-database')->assertNotFound();
    }

    public function test_simulation_database_command_refuses_non_test_environments(): void
    {
        $originalEnvironment = $this->app->environment();
        $this->app->detectEnvironment(static fn (): string => 'production');

        try {
            $this->artisan('db:setup-simulation')
                ->expectsOutput('Simulation database setup is restricted to local and testing environments.')
                ->assertExitCode(Command::FAILURE);
        } finally {
            $this->app->detectEnvironment(static fn (): string => $originalEnvironment);
        }
    }

    public function test_stateful_api_routes_are_not_globally_exempted_from_csrf(): void
    {
        $bootstrap = file_get_contents(base_path('bootstrap/app.php'));

        self::assertIsString($bootstrap);
        self::assertStringNotContainsString("'api/v1/*'", $bootstrap);
    }
}
