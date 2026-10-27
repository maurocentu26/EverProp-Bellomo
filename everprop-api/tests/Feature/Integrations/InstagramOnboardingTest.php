<?php

namespace Tests\Feature\Integrations;

use App\Domain\Identity\Enums\RoleCode;
use App\Domain\Integrations\Services\IntegrationTokens;
use App\Domain\Tenancy\Models\Tenant;
use App\Models\User;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Http\Client\Factory;
use Illuminate\Http\Client\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use PHPUnit\Framework\Attributes\TestWith;
use Tests\Feature\Conversations\ConversationTestSupport;
use Tests\TestCase;

final class InstagramOnboardingTest extends TestCase
{
    use ConversationTestSupport, DatabaseTransactions;

    private const BASE = '/api/v1/admin/integrations/instagram';

    private const TOKEN = 'synthetic-long-lived-instagram-token';

    private const REDIRECT = 'http://localhost:5173/integrations/instagram/callback';

    protected function setUp(): void
    {
        parent::setUp();
        config(['services.meta.instagram_onboarding_enabled' => true, 'services.meta.instagram_app_id' => '111',
            'services.meta.instagram_app_secret' => 'synthetic-secret', 'services.meta.instagram_redirect_uri' => self::REDIRECT,
            'services.meta.graph_version' => 'v24.0', 'cache.default' => 'array', 'session.driver' => 'array', 'sanctum.stateful' => ['localhost:5173']]);
        Http::preventStrayRequests();
    }

    /** @return array{Tenant, User} */
    private function admin(RoleCode $role = RoleCode::TENANT_ADMIN): array
    {
        $tenant = Tenant::factory()->create();
        config(['tenancy.hosts' => ['localhost' => $tenant->slug]]);
        $user = $this->user($tenant, $role);
        $this->actingAs($user)->withSession([])->withCredentials()->withHeaders($this->tenantHeaders($tenant));

        return [$tenant, $user];
    }

    private function begin(): string
    {
        $url = $this->postJson(self::BASE.'/authorize')->assertOk()->json('data.authorization_url');
        parse_str(parse_url($url, PHP_URL_QUERY), $params);
        $this->assertSame('www.instagram.com', parse_url($url, PHP_URL_HOST));
        $this->assertSame(self::REDIRECT, $params['redirect_uri']);
        $this->assertSame('instagram_business_basic,instagram_business_manage_messages', $params['scope']);
        $this->assertMatchesRegularExpression('/^[a-f0-9]{64}$/', $params['state']);
        $this->withCookie(config('session.cookie'), app('session')->getId());

        return $params['state'];
    }

    /** @param array<string, mixed> $overrides */
    private function meta(array $overrides = []): void
    {
        Http::swap(new Factory);
        Http::preventStrayRequests();
        Http::fake($overrides + [
            'api.instagram.com/oauth/access_token' => Http::response(['data' => [['access_token' => 'short-token', 'user_id' => '987654321',
                'permissions' => 'instagram_business_basic,instagram_business_manage_messages']]]),
            'graph.instagram.com/access_token*' => Http::response(['access_token' => self::TOKEN, 'expires_in' => 5184000]),
            'graph.instagram.com/v24.0/me*' => Http::response(['id' => '987654321', 'user_id' => '123456', 'username' => 'synthetic_business']),
            'graph.instagram.com/v24.0/123456/subscribed_apps' => Http::response(['success' => true]),
            'graph.instagram.com/refresh_access_token*' => Http::response(['access_token' => 'refreshed-token', 'expires_in' => 5184000]),
        ]);
    }

