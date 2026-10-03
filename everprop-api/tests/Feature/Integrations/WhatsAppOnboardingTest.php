<?php

namespace Tests\Feature\Integrations;

use App\Domain\Identity\Enums\RoleCode;
use App\Domain\Integrations\Services\IntegrationTokens;
use App\Domain\Tenancy\Models\Tenant;
use App\Models\User;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Http\Client\Request;
use Illuminate\Http\Response;
use Illuminate\Log\Events\MessageLogged;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Event;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Str;
use Illuminate\Testing\TestResponse;
use Tests\Feature\Conversations\ConversationTestSupport;
use Tests\TestCase;

/** Tech Provider W4: Embedded Signup onboarding. Meta is faked; nothing here proves a live integration. */
final class WhatsAppOnboardingTest extends TestCase
{
    use ConversationTestSupport, DatabaseTransactions;

    private const TOKEN = 'EAAG-synthetic-business-token-W4';

    private const SIGNUP = ['code' => 'code-from-meta', 'waba_id' => '1001', 'phone_number_id' => '2002', 'business_id' => '3003'];

    protected function setUp(): void
    {
        parent::setUp();
        config(['services.meta.onboarding_enabled' => true, 'services.meta.app_id' => '111', 'services.meta.app_secret' => 'app-secret',
            'services.meta.embedded_signup_config_id' => '222', 'services.meta.graph_version' => 'v24.0']);
        Http::preventStrayRequests();
    }

    /** @param array<string, mixed> $overrides */
    private function meta(array $overrides = []): void
    {
        Http::fake($overrides + [
            'graph.facebook.com/v24.0/oauth/access_token*' => Http::response(['access_token' => self::TOKEN, 'token_type' => 'bearer']),
            'graph.facebook.com/v24.0/1001/phone_numbers*' => Http::response(['data' => [['id' => '2002', 'display_phone_number' => '+54 388 400-0000', 'verified_name' => 'Inmobiliaria Sintética']]]),
            'graph.facebook.com/v24.0/1001/subscribed_apps' => Http::response(['success' => true]),
            'graph.facebook.com/v24.0/2002/register' => Http::response(['success' => true]),
        ]);
    }

    /** @return array{0: Tenant, 1: User} */
    private function admin(RoleCode $role = RoleCode::TENANT_ADMIN): array
    {
        $tenant = Tenant::factory()->create();

        return [$tenant, $this->user($tenant, $role)];
    }

    /**
     * @param  array<string, string>  $signup
     * @return TestResponse<Response>
     */
    private function connect(Tenant $tenant, User $user, array $signup = self::SIGNUP): TestResponse
    {
        return $this->actingAs($user)->withHeaders($this->tenantHeaders($tenant))->postJson('/api/v1/admin/integrations/whatsapp/connect', $signup);
    }

    public function test_successful_signup_connects_the_number_with_an_encrypted_token(): void
    {
        $this->meta();
        [$tenant, $admin] = $this->admin();

        $response = $this->connect($tenant, $admin)->assertCreated()->assertJsonPath('data.state', 'ACTIVE')
            ->assertJsonPath('data.display_phone_number', '+54 388 400-0000');

        $this->assertStringNotContainsString(self::TOKEN, $response->getContent());
        $integration = DB::table('integration_connections')->where('tenant_id', $tenant->id)->where('provider', 'META')->first();
        $this->assertSame('ACTIVE', $integration->status);
        $this->assertNull($integration->access_token_secret_ref);
        $this->assertStringNotContainsString(self::TOKEN, (string) $integration->access_token_ciphertext);
        $this->assertSame(self::TOKEN, app(IntegrationTokens::class)->forSending($tenant->id, (int) $integration->id));
        $this->assertDatabaseHas('channel_accounts', ['tenant_id' => $tenant->id, 'integration_id' => $integration->id, 'channel_type' => 'WHATSAPP', 'provider_account_id' => '2002', 'status' => 'ACTIVE']);
        $this->assertDatabaseHas('audit_logs', ['tenant_id' => $tenant->id, 'actor_user_id' => $admin->id, 'action_code' => 'WHATSAPP_CONNECTED', 'entity_id' => $integration->id]);
        Http::assertSent(fn (Request $r) => str_contains($r->url(), '/1001/subscribed_apps') && $r->hasHeader('Authorization', 'Bearer '.self::TOKEN));
        Http::assertSent(fn (Request $r) => str_contains($r->url(), '/2002/register') && preg_match('/^\d{6}$/', (string) $r['pin']) === 1);
    }

