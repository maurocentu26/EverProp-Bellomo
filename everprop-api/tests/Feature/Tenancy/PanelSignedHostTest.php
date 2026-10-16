<?php

namespace Tests\Feature\Tenancy;

use App\Domain\Identity\Enums\RoleCode;
use App\Domain\Tenancy\Exceptions\TenantNotResolved;
use App\Domain\Tenancy\Models\Tenant;
use App\Domain\Tenancy\Resolvers\TrustedTenantResolver;
use App\Models\User;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\RateLimiter;
use Tests\TestCase;

/** S02: one API serves many tenant domains through the panel's signed host channel. */
final class PanelSignedHostTest extends TestCase
{
    use DatabaseTransactions;

    private const KEY = 'test-panel-key';

    private const PASSWORD_A = 'EverProp-password-of-tenant-a';

    private const PASSWORD_B = 'EverProp-password-of-tenant-b';

    private Tenant $a;

    private Tenant $b;

    protected function setUp(): void
    {
        parent::setUp();
        RateLimiter::clear('login|127.0.0.1');
        $this->a = Tenant::factory()->create();
        $this->b = Tenant::factory()->create();
        config([
            'tenancy.panel_signing_key' => self::KEY,
            'tenancy.panel_signature_ttl' => 60,
            'tenancy.hosts' => ['panel-a.test' => $this->a->slug, 'hierros.panel.test' => $this->b->public_id, 'empty.panel.test' => '', 'localhost' => $this->a->slug],
        ]);
    }

    /** @param array<string, string> $headers */
    private function request(array $headers = [], ?User $user = null): Request
    {
        $request = Request::create('https://api.panel.test/api/v1/auth/me');
        foreach ($headers as $name => $value) {
            $request->headers->set($name, $value);
        }
        $request->setUserResolver(fn () => $user);

        return $request;
    }

    /** @return array<string, string> */
    private function signed(string $host, ?int $at = null, string $key = self::KEY): array
    {
        $ts = (string) ($at ?? time());

        return ['X-Eversys-Panel-Host' => $host, 'X-Eversys-Panel-Timestamp' => $ts,
            'X-Eversys-Panel-Signature' => hash_hmac('sha256', "eversys-panel-host-v1\n".$host."\n".$ts, $key)];
    }

    private function resolve(Request $request): Tenant
    {
        return app(TrustedTenantResolver::class)->resolve($request);
    }

    private function assertRejected(Request $request, string $why): void
    {
        try {
            $this->resolve($request);
            $this->fail('Expected rejection: '.$why);
        } catch (TenantNotResolved) {
            $this->addToAssertionCount(1);
        }
    }

    public function test_the_signature_matches_the_panel_implementation(): void
    {
        // Same vector as everprop-public/tests/tenant-signature.test.mjs.
        $this->assertSame('e7caf0c4a65532e66a13ebab806916dd9919b60c9459c4897570ce2aadb7bece',
            hash_hmac('sha256', "eversys-panel-host-v1\nhierros.panel.test\n1791200000", self::KEY));
    }

    public function test_a_signed_panel_host_selects_its_tenant(): void
    {
        $this->assertTrue($this->resolve($this->request($this->signed('hierros.panel.test')))->is($this->b));
        $this->assertTrue($this->resolve($this->request($this->signed('PANEL-A.test')))->is($this->a), 'host is case-insensitive');
    }