    public function test_oauth_connects_once_and_lists_real_identity_expiry_without_secrets(): void
    {
        [$tenant] = $this->admin();
        $this->meta();
        $state = $this->begin();
        $result = $this->postJson(self::BASE.'/connect', ['state' => $state, 'code' => 'synthetic-code'])
            ->assertCreated()->assertJsonPath('data.username', 'synthetic_business');
        $id = $result->json('data.id');
        $integration = DB::table('integration_connections')->where('tenant_id', $tenant->id)->where('public_id', $id)->first();
        $this->assertSame(self::TOKEN, app(IntegrationTokens::class)->forSending($tenant->id, $integration->id));
        $this->assertNotSame(self::TOKEN, $integration->access_token_ciphertext);
        $this->assertNotNull($integration->token_expires_at);
        $list = $this->getJson(self::BASE.'/config')->assertOk()->assertJsonPath('data.connections.0.username', 'synthetic_business')
            ->assertJsonPath('data.connections.0.token_status', 'VALID');
        foreach ([$result, $list] as $response) {
            $this->assertStringNotContainsString(self::TOKEN, $response->getContent());
            $this->assertStringNotContainsString('synthetic-secret', $response->getContent());
        }
        Http::assertSent(fn (Request $r) => str_contains($r->url(), '/subscribed_apps') && $r['subscribed_fields'] === 'messages,messaging_seen'
            && $r->hasHeader('Authorization', 'Bearer '.self::TOKEN));
        $this->postJson(self::BASE.'/connect', ['state' => $state, 'code' => 'synthetic-code'])->assertStatus(422)->assertJsonPath('error.code', 'INVALID_STATE');
        Http::assertSentCount(4);
        $this->assertDatabaseHas('audit_logs', ['tenant_id' => $tenant->id, 'action_code' => 'INSTAGRAM_CONNECTED']);
    }

    public function test_state_is_bound_to_actor_tenant_session_and_ttl(): void
    {
        [$tenant] = $this->admin();
        $state = $this->begin();
        $other = $this->user($tenant, RoleCode::TENANT_ADMIN);
        $this->actingAs($other)->postJson(self::BASE.'/connect', ['state' => $state, 'code' => 'code'])->assertStatus(422);
        [$b] = $this->admin();
        $this->postJson(self::BASE.'/connect', ['state' => $state, 'code' => 'code'])->assertStatus(422);
        $this->assertNotSame($tenant->id, $b->id);
        $fresh = $this->begin();
        $this->travel(11)->minutes();
        $this->postJson(self::BASE.'/connect', ['state' => $fresh, 'code' => 'code'])->assertStatus(422);
        Http::assertNothingSent();
    }

    public function test_cancel_failure_and_denied_permissions_store_nothing_and_do_not_echo_provider(): void
    {
        [$tenant] = $this->admin();
        $state = $this->begin();
        $this->postJson(self::BASE.'/connect', ['state' => $state, 'error' => 'access_denied'])->assertStatus(422)->assertJsonPath('error.code', 'CANCELLED');
        Http::assertNothingSent();
        foreach ([Http::response(['error_message' => 'private-provider-details'], 400),
            Http::response(['data' => [['access_token' => 'short-token', 'user_id' => '123456', 'permissions' => 'instagram_business_basic']]])] as $exchange) {
            $this->meta(['api.instagram.com/oauth/access_token' => $exchange]);
            $state = $this->begin();
            $response = $this->postJson(self::BASE.'/connect', ['state' => $state, 'code' => 'code']);
            $this->assertContains($response->status(), [422, 502]);
            $this->assertStringNotContainsString('private-provider-details', $response->getContent());
        }
        $this->assertDatabaseMissing('channel_accounts', ['tenant_id' => $tenant->id, 'channel_type' => 'INSTAGRAM_DM']);
    }

    public function test_reconnection_preserves_channel_but_never_reassigns_another_tenants_account(): void
    {
        [$tenant] = $this->admin();
        $this->meta();
        $first = $this->postJson(self::BASE.'/connect', ['state' => $this->begin(), 'code' => 'one'])->assertCreated()->json('data.id');
        $this->postJson(self::BASE.'/connect', ['state' => $this->begin(), 'code' => 'two'])->assertCreated()->assertJsonPath('data.id', $first);
        [$other] = $this->admin();
        $this->postJson(self::BASE.'/connect', ['state' => $this->begin(), 'code' => 'three'])->assertStatus(409);
        $this->assertSame(1, DB::table('channel_accounts')->where('provider_account_id', '123456')->count());
        $this->assertDatabaseMissing('channel_accounts', ['tenant_id' => $other->id, 'channel_type' => 'INSTAGRAM_DM']);
        $this->assertDatabaseHas('channel_accounts', ['tenant_id' => $tenant->id, 'provider_account_id' => '123456']);
        $this->getJson(self::BASE.'/config')->assertOk()->assertJsonPath('data.connections', []);
        $this->postJson(self::BASE.'/'.$first.'/refresh')->assertNotFound();
    }