    public function test_onboarding_is_off_by_default_and_only_tenant_admins_may_connect(): void
    {
        $this->meta();
        foreach ([RoleCode::SALES_MANAGER, RoleCode::SALES_ADVISOR, RoleCode::READ_ONLY] as $role) {
            [$tenant, $user] = $this->admin($role);
            $this->connect($tenant, $user)->assertForbidden();
        }
        config(['services.meta.onboarding_enabled' => false]);
        [$tenant, $admin] = $this->admin();
        $this->connect($tenant, $admin)->assertStatus(503)->assertJsonPath('error.code', 'ONBOARDING_DISABLED');
        $this->actingAs($admin)->getJson('/api/v1/admin/integrations/whatsapp/config')->assertOk()
            ->assertJsonPath('data.enabled', false)->assertJsonPath('data.app_id', null);
        Http::assertNothingSent();
    }

    public function test_config_exposes_only_public_ids(): void
    {
        [$tenant, $admin] = $this->admin();
        $response = $this->actingAs($admin)->withHeaders($this->tenantHeaders($tenant))->getJson('/api/v1/admin/integrations/whatsapp/config')
            ->assertOk()->assertJsonPath('data.enabled', true)->assertJsonPath('data.app_id', '111')->assertJsonPath('data.config_id', '222');
        $this->assertStringNotContainsString('app-secret', $response->getContent());
    }

    public function test_a_phone_number_outside_the_waba_is_rejected_before_anything_is_saved(): void
    {
        $this->meta(['graph.facebook.com/v24.0/1001/phone_numbers*' => Http::response(['data' => [['id' => '9999']]])]);
        [$tenant, $admin] = $this->admin();

        $this->connect($tenant, $admin)->assertStatus(422)->assertJsonPath('error.code', 'PHONE_NOT_IN_WABA');

        $this->assertDatabaseMissing('integration_connections', ['tenant_id' => $tenant->id, 'provider' => 'META']);
        Http::assertNotSent(fn (Request $r) => str_contains($r->url(), 'subscribed_apps') || str_contains($r->url(), '/register'));
    }

    public function test_a_number_already_connected_to_another_tenant_is_refused(): void
    {
        $this->meta();
        [$owner, $ownerAdmin] = $this->admin();
        $this->connect($owner, $ownerAdmin)->assertCreated();
        [$tenant, $admin] = $this->admin();

        $this->connect($tenant, $admin)->assertStatus(409)->assertJsonPath('error.code', 'PHONE_TAKEN');

        $this->assertDatabaseMissing('integration_connections', ['tenant_id' => $tenant->id, 'provider' => 'META']);
        $this->assertSame(1, DB::table('channel_accounts')->where('provider_account_id', '2002')->count());
    }

    public function test_a_failed_code_exchange_saves_nothing_and_never_echoes_meta(): void
    {
        $this->meta(['graph.facebook.com/v24.0/oauth/access_token*' => Http::response(['error' => ['message' => 'Invalid verification code format.', 'code' => 100]], 400)]);
        [$tenant, $admin] = $this->admin();

        $response = $this->connect($tenant, $admin)->assertStatus(502)->assertJsonPath('error.code', 'EXCHANGE_FAILED');

        $this->assertStringNotContainsString('Invalid verification code', $response->getContent());
        $this->assertDatabaseMissing('integration_connections', ['tenant_id' => $tenant->id, 'provider' => 'META']);
    }

