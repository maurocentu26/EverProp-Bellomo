<?php

namespace Tests\Feature\Identity;

use App\Domain\Identity\Enums\RoleCode;
use App\Domain\Tenancy\Models\Tenant;
use App\Models\User;
use Illuminate\Foundation\Testing\DatabaseTransactions;
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