    public function test_disabled_or_non_admin_cannot_start_and_untrusted_callback_is_refused(): void
    {
        foreach ([RoleCode::SALES_MANAGER, RoleCode::READ_ONLY, RoleCode::SALES_ADVISOR] as $role) {
            $this->admin($role);
            $this->postJson(self::BASE.'/authorize')->assertForbidden();
            $this->getJson(self::BASE.'/config')->assertForbidden();
        }
        $this->admin();
        config(['services.meta.instagram_onboarding_enabled' => false]);
        $this->postJson(self::BASE.'/authorize')->assertStatus(503);
        $this->getJson(self::BASE.'/config')->assertOk()->assertJsonPath('data.enabled', false);
        config(['services.meta.instagram_onboarding_enabled' => true, 'services.meta.instagram_redirect_uri' => 'https://attacker.example/integrations/instagram/callback']);
        $this->postJson(self::BASE.'/authorize')->assertStatus(503);
        Http::assertNothingSent();
    }

    public function test_refresh_requires_a_known_unexpired_token_at_least_one_day_old(): void
    {
        [$tenant] = $this->admin();
        $this->meta();
        $id = $this->postJson(self::BASE.'/connect', ['state' => $this->begin(), 'code' => 'one'])->assertCreated()->json('data.id');
        $this->postJson(self::BASE.'/'.$id.'/refresh')->assertStatus(422)->assertJsonPath('error.code', 'REFRESH_TOO_EARLY');
        $this->travel(2)->days();
        $this->postJson(self::BASE.'/'.$id.'/refresh')->assertOk();
        $row = DB::table('integration_connections')->where('tenant_id', $tenant->id)->where('public_id', $id)->first();
        $this->assertSame('refreshed-token', app(IntegrationTokens::class)->forSending($tenant->id, $row->id));
        DB::table('integration_connections')->where('tenant_id', $tenant->id)->where('public_id', $id)->update(['token_expires_at' => null]);
        $this->getJson(self::BASE.'/config')->assertOk()->assertJsonPath('data.connections.0.token_status', 'UNKNOWN');
        $this->postJson(self::BASE.'/'.$id.'/refresh')->assertStatus(422)->assertJsonPath('error.code', 'RECONNECT_REQUIRED');
    }

    public function test_another_browser_session_cannot_consume_the_same_users_state(): void
    {
        $this->admin();
        $state = $this->begin();
        $this->withCookie(config('session.cookie'), str_repeat('x', 40));
        $this->postJson(self::BASE.'/connect', ['state' => $state, 'code' => 'code'])->assertStatus(422)->assertJsonPath('error.code', 'INVALID_STATE');
        Http::assertNothingSent();
    }

    public function test_busy_state_lock_and_two_consumers_cannot_exchange_twice(): void
    {
        config(['cache.default' => 'redis']);
        [$tenant, $user] = $this->admin();
        $this->meta();
        $state = $this->begin();
        $lock = Cache::lock('ig:oauth:'.$tenant->id.':'.$user->id.':'.hash('sha256', $state).':consume', 10);
        $this->assertTrue($lock->get());
        try {
            $this->postJson(self::BASE.'/connect', ['state' => $state, 'code' => 'code'])->assertStatus(422);
            Http::assertNothingSent();
        } finally {
            $lock->release();
        }
        $this->postJson(self::BASE.'/connect', ['state' => $state, 'code' => 'code'])->assertCreated();
        $this->postJson(self::BASE.'/connect', ['state' => $state, 'code' => 'code'])->assertStatus(422);
        Http::assertSentCount(4);
    }