    public function test_failed_registration_keeps_the_connection_and_a_retry_is_idempotent(): void
    {
        $this->meta(['graph.facebook.com/v24.0/2002/register' => Http::sequence()->push(['error' => ['code' => 133016]], 400)->push(['success' => true])]);
        [$tenant, $admin] = $this->admin();

        $this->connect($tenant, $admin)->assertStatus(202)->assertJsonPath('data.state', 'REGISTRATION_PENDING');
        $this->assertDatabaseHas('integration_connections', ['tenant_id' => $tenant->id, 'provider' => 'META', 'status' => 'DEGRADED']);

        $this->connect($tenant, $admin)->assertCreated()->assertJsonPath('data.state', 'ACTIVE');

        $this->assertSame(1, DB::table('integration_connections')->where('tenant_id', $tenant->id)->where('provider', 'META')->count());
        $this->assertSame(1, DB::table('channel_accounts')->where('tenant_id', $tenant->id)->where('provider_account_id', '2002')->count());
        $this->assertDatabaseHas('integration_connections', ['tenant_id' => $tenant->id, 'provider' => 'META', 'status' => 'ACTIVE']);
        $pins = Http::recorded(fn (Request $r) => str_contains($r->url(), '/register'))->map(fn (array $pair) => $pair[0]['pin'])->unique();
        $this->assertCount(1, $pins, 'the retry reuses the same PIN');
    }

    public function test_an_admin_of_another_tenant_cannot_connect_here(): void
    {
        $this->meta();
        [$tenant] = $this->admin();
        [, $foreignAdmin] = $this->admin();

        $status = $this->actingAs($foreignAdmin)->withHeaders($this->tenantHeaders($tenant))
            ->postJson('/api/v1/admin/integrations/whatsapp/connect', self::SIGNUP)->status();
        $this->assertContains($status, [401, 403, 404]);

        $this->assertDatabaseMissing('integration_connections', ['tenant_id' => $tenant->id, 'provider' => 'META']);
        Http::assertNothingSent();
    }

    public function test_a_rejected_webhook_subscription_saves_nothing(): void
    {
        $this->meta(['graph.facebook.com/v24.0/1001/subscribed_apps' => Http::response(['error' => ['code' => 200]], 403)]);
        [$tenant, $admin] = $this->admin();

        $this->connect($tenant, $admin)->assertStatus(502)->assertJsonPath('error.code', 'SUBSCRIBE_FAILED');

        $this->assertDatabaseMissing('integration_connections', ['tenant_id' => $tenant->id, 'provider' => 'META']);
        Http::assertNotSent(fn (Request $r) => str_contains($r->url(), '/register'));
    }

    public function test_reconnecting_a_working_number_keeps_it_active_when_registration_fails(): void
    {
        $this->meta(['graph.facebook.com/v24.0/2002/register' => Http::sequence()->push(['success' => true])->push(['error' => ['code' => 133005]], 400)]);
        [$tenant, $admin] = $this->admin();
        $this->connect($tenant, $admin)->assertCreated();

        $this->connect($tenant, $admin)->assertStatus(202)->assertJsonPath('data.state', 'REGISTRATION_PENDING');

        $this->assertDatabaseHas('integration_connections', ['tenant_id' => $tenant->id, 'provider' => 'META', 'status' => 'ACTIVE']);
    }

    public function test_logs_never_carry_the_token_secret_or_pin(): void
    {
        $logged = [];
        Event::listen(MessageLogged::class, function (MessageLogged $event) use (&$logged): void {
            $logged[] = $event->message.json_encode($event->context);
        });
        $this->meta(['graph.facebook.com/v24.0/2002/register' => Http::response(['error' => ['code' => 133016]], 400)]);
        [$tenant, $admin] = $this->admin();
        $this->connect($tenant, $admin)->assertStatus(202);
        $pin = (string) Http::recorded(fn (Request $r) => str_contains($r->url(), '/register'))->first()[0]['pin'];

        $this->assertNotEmpty($logged, 'the failed registration is logged');
        foreach ($logged as $line) {
            $this->assertStringNotContainsString(self::TOKEN, $line);
            $this->assertStringNotContainsString('app-secret', $line);
            $this->assertStringNotContainsString($pin, $line);
        }
    }