    public function test_forged_stale_unknown_or_empty_signed_hosts_are_rejected(): void
    {
        $this->assertRejected($this->request(['X-Eversys-Panel-Signature' => 'x'] + $this->signed('hierros.panel.test')), 'bad signature');
        $this->assertRejected($this->request($this->signed('hierros.panel.test', time() - 61)), 'stale');
        $this->assertRejected($this->request($this->signed('hierros.panel.test', time() + 61)), 'from the future');
        $this->assertRejected($this->request($this->signed('hierros.panel.test', key: 'other-key')), 'wrong key');
        $this->assertRejected($this->request($this->signed('unknown.panel.test')), 'host not mapped');
        $this->assertRejected($this->request($this->signed('empty.panel.test'), User::factory()->for($this->a)->create()), 'empty selector never falls back to the session');
        $this->assertRejected($this->request(['X-Eversys-Panel-Host' => 'hierros.panel.test']), 'partial headers');
        $this->assertRejected($this->request($this->signed('hierros.panel.test') + ['X-Everprop-Tenant' => $this->a->slug]), 'local header of another tenant');
        config(['tenancy.panel_signing_key' => '']);
        $this->assertRejected($this->request($this->signed('hierros.panel.test')), 'channel disabled');
    }

    public function test_outside_local_a_loopback_or_ip_host_is_never_a_tenant_domain(): void
    {
        $this->assertTrue($this->resolve($this->request($this->signed('localhost')))->is($this->a), 'allowed while testing');
        $this->app['env'] = 'production';
        try {
            // What a panel under `next start` would sign if it used its own hostname.
            $this->assertRejected($this->request($this->signed('localhost')), 'loopback in production');
            config(['tenancy.hosts' => ['127.0.0.1' => $this->a->slug, 'hierros.panel.test' => $this->b->public_id]]);
            $this->assertRejected($this->request($this->signed('127.0.0.1')), 'IP in production');
            $this->assertTrue($this->resolve($this->request($this->signed('hierros.panel.test')))->is($this->b), 'real domains still work');
        } finally {
            $this->app['env'] = 'testing';
        }
    }

    public function test_a_session_from_another_tenant_cannot_use_a_signed_host(): void
    {
        $userOfA = User::factory()->for($this->a)->create();

        $this->assertTrue($this->resolve($this->request($this->signed('panel-a.test'), $userOfA))->is($this->a));
        $this->assertRejected($this->request($this->signed('hierros.panel.test'), $userOfA), 'host of B with session of A');
        $this->assertRejected($this->request($this->signed('unknown.panel.test'), $userOfA), 'unknown host never falls back to the session');
    }

    public function test_without_panel_headers_the_request_host_still_decides(): void
    {
        config(['tenancy.hosts' => ['api.panel.test' => $this->a->slug]]);

        $this->assertTrue($this->resolve($this->request())->is($this->a));
    }

    public function test_routes_follow_the_signed_host(): void
    {
        $email = 'same-person@e2e.invalid';
        User::factory()->for($this->a)->create(['email' => $email, 'role_code' => RoleCode::TENANT_ADMIN->value, 'password_hash' => self::PASSWORD_A]);
        $userOfB = User::factory()->for($this->b)->create(['email' => $email, 'role_code' => RoleCode::TENANT_ADMIN->value, 'password_hash' => self::PASSWORD_B]);
        $onB = $this->signed('hierros.panel.test') + ['Origin' => 'http://localhost:5173'];

        // Same email in both tenants: on B's domain only B's password works, and the session is B's.
        $this->withHeaders($onB)->postJson('/api/v1/auth/login', ['email' => $email, 'password' => self::PASSWORD_A])->assertStatus(422);
        $this->withHeaders($onB)->postJson('/api/v1/auth/login', ['email' => $email, 'password' => self::PASSWORD_B])
            ->assertOk()->assertJsonPath('data.tenant.id', $this->b->public_id);
        $this->assertAuthenticatedAs($userOfB);
    }

    public function test_an_admin_of_another_tenant_gets_a_generic_not_found_on_a_signed_domain(): void
    {
        $this->actingAs(User::factory()->for($this->a)->create(['role_code' => RoleCode::TENANT_ADMIN->value]));

        $this->withHeaders($this->signed('hierros.panel.test'))->getJson('/api/v1/auth/me')->assertNotFound()->assertJsonMissingPath('data');
        $this->withHeaders($this->signed('panel-a.test'))->getJson('/api/v1/auth/me')->assertOk();
    }
}
