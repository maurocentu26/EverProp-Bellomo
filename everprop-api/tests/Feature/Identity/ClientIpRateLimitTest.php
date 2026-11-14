<?php

namespace Tests\Feature\Identity;

use App\Domain\Tenancy\Models\Tenant;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Testing\TestResponse;
use Tests\TestCase;

/**
 * EVP-132: with no trusted proxy the limits were keyed by Railway's edge IP, which changes between requests, so
 * nobody was ever throttled. The limits now key on the real caller, or on the visitor IP the panel signs.
 */
final class ClientIpRateLimitTest extends TestCase
{
    use DatabaseTransactions;

    private const KEY = 'test-panel-key';

    private Tenant $tenant;

    protected function setUp(): void
    {
        parent::setUp();
        $this->tenant = Tenant::factory()->create();
        config(['tenancy.panel_signing_key' => self::KEY, 'tenancy.panel_signature_ttl' => 60]);
        foreach (['203.0.113.10', '203.0.113.11', '198.51.100.20', '198.51.100.21', '127.0.0.1'] as $ip) {
            RateLimiter::clear(md5('login'.'login|'.$ip));
        }
    }

    /**
     * @param  array<string, string>  $headers
     * @param  array<string, string>  $server
     * @return TestResponse<JsonResponse>
     */
    private function failedLogin(array $headers = [], array $server = []): TestResponse
    {
        return $this->withServerVariables($server)
            ->withHeaders(['X-Everprop-Tenant' => $this->tenant->public_id, 'Origin' => 'http://localhost:5173'] + $headers)
            ->postJson('/api/v1/auth/login', ['email' => 'nobody@example.test', 'password' => 'wrong-password-1234']);
    }

    /** @return array<string, string> */
    private function signed(string $ip, ?int $at = null, string $key = self::KEY): array
    {
        $ts = (string) ($at ?? time());

        return ['X-Eversys-Client-Ip' => $ip, 'X-Eversys-Client-Timestamp' => $ts,
            'X-Eversys-Client-Signature' => hash_hmac('sha256', "eversys-client-ip-v1\n{$ip}\n{$ts}", $key)];
    }

    public function test_behind_the_edge_the_real_caller_is_limited_and_a_forged_forwarded_for_is_ignored(): void
    {
        config(['trustedproxy.proxies' => ['REMOTE_ADDR']]);

        // The edge proxy changes on every request and the client rotates a forged first X-Forwarded-For entry.
        for ($n = 1; $n <= 5; $n++) {
            $this->failedLogin(['X-Forwarded-For' => "1.1.1.{$n}, 203.0.113.10"], ['REMOTE_ADDR' => "10.0.0.{$n}"])->assertStatus(422);
        }
        $this->failedLogin(['X-Forwarded-For' => '1.1.1.9, 203.0.113.10'], ['REMOTE_ADDR' => '10.0.0.9'])->assertStatus(429);
        $this->failedLogin(['X-Forwarded-For' => '203.0.113.11'], ['REMOTE_ADDR' => '10.0.0.1'])->assertStatus(422);
    }

    public function test_visitors_signed_by_the_panel_get_their_own_budget_and_anything_unverified_falls_back(): void
    {
        // Same vector as everprop-public/tests/tenant-signature.test.mjs.
        $this->assertSame('5044c5d7cef53e864bb281d0c12f40e01e2162abddaa80484badc18935e10d97',
            hash_hmac('sha256', "eversys-client-ip-v1\n203.0.113.7\n1791200000", self::KEY));

        for ($n = 1; $n <= 5; $n++) {
            $this->failedLogin($this->signed('198.51.100.20'))->assertStatus(422);
        }
        $this->failedLogin($this->signed('198.51.100.20'))->assertStatus(429);
        $this->failedLogin($this->signed('198.51.100.21'))->assertStatus(422); // another visitor behind the same server

        // Forged, stale or unsigned: keyed by the caller (127.0.0.1), not by the exhausted visitor.
        $this->failedLogin($this->signed('198.51.100.20', key: 'other-key'))->assertStatus(422);
        $this->failedLogin($this->signed('198.51.100.20', time() - 120))->assertStatus(422);
        $this->failedLogin(['X-Eversys-Client-Ip' => '198.51.100.20'])->assertStatus(422);
        config(['tenancy.panel_signing_key' => '']);
        $this->failedLogin($this->signed('198.51.100.20'))->assertStatus(422);
    }

    public function test_production_check_rejects_a_wildcard_that_lets_the_client_pick_its_ip(): void
    {
        config(['trustedproxy.proxies' => ['*']]);
        $this->artisan('everprop:production-check')->expectsOutputToContain('FAIL Trusted proxies not a wildcard')->assertFailed();
        config(['trustedproxy.proxies' => ['REMOTE_ADDR']]);
        $this->artisan('everprop:production-check')->expectsOutputToContain('OK Trusted proxies not a wildcard');
    }
}