    public function test_disconnecting_erases_credentials_and_tells_meta(): void
    {
        $this->meta(['graph.facebook.com/v24.0/1001/subscribed_apps' => Http::response(['success' => true])]);
        [$tenant, $admin] = $this->admin();
        $id = (string) $this->connect($tenant, $admin)->assertCreated()->json('data.integration_id');
        $this->actingAs($admin)->getJson('/api/v1/admin/integrations/whatsapp/config')->assertJsonPath('data.connections.0.id', $id)
            ->assertJsonPath('data.connections.0.display_phone_number', '+54 388 400-0000');

        $this->actingAs($admin)->postJson("/api/v1/admin/integrations/whatsapp/$id/disconnect")->assertOk();

        $row = DB::table('integration_connections')->where('public_id', $id)->first();
        $this->assertSame('REVOKED', $row->status);
        $this->assertNull($row->access_token_ciphertext);
        $this->assertArrayNotHasKey('registration_pin', json_decode((string) $row->settings_json, true));
        $this->assertDatabaseHas('channel_accounts', ['integration_id' => $row->id, 'status' => 'DISCONNECTED']);
        $this->assertDatabaseHas('audit_logs', ['tenant_id' => $tenant->id, 'action_code' => 'WHATSAPP_DISCONNECTED', 'entity_id' => $row->id]);
        Http::assertSent(fn (Request $r) => $r->method() === 'DELETE' && str_contains($r->url(), '/1001/subscribed_apps') && $r->hasHeader('Authorization', 'Bearer '.self::TOKEN));
        $this->actingAs($admin)->getJson('/api/v1/admin/integrations/whatsapp/config')->assertJsonCount(0, 'data.connections');
    }

    public function test_disconnect_still_happens_locally_when_meta_fails(): void
    {
        $this->meta(['graph.facebook.com/v24.0/1001/subscribed_apps' => Http::sequence()->push(['success' => true])->push(['error' => ['code' => 2]], 500)]);
        [$tenant, $admin] = $this->admin();
        $id = (string) $this->connect($tenant, $admin)->assertCreated()->json('data.integration_id');

        $this->actingAs($admin)->postJson("/api/v1/admin/integrations/whatsapp/$id/disconnect")->assertOk();
        Http::assertSent(fn (Request $r) => $r->method() === 'DELETE');

        $this->assertDatabaseHas('integration_connections', ['public_id' => $id, 'status' => 'REVOKED', 'access_token_ciphertext' => null]);
    }

    public function test_only_this_tenants_admins_can_disconnect_its_numbers(): void
    {
        $this->meta();
        [$tenant, $admin] = $this->admin();
        $id = (string) $this->connect($tenant, $admin)->assertCreated()->json('data.integration_id');
        [$other, $otherAdmin] = $this->admin();
        $manager = $this->user($tenant, RoleCode::SALES_MANAGER);

        $this->actingAs($otherAdmin)->withHeaders($this->tenantHeaders($other))->postJson("/api/v1/admin/integrations/whatsapp/$id/disconnect")->assertNotFound();
        $this->actingAs($otherAdmin)->getJson('/api/v1/admin/integrations/whatsapp/config')->assertJsonCount(0, 'data.connections');
        $this->actingAs($manager)->withHeaders($this->tenantHeaders($tenant))->postJson("/api/v1/admin/integrations/whatsapp/$id/disconnect")->assertForbidden();

        $this->assertDatabaseHas('integration_connections', ['public_id' => $id, 'status' => 'ACTIVE']);
    }

