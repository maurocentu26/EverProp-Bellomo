<?php

namespace Tests\Feature\Conversations;

use App\Domain\Identity\Enums\RoleCode;
use App\Domain\Integrations\Services\IntegrationTokens;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

final class InstagramProvisioningTest extends TestCase
{
    use ConversationTestSupport, DatabaseTransactions;

    public function test_connect_validates_identity_stores_encrypted_token_and_refuses_reassignment(): void
    {
        ['tenant' => $a] = $this->tenantWithIntegration();
        ['tenant' => $b] = $this->tenantWithIntegration();
        $admin = $this->user($a, RoleCode::TENANT_ADMIN);
        $other = $this->user($b, RoleCode::TENANT_ADMIN);
        $args = ['--tenant' => $a->slug, '--admin' => $admin->email, '--account' => '123456'];
        $token = str_repeat('test-only-', 5);
        Http::preventStrayRequests();
        Http::fake(['graph.instagram.com/*' => Http::response(['data' => [['user_id' => '123456', 'username' => 'synthetic_business']]], 200)]);
        $this->artisan('everprop:instagram:connect-own', $args)->expectsQuestion('Token de Instagram Login (no se muestra)', $token)->assertSuccessful();
        $channel = DB::table('channel_accounts')->where('tenant_id', $a->id)->where('provider_account_id', '123456')->first();
        $this->assertNotNull($channel);
        $this->assertSame($token, app(IntegrationTokens::class)->forSending($a->id, $channel->integration_id));
        $stored = DB::table('integration_connections')->where('tenant_id', $a->id)->where('id', $channel->integration_id)->first();
        $this->assertNotSame($token, $stored->access_token_ciphertext);
        $this->assertTrue(json_decode($stored->settings_json, true)['instagram_login']);
        $this->artisan('everprop:instagram:connect-own', ['--tenant' => $b->slug, '--admin' => $other->email, '--account' => '123456'])
            ->expectsQuestion('Token de Instagram Login (no se muestra)', $token)->assertFailed();
        $this->assertDatabaseMissing('channel_accounts', ['tenant_id' => $b->id, 'provider_account_id' => '123456']);
        $this->artisan('everprop:instagram:connect-own', ['--tenant' => $a->slug, '--admin' => $other->email, '--account' => '123456'])->assertFailed();
        Http::assertSentCount(2);
    }

    public function test_inactive_admin_and_non_admin_cannot_connect(): void
    {
        ['tenant' => $tenant] = $this->tenantWithIntegration();
        $admin = $this->user($tenant, RoleCode::TENANT_ADMIN);
        $admin->update(['status' => 'DISABLED']);
        $viewer = $this->user($tenant, RoleCode::READ_ONLY);
        Http::preventStrayRequests();
        Http::fake();
        foreach ([$admin, $viewer] as $actor) {
            $this->artisan('everprop:instagram:connect-own', ['--tenant' => $tenant->slug, '--admin' => $actor->email, '--account' => '123456'])->assertFailed();
        }
        Http::assertNothingSent();
        $this->assertDatabaseMissing('channel_accounts', ['tenant_id' => $tenant->id, 'provider_account_id' => '123456']);
    }

    public function test_account_lock_blocks_concurrent_provisioning_without_storing_token(): void
    {
        ['tenant' => $tenant] = $this->tenantWithIntegration();
        $admin = $this->user($tenant, RoleCode::TENANT_ADMIN);
        Http::preventStrayRequests();
        Http::fake(['graph.instagram.com/*' => Http::response(['user_id' => '123456', 'username' => 'synthetic_business'])]);
        config(['database.connections.instagram_lock_test' => config('database.connections.mysql')]);
        $other = DB::connection('instagram_lock_test');
        $lock = 'ig-connect:'.substr(hash('sha256', DB::getDatabaseName().':123456'), 0, 48);
        $this->assertSame(1, (int) $other->selectOne('SELECT GET_LOCK(?, 0) AS acquired', [$lock])->acquired);
        try {
            $this->artisan('everprop:instagram:connect-own', ['--tenant' => $tenant->slug, '--admin' => $admin->email, '--account' => '123456'])
                ->expectsQuestion('Token de Instagram Login (no se muestra)', str_repeat('test-only-', 5))->assertFailed();
            $this->assertDatabaseMissing('channel_accounts', ['tenant_id' => $tenant->id, 'provider_account_id' => '123456']);
        } finally {
            $other->selectOne('SELECT RELEASE_LOCK(?) AS released', [$lock]);
            DB::purge('instagram_lock_test');
        }
    }

    public function test_mismatched_identity_or_provider_failure_creates_no_channel(): void
    {
        ['tenant' => $tenant] = $this->tenantWithIntegration();
        $admin = $this->user($tenant, RoleCode::TENANT_ADMIN);
        Http::preventStrayRequests();
        Http::fake(['graph.instagram.com/*' => Http::sequence()->push(['user_id' => '999', 'username' => 'wrong'], 200)->push(['error' => ['message' => 'provider detail']], 401)]);
        foreach ([1, 2] as $attempt) {
            $this->artisan('everprop:instagram:connect-own', ['--tenant' => $tenant->slug, '--admin' => $admin->email, '--account' => '123456'])
                ->expectsQuestion('Token de Instagram Login (no se muestra)', str_repeat('test-only-', 5))->assertFailed();
        }
        $this->assertDatabaseMissing('channel_accounts', ['tenant_id' => $tenant->id, 'provider_account_id' => '123456']);
    }
}
