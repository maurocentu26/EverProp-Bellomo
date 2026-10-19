<?php

namespace Tests\Feature\Identity;

use App\Domain\Identity\Http\Middleware\VerifyPasswordSession;
use App\Domain\Tenancy\Models\Tenant;
use App\Models\User;
use Illuminate\Auth\AuthenticationException;
use Illuminate\Cache\ArrayStore;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Http\Client\Factory;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Password;
use Illuminate\Support\Facades\RateLimiter;
use Tests\TestCase;

final class PasswordRecoveryTest extends TestCase
{
    use DatabaseTransactions;

    protected function setUp(): void
    {
        parent::setUp();
        config(['auth.defaults.passwords' => 'recovery', 'cache.default' => 'array', 'services.resend.key' => 're_test_only',
            'mail.from.address' => 'access@example.test', 'mail.from.name' => 'EverProp']);
        Http::preventStrayRequests();
        Http::fake(['https://api.resend.com/emails' => Http::response(['id' => 'test-email-id'])]);
        RateLimiter::clear(md5('login'.'login|127.0.0.1'));
    }

    /** @return array{Tenant, User} */
    private function identity(string $email = 'recovery@example.test'): array
    {
        $tenant = Tenant::factory()->create();
        $user = User::factory()->for($tenant)->create(['email' => $email, 'password_hash' => 'OriginalPassword123']);
        config(['auth.password_reset_frontends.'.$tenant->slug => 'https://'.$tenant->slug.'.example.test']);
        RateLimiter::clear(md5('password-recovery'.'password-recovery|'.$tenant->id.'|127.0.0.1'));

        return [$tenant, $user];
    }

    private function useTenant(Tenant $tenant): self
    {
        return $this->withHeaders(['X-Everprop-Tenant' => $tenant->public_id, 'Origin' => 'http://localhost:5173']);
    }

    /** @return array<string, string> */
    private function resetData(User $user, string $token): array
    {
        return ['email' => $user->email, 'token' => $token, 'password' => 'ReplacementPassword456', 'password_confirmation' => 'ReplacementPassword456'];
    }

    public function test_request_sends_single_use_link_over_https_without_enumerating_or_returning_token(): void
    {
        [$tenant, $user] = $this->identity();
        $response = $this->useTenant($tenant)->postJson('/api/v1/auth/forgot-password', ['email' => strtoupper($user->email)])->assertOk();
        $this->postJson('/api/v1/auth/forgot-password', ['email' => 'missing@example.test'])->assertOk()->assertExactJson($response->json());
        Http::assertSentCount(1);
        $request = Http::recorded()->first()[0];
        self::assertSame('https://api.resend.com/emails', $request->url());
        self::assertSame('POST', $request->method());
        self::assertSame('Bearer re_test_only', $request->header('Authorization')[0]);
        self::assertSame([$user->email], $request['to']);
        self::assertSame('EverProp <access@example.test>', $request['from']);
        $body = $request['text'];
        self::assertIsString($body);
        self::assertStringContainsString('https://'.$tenant->slug.'.example.test/recuperar#', $body);
        preg_match('/token=([a-f0-9]{64})/', $body, $match);
        self::assertArrayHasKey(1, $match);
        self::assertStringNotContainsString($match[1], $response->getContent());
        $store = Cache::getStore();
        self::assertInstanceOf(ArrayStore::class, $store);
        self::assertStringNotContainsString($match[1], (string) json_encode($store->all()));
        $this->postJson('/api/v1/auth/reset-password', $this->resetData($user, $match[1]))->assertOk();
        self::assertTrue(Hash::check('ReplacementPassword456', $user->fresh()->password_hash));
        $this->postJson('/api/v1/auth/reset-password', $this->resetData($user, $match[1]))->assertUnprocessable();
    }

    public function test_same_email_in_two_tenants_cannot_share_a_token(): void
    {
        [$tenantA, $userA] = $this->identity();
        [$tenantB, $userB] = $this->identity();
        $token = Password::createToken($userA);
        $this->useTenant($tenantB)->postJson('/api/v1/auth/reset-password', $this->resetData($userB, $token))->assertUnprocessable();
        self::assertTrue(Hash::check('OriginalPassword123', $userB->fresh()->password_hash));
        $this->useTenant($tenantA)->postJson('/api/v1/auth/reset-password', $this->resetData($userA, $token))->assertOk();
    }

    public function test_expired_changed_and_invalid_password_tokens_do_not_modify_the_account(): void
    {
        [$tenant, $user] = $this->identity();
        $this->useTenant($tenant);
        $token = Password::createToken($user);
        $this->postJson('/api/v1/auth/reset-password', array_replace($this->resetData($user, $token), ['password_confirmation' => 'different']))->assertUnprocessable();
        $this->postJson('/api/v1/auth/reset-password', $this->resetData($user, $token) + ['tenant_id' => $tenant->id])->assertUnprocessable();
        $this->travel(61)->minutes();
        $this->postJson('/api/v1/auth/reset-password', $this->resetData($user, $token))->assertUnprocessable();
        $this->travelBack();
        $user->forceFill(['password_hash' => 'OtherChangedPassword789'])->save();
        $this->postJson('/api/v1/auth/reset-password', $this->resetData($user, $token))->assertUnprocessable();
        self::assertTrue(Hash::check('OtherChangedPassword789', $user->fresh()->password_hash));
    }