    public function test_a_disconnected_number_can_be_reconnected_here_or_by_another_tenant_with_a_new_token(): void
    {
        $this->meta();
        [$tenant, $admin] = $this->admin();
        $first = (string) $this->connect($tenant, $admin)->assertCreated()->json('data.integration_id');
        $this->actingAs($admin)->postJson("/api/v1/admin/integrations/whatsapp/$first/disconnect")->assertOk();
        $this->actingAs($admin)->postJson("/api/v1/admin/integrations/whatsapp/$first/disconnect")->assertOk(); // idempotent
        $this->actingAs($admin)->postJson('/api/v1/admin/integrations/whatsapp/'.Str::uuid().'/disconnect')->assertNotFound();
        $this->assertDatabaseHas('channel_accounts', ['tenant_id' => $tenant->id, 'status' => 'DISCONNECTED']);
        $this->assertDatabaseMissing('channel_accounts', ['whatsapp_phone_number_id' => '2002']); // the number is free again
        $this->assertSame('2002', json_decode((string) DB::table('channel_accounts')->where('tenant_id', $tenant->id)->value('metadata_json'), true)['disconnected_phone_number_id']);

        [$other, $otherAdmin] = $this->admin();
        $second = (string) $this->connect($other, $otherAdmin)->assertCreated()->json('data.integration_id');

        $this->assertNotSame($first, $second);
        $this->assertDatabaseHas('channel_accounts', ['tenant_id' => $other->id, 'whatsapp_phone_number_id' => '2002', 'status' => 'ACTIVE']);
        $this->assertDatabaseHas('integration_connections', ['public_id' => $first, 'status' => 'REVOKED', 'access_token_ciphertext' => null]);
    }

    public function test_a_pending_registration_is_still_unsubscribed_on_disconnect(): void
    {
        $this->meta(['graph.facebook.com/v24.0/2002/register' => Http::response(['error' => ['code' => 133016]], 400)]);
        [$tenant, $admin] = $this->admin();
        $id = (string) $this->connect($tenant, $admin)->assertStatus(202)->json('data.integration_id');

        $this->actingAs($admin)->postJson("/api/v1/admin/integrations/whatsapp/$id/disconnect")->assertOk();

        Http::assertSent(fn (Request $r) => $r->method() === 'DELETE' && str_contains($r->url(), '/1001/subscribed_apps'));
    }

    public function test_ids_must_be_numeric(): void
    {
        $this->meta();
        [$tenant, $admin] = $this->admin();

        $this->connect($tenant, $admin, ['code' => 'x', 'waba_id' => '../me', 'phone_number_id' => '2002'])->assertStatus(422);
        Http::assertNothingSent();
    }

    public function test_registration_completion_never_revives_a_concurrent_revocation(): void
    {
        foreach ([200, 400] as $status) {
            [$tenant, $admin] = $this->admin();
            $this->meta(['graph.facebook.com/v24.0/2002/register' => function () use ($tenant, $status) {
                $id = (int) DB::table('integration_connections')->where('tenant_id', $tenant->id)->where('provider', 'META')->value('id');
                app(IntegrationTokens::class)->revoke($tenant->id, $id, null, 'META_ACCOUNT_OFFBOARDED');

                return Http::response(['success' => $status === 200], $status);
            }]);
            $this->connect($tenant, $admin)->assertStatus(409)->assertJsonPath('error.code', 'CONNECTION_CHANGED');
            $row = DB::table('integration_connections')->where('tenant_id', $tenant->id)->where('provider', 'META')->first();
            $this->assertSame('REVOKED', $row->status);
            $this->assertNull($row->access_token_ciphertext);
            $this->assertArrayNotHasKey('registration_pin', json_decode((string) $row->settings_json, true));
            // Free the synthetic number before the next control (revocation intentionally does not disconnect).
            DB::table('channel_accounts')->where('tenant_id', $tenant->id)->update(['provider_account_id' => 'revoked-'.$tenant->id]);
        }
    }