    #[TestWith(['identity'])]
    #[TestWith(['app_identity'])]
    #[TestWith(['subscription'])]
    #[TestWith(['expiry'])]
    #[TestWith(['connection'])]
    public function test_identity_subscription_and_expiry_fail_closed_preserving_the_existing_connection(string $failure): void
    {
        [$tenant] = $this->admin();
        $this->meta();
        $id = $this->postJson(self::BASE.'/connect', ['state' => $this->begin(), 'code' => 'first'])->assertCreated()->json('data.id');
        $row = DB::table('integration_connections')->where('tenant_id', $tenant->id)->where('public_id', $id)->first();
        $override = match ($failure) {
            'identity' => ['graph.instagram.com/v24.0/me*' => Http::response(['user_id' => '999', 'username' => 'wrong'])],
            'app_identity' => ['graph.instagram.com/v24.0/me*' => Http::response(['id' => '999', 'user_id' => '123456', 'username' => 'synthetic_business'])],
            'subscription' => ['graph.instagram.com/v24.0/123456/subscribed_apps' => Http::response(['success' => false])],
            'expiry' => ['graph.instagram.com/access_token*' => Http::response(['access_token' => 'invalid-expiry'])],
            'connection' => ['api.instagram.com/oauth/access_token' => Http::failedConnection()],
            default => throw new \LogicException('Unknown Instagram failure scenario.'),
        };
        $this->meta($override);
        $this->postJson(self::BASE.'/connect', ['state' => $this->begin(), 'code' => 'retry'])->assertStatus(502);
        $this->assertSame($row->access_token_ciphertext, DB::table('integration_connections')->where('tenant_id', $tenant->id)->where('id', $row->id)->value('access_token_ciphertext'));
        $this->assertSame(1, DB::table('channel_accounts')->where('tenant_id', $tenant->id)->where('channel_type', 'INSTAGRAM_DM')->count());
    }

    public function test_refresh_never_overwrites_a_revocation_or_a_newer_token(): void
    {
        [$tenant] = $this->admin();
        foreach (['revoke', 'rotate'] as $change) {
            $this->meta();
            $id = $this->postJson(self::BASE.'/connect', ['state' => $this->begin(), 'code' => 'code'])->assertCreated()->json('data.id');
            $row = DB::table('integration_connections')->where('tenant_id', $tenant->id)->where('public_id', $id)->first();
            $this->travel(2)->days();
            Http::swap(new Factory);
            Http::preventStrayRequests();
            Http::fake(['graph.instagram.com/refresh_access_token*' => function () use ($tenant, $row, $change) {
                if ($change === 'revoke') {
                    DB::table('integration_connections')->where('tenant_id', $tenant->id)->where('id', $row->id)->update(['status' => 'REVOKED', 'access_token_ciphertext' => null]);
                } else {
                    app(IntegrationTokens::class)->store($tenant->id, $row->id, 'newer-token', CarbonImmutable::now()->addDays(60));
                }

                return Http::response(['access_token' => 'obsolete-refreshed-token', 'expires_in' => 5184000]);
            }]);
            $this->postJson(self::BASE.'/'.$id.'/refresh')->assertStatus(409)->assertJsonPath('error.code', 'CONNECTION_CHANGED');
            $this->assertSame($change === 'revoke' ? null : 'newer-token', app(IntegrationTokens::class)->forSending($tenant->id, $row->id));
        }
    }

    public function test_permission_or_tenant_revoked_during_meta_http_prevents_persistence(): void
    {
        foreach (['user', 'tenant'] as $changed) {
            [$tenant, $user] = $this->admin();
            $this->meta(['graph.instagram.com/v24.0/123456/subscribed_apps' => function () use ($tenant, $user, $changed) {
                DB::table($changed === 'user' ? 'users' : 'tenants')->where('id', $changed === 'user' ? $user->id : $tenant->id)
                    ->update(['status' => $changed === 'user' ? 'DISABLED' : 'SUSPENDED']);

                return Http::response(['success' => true]);
            }]);
            $this->postJson(self::BASE.'/connect', ['state' => $this->begin(), 'code' => 'code'])->assertForbidden();
            $this->assertDatabaseMissing('channel_accounts', ['tenant_id' => $tenant->id, 'channel_type' => 'INSTAGRAM_DM']);
        }
    }
}