    public function test_paused_accounts_and_delivery_failure_do_not_expose_account_existence(): void
    {
        [$tenant, $user] = $this->identity();
        $user->forceFill(['status' => 'PAUSED'])->save();
        $token = Password::createToken($user);
        $response = $this->useTenant($tenant)->postJson('/api/v1/auth/forgot-password', ['email' => $user->email])->assertOk();
        Http::assertNothingSent();
        $this->postJson('/api/v1/auth/reset-password', $this->resetData($user, $token))->assertUnprocessable();
        $user->forceFill(['status' => 'ACTIVE'])->save();
        Password::deleteToken($user);
        Log::shouldReceive('warning')->once()->with('password_recovery_delivery_failed', ['tenant_id' => $tenant->id]);
        Http::fake(fn () => throw new \RuntimeException('secret-provider-detail'));
        $this->postJson('/api/v1/auth/forgot-password', ['email' => $user->email])->assertOk()->assertExactJson($response->json());
    }

    public function test_resend_rejection_or_missing_acknowledgement_is_logged_without_secrets(): void
    {
        [$tenant, $user] = $this->identity();
        $this->useTenant($tenant);
        Log::shouldReceive('warning')->twice()->with('password_recovery_delivery_failed', ['tenant_id' => $tenant->id]);
        foreach ([Http::response(['name' => 'rate_limit_exceeded', 'message' => 'private-provider-detail'], 429), Http::response([])] as $response) {
            Password::deleteToken($user);
            Http::swap(new Factory);
            Http::preventStrayRequests();
            Http::fake(['https://api.resend.com/emails' => $response]);
            $this->postJson('/api/v1/auth/forgot-password', ['email' => $user->email])->assertOk()
                ->assertJsonMissingPath('token');
        }
    }

    public function test_missing_resend_key_fails_closed_and_requests_are_limited(): void
    {
        [$tenant] = $this->identity();
        config(['services.resend.key' => null]);
        $this->useTenant($tenant)->postJson('/api/v1/auth/forgot-password', ['email' => 'missing@example.test'])->assertStatus(503);
        config(['services.resend.key' => 're_test_only']);
        for ($attempt = 0; $attempt < 4; $attempt++) {
            $this->postJson('/api/v1/auth/forgot-password', ['email' => 'missing@example.test'])->assertOk();
        }
        $this->postJson('/api/v1/auth/forgot-password', ['email' => 'missing@example.test'])->assertTooManyRequests();
        Http::assertNothingSent();
    }

    public function test_old_session_is_rejected_after_password_reset(): void
    {
        [$tenant, $user] = $this->identity();
        $this->useTenant($tenant)->postJson('/api/v1/auth/login', ['email' => $user->email, 'password' => 'OriginalPassword123'])->assertOk();
        $oldSession = clone app('session')->driver();
        self::assertTrue($oldSession->has('password_hash_web'));
        $token = Password::createToken($user);
        $this->postJson('/api/v1/auth/reset-password', $this->resetData($user, $token))->assertOk();
        $oldSession->save();
        Auth::forgetGuards();
        $freshUser = $user->fresh();
        Auth::guard('web')->setUser($freshUser);
        // Exercise the decrypted session boundary so a malformed cookie cannot make this test pass.
        $request = Request::create('/api/v1/auth/me');
        $request->setLaravelSession($oldSession);
        $request->setUserResolver(fn () => $freshUser);
        $oldSession->getHandler()->destroy($oldSession->getId());
        $this->expectException(AuthenticationException::class);
        app(VerifyPasswordSession::class)->handle($request, fn () => response('A stale session must not reach this response.'));
    }

    public function test_legacy_authenticated_session_without_snapshot_requires_login_again(): void
    {
        [$tenant, $user] = $this->identity();
        $this->useTenant($tenant)->postJson('/api/v1/auth/login', ['email' => $user->email, 'password' => 'OriginalPassword123'])->assertOk();
        $session = app('session')->driver();
        $session->forget('password_hash_web');
        $request = Request::create('/api/v1/auth/me');
        $request->setLaravelSession($session);
        $request->setUserResolver(fn () => $user);
        $this->expectException(AuthenticationException::class);
        app(VerifyPasswordSession::class)->handle($request, fn () => response('Legacy session must not bypass reset revocation.'));
    }

    public function test_rate_limit_does_not_share_a_bucket_between_tenants(): void
    {
        [$tenantA] = $this->identity();
        [$tenantB] = $this->identity();
        $this->useTenant($tenantA);
        for ($attempt = 0; $attempt < 5; $attempt++) {
            $this->postJson('/api/v1/auth/forgot-password', ['email' => 'missing@example.test'])->assertOk();
        }
        $this->postJson('/api/v1/auth/forgot-password', ['email' => 'missing@example.test'])->assertTooManyRequests();
        $this->useTenant($tenantB)->postJson('/api/v1/auth/forgot-password', ['email' => 'missing@example.test'])->assertOk();
    }
}