    public function test_registration_completion_cannot_overwrite_a_replaced_credential(): void
    {
        [$tenant, $admin] = $this->admin();
        $this->meta(['graph.facebook.com/v24.0/2002/register' => function () use ($tenant) {
            $id = (int) DB::table('integration_connections')->where('tenant_id', $tenant->id)->where('provider', 'META')->value('id');
            app(IntegrationTokens::class)->store($tenant->id, $id, 'synthetic-newer-token');

            return Http::response(['success' => true]);
        }]);

        $this->connect($tenant, $admin)->assertStatus(409)->assertJsonPath('error.code', 'CONNECTION_CHANGED');
        $row = DB::table('integration_connections')->where('tenant_id', $tenant->id)->where('provider', 'META')->first();
        $this->assertSame('PENDING', $row->status);
        $this->assertSame('synthetic-newer-token', app(IntegrationTokens::class)->stored($tenant->id, (int) $row->id));
    }

    public function test_disconnect_preserves_a_waba_subscription_for_another_tenants_pending_number(): void
    {
        $this->meta(['graph.facebook.com/v24.0/1001/phone_numbers*' => Http::response(['data' => [['id' => '2002'], ['id' => '2003']]]),
            'graph.facebook.com/v24.0/2003/register' => Http::response(['error' => ['code' => 133016]], 400)]);
        [$tenant, $admin] = $this->admin();
        $id = (string) $this->connect($tenant, $admin)->assertCreated()->json('data.integration_id');
        [$other, $otherAdmin] = $this->admin();
        $otherId = (string) $this->connect($other, $otherAdmin, array_replace(self::SIGNUP, ['phone_number_id' => '2003']))->assertStatus(202)->json('data.integration_id');

        $this->actingAs($admin)->withHeaders($this->tenantHeaders($tenant))->postJson("/api/v1/admin/integrations/whatsapp/$id/disconnect")->assertOk();
        Http::assertNotSent(fn (Request $r) => $r->method() === 'DELETE');
        $this->assertDatabaseHas('integration_connections', ['public_id' => $otherId, 'status' => 'DEGRADED']);
        $this->actingAs($otherAdmin)->withHeaders($this->tenantHeaders($other))->postJson("/api/v1/admin/integrations/whatsapp/$otherId/disconnect")->assertOk();
        Http::assertSent(fn (Request $r) => $r->method() === 'DELETE');
    }

    public function test_waba_lock_blocks_connect_and_disconnect_and_releases_after_failure(): void
    {
        $this->meta(['graph.facebook.com/v24.0/1001/subscribed_apps' => Http::sequence()
            ->push(['success' => true])->push([], 403)->push(['success' => true])->push(['success' => true])]);
        [$tenant, $admin] = $this->admin();
        $id = (string) $this->connect($tenant, $admin)->assertCreated()->json('data.integration_id');
        $name = 'meta-waba:'.substr(hash('sha256', DB::connection()->getDatabaseName().':1001'), 0, 40);
        config(['database.connections.meta_lock_test' => config('database.connections.'.DB::getDefaultConnection())]);
        $other = DB::connection('meta_lock_test');
        $this->assertSame(1, (int) $other->selectOne('SELECT GET_LOCK(?, 0) AS acquired', [$name])->acquired);
        try {
            $this->connect($tenant, $admin)->assertStatus(409)->assertJsonPath('error.code', 'CONNECT_IN_PROGRESS');
            $this->actingAs($admin)->postJson("/api/v1/admin/integrations/whatsapp/$id/disconnect")->assertStatus(409);
            Http::assertNotSent(fn (Request $r) => $r->method() === 'DELETE');
        } finally {
            $other->selectOne('SELECT RELEASE_LOCK(?) AS released', [$name]);
            DB::purge('meta_lock_test');
        }
        $this->connect($tenant, $admin)->assertStatus(502);
        $this->connect($tenant, $admin)->assertCreated();
        $this->actingAs($admin)->postJson("/api/v1/admin/integrations/whatsapp/$id/disconnect")->assertOk();
    }
}
