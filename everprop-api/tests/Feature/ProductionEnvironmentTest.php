<?php

namespace Tests\Feature;

use Minishlink\WebPush\VAPID;
use Tests\TestCase;

final class ProductionEnvironmentTest extends TestCase
{
    public function test_simulation_routes_are_not_exposed(): void
    {
        foreach (['/setup-simulation-database', '/api/setup-simulation-database', '/api/v1/setup-simulation-database'] as $path) {
            $this->getJson($path)->assertNotFound();
        }
    }

    public function test_automatic_gemini_startup_requires_the_existing_staging_provider_gate(): void
    {
        $this->app->detectEnvironment(fn () => 'production');
        config([
            'app.debug' => false, 'app.key' => 'base64:'.base64_encode(str_repeat('x', 32)),
            'app.url' => 'https://api.example.com', 'database.default' => 'mysql',
            'session.driver' => 'redis', 'cache.default' => 'redis', 'queue.default' => 'redis',
            'queue.connections.redis.retry_after' => 240,
            'session.secure' => true, 'session.http_only' => true, 'session.encrypt' => true,
            'tenancy.hosts' => ['api.example.com' => 'test'], 'tenancy.trusted_hosts' => ['api.example.com'],
            'tenancy.allow_local_resolver' => false, 'cors.allowed_origins' => ['https://app.example.com'],
            'conversations.ai_enabled' => true, 'agent.llm_provider' => 'gemini', 'agent.llm_model' => 'synthetic-model',
            'services.gemini.key' => 'synthetic-key', 'services.gemini.railway_environment' => 'staging',
            'services.gemini.staging_enabled' => true, 'services.gemini.input_rate' => 0.25,
            'services.gemini.output_rate' => 1.5, 'services.gemini.local_budget_usd' => 10,
        ]);
        $this->artisan('everprop:production-check')->expectsOutputToContain('OK Assistant: LLM provider configured')->assertSuccessful();
        foreach (['services.gemini.railway_environment' => 'production', 'services.gemini.staging_enabled' => false,
            'services.gemini.key' => '', 'services.gemini.input_rate' => 0, 'services.gemini.output_rate' => 0,
            'services.gemini.local_budget_usd' => 0, 'agent.llm_model' => ''] as $key => $invalid) {
            $before = config($key);
            config([$key => $invalid]);
            $this->artisan('everprop:production-check')->expectsOutputToContain('FAIL Assistant: LLM provider configured')->assertFailed();
            config([$key => $before]);
        }
        config(['agent.llm_provider' => 'anthropic', 'services.anthropic.key' => 'synthetic-key']);
        $this->artisan('everprop:production-check')->assertSuccessful();
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
        $this->artisan('everprop:production-check --connections')
            ->expectsOutputToContain('OK Schema: collection email sequence')
            ->expectsOutputToContain('OK Schema: follow-up alerts and activity')
            ->expectsOutputToContain('OK Schema: project landing')
            ->expectsOutputToContain('OK Schema: project intakes')
            ->assertSuccessful();
        config(['webpush.public_key' => null, 'webpush.private_key' => null, 'webpush.subject' => null]);
        $this->artisan('everprop:production-check --webpush')->assertFailed();
        $keys = VAPID::createVapidKeys();
        config(['webpush.public_key' => $keys['publicKey'], 'webpush.private_key' => $keys['privateKey'],
            'webpush.subject' => 'mailto:qa@example.invalid', 'webpush.connection' => 'database']);
        $this->artisan('everprop:production-check --webpush')->assertSuccessful();
        config(['webpush.connection' => 'sync']);
        $this->artisan('everprop:production-check --webpush')->assertFailed();
        config(['webpush.connection' => 'database', 'webpush.subject' => 'invalid-subject']);
        $this->artisan('everprop:production-check --webpush')->assertFailed();
        config(['session.driver' => 'database', 'cache.default' => 'database', 'queue.default' => 'sync']);
        $this->artisan('everprop:production-check')->assertSuccessful();
        config(['session.driver' => 'file']);
        $this->artisan('everprop:production-check')->assertFailed();
        config(['session.driver' => 'database']);
        config(['app.key' => 'REPLACE_WITH_EXISTING_PRODUCTION_KEY']);
        $this->artisan('everprop:production-check')->assertFailed();
    }
}
