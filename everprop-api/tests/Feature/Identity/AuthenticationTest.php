<?php

namespace Tests\Feature\Identity;

use App\Domain\Identity\Enums\RoleCode;
use App\Domain\Tenancy\Models\Tenant;
use App\Models\User;
use Illuminate\Auth\SessionGuard;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Http\Request;
use Illuminate\Session\Middleware\StartSession;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\RateLimiter;
use Tests\TestCase;

final class AuthenticationTest extends TestCase
{
    use DatabaseTransactions;

    private const PASSWORD = 'EverProp-test-password-42';

    protected function setUp(): void
    {
        parent::setUp();

        RateLimiter::clear('login|127.0.0.1');
        RateLimiter::clear(md5('loginlogin|127.0.0.1'));
    }

    public function test_valid_credentials_create_a_tenant_bound_session(): void
    {
        [$tenant, $user] = $this->identity();

        $response = $this->withHeaders($this->tenantHeaders($tenant))
            ->postJson('/api/v1/auth/login', [
                'email' => $user->email,
                'password' => self::PASSWORD,
            ]);

        $response->assertOk()
            ->assertJsonPath('data.id', $user->public_id)
            ->assertJsonPath('data.tenant.id', $tenant->public_id);
        $this->assertAuthenticatedAs($user);
    }

    public function test_invalid_credentials_are_rejected_generically(): void
    {
        [$tenant, $user] = $this->identity();

        $this->withHeaders($this->tenantHeaders($tenant))
            ->postJson('/api/v1/auth/login', [
                'email' => $user->email,
                'password' => 'incorrect-password',
            ])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('email');

        $this->assertGuest();
    }

    public function test_anonymous_users_cannot_access_private_routes(): void
    {
        [$tenant] = $this->identity();

        $this->withHeaders($this->tenantHeaders($tenant))
            ->getJson('/api/v1/auth/me')
            ->assertUnauthorized();
    }

    public function test_logout_invalidates_the_authenticated_session(): void
    {
        [$tenant, $user] = $this->identity();
        $headers = $this->tenantHeaders($tenant);

        $this->withHeaders($headers)->postJson('/api/v1/auth/login', [
            'email' => $user->email,
            'password' => self::PASSWORD,
        ])->assertOk();

        $this->withHeaders($headers)->postJson('/api/v1/auth/logout')->assertNoContent();
        Auth::forgetGuards();
        $this->withHeaders($headers)->getJson('/api/v1/auth/me')->assertUnauthorized();
    }

    public function test_a_late_request_cannot_restore_a_logged_out_session(): void
    {
        $this->withCredentials();
        [$tenant, $user] = $this->identity();
        $headers = $this->tenantHeaders($tenant);
        $this->withHeaders($headers)->postJson('/api/v1/auth/login', [
            'email' => $user->email, 'password' => self::PASSWORD,
        ])->assertOk();

        // Capture exactly what a concurrent request read before logout. Redis storage is shared.
        $lateRequest = clone app('session')->driver();
        $oldId = $lateRequest->getId();
        $cookieName = $lateRequest->getName();
        $guard = Auth::guard('web');
        $this->assertInstanceOf(SessionGuard::class, $guard);
        $key = $guard->getName();
        $this->assertTrue($lateRequest->has($key));
        $this->withCookie($cookieName, $oldId)->withHeaders($headers)
            ->postJson('/api/v1/auth/logout')->assertNoContent();
        $lateRequest->save(); // Arrives after logout, without sleeps or scheduler assumptions.

        Auth::forgetGuards();
        app('session')->forgetDrivers();
        $this->app->forgetInstance('session.store');
        // StartSession receives decrypted cookies. Exercise that boundary directly as well
        // as the HTTP endpoint, so the test cannot pass merely by rejecting a malformed cookie.
        $request = Request::create('/', 'GET', [], [$cookieName => $oldId]);
        $replayed = app(StartSession::class)->getSession($request);
        $replayed->start();
        $this->assertFalse($replayed->has($key), 'A late write must not restore authentication');
        $this->withCookie($cookieName, $oldId)->withHeaders($headers)
            ->getJson('/api/v1/auth/me')->assertUnauthorized();

        // A fresh CSRF session can immediately log in again, including from an old-cookie tab.
        $this->withHeaders($headers)->get('/sanctum/csrf-cookie')->assertNoContent();
        Auth::forgetGuards();
        $this->withHeaders($headers)->postJson('/api/v1/auth/login', [
            'email' => $user->email, 'password' => self::PASSWORD,
        ])->assertOk();
        $lateRequest->getHandler()->destroy($oldId);
    }

    public function test_a_session_cannot_be_reused_for_another_tenant(): void
    {
        [$tenantA, $userA] = $this->identity();
        [$tenantB] = $this->identity();

        $this->actingAs($userA);

        $this->withHeaders($this->tenantHeaders($tenantB))
            ->getJson('/api/v1/auth/me')
            ->assertNotFound();

        self::assertNotSame($tenantA->id, $tenantB->id);
    }

    public function test_client_cannot_select_tenant_in_login_payload(): void
    {
        [$tenant, $user] = $this->identity();

        $this->withHeaders($this->tenantHeaders($tenant))
            ->postJson('/api/v1/auth/login', [
                'email' => $user->email,
                'password' => self::PASSWORD,
                'tenant_id' => $tenant->id,
            ])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('tenant_id');
    }

    /** @return array{Tenant, User} */
    private function identity(): array
    {
        $tenant = Tenant::factory()->create();
        $user = User::factory()->for($tenant)->create([
            'role_code' => RoleCode::TENANT_ADMIN->value,
            'password_hash' => self::PASSWORD,
        ]);

        return [$tenant, $user];
    }

    /** @return array<string, string> */
    private function tenantHeaders(Tenant $tenant): array
    {
        return [
            'X-Everprop-Tenant' => $tenant->public_id,
            'Origin' => 'http://localhost:5173',
        ];
    }
}
