<?php

namespace Tests\Feature\Integrations;

use App\Domain\Identity\Enums\RoleCode;
use App\Domain\Integrations\Notifications\IntegrationTokenExpiring;
use App\Domain\Integrations\Services\InstagramOnboarding;
use App\Domain\Integrations\Services\IntegrationTokens;
use App\Domain\Tenancy\Models\Tenant;
use App\Jobs\SendWebPush;
use App\Models\User;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Notification;
use Illuminate\Support\Str;
use Tests\Feature\Conversations\ConversationTestSupport;
use Tests\TestCase;

/** EVP-128: daily renewal of Instagram tokens and the expiry alert to integration admins. */
final class RefreshIntegrationTokensTest extends TestCase
{
    use ConversationTestSupport, DatabaseTransactions;

    private const COMMAND = 'everprop:integrations:refresh-tokens';

    protected function setUp(): void
    {
        parent::setUp();
        config(['services.meta.graph_version' => 'v24.0']);
        Http::preventStrayRequests();
        Notification::fake();
    }

    /** @return array{Tenant, int, User} tenant, integration id, integration admin */
    private function channel(string $type, float $expiresInDays, string $tenantStatus = 'ACTIVE'): array
    {
        $tenant = Tenant::factory()->create(['status' => $tenantStatus]);
        $integration = (int) DB::table('integration_connections')->insertGetId([
            'tenant_id' => $tenant->id, 'public_id' => (string) Str::uuid(), 'provider' => 'META', 'name' => $type, 'status' => 'ACTIVE',
            'settings_json' => json_encode($type === 'INSTAGRAM_DM'
                ? ['instagram_login' => true, 'token_issued_at' => CarbonImmutable::now()->subDays(50)->toIso8601String()] : []),
        ]);
        app(IntegrationTokens::class)->store($tenant->id, $integration, 'current-token', CarbonImmutable::now()->addMinutes((int) round($expiresInDays * 1440)));
        DB::table('channel_accounts')->insert(['tenant_id' => $tenant->id, 'integration_id' => $integration, 'public_id' => (string) Str::uuid(),
            'channel_type' => $type, 'provider_account_id' => '9'.$tenant->id.random_int(1000, 9999), 'display_name' => $type, 'status' => 'ACTIVE']);

        return [$tenant, $integration, $this->user($tenant, RoleCode::TENANT_ADMIN)];
    }

    private function expiry(Tenant $tenant, int $integration): CarbonImmutable
    {
        return CarbonImmutable::parse(DB::table('integration_connections')->where('tenant_id', $tenant->id)->where('id', $integration)->value('token_expires_at'), 'UTC');
    }

    public function test_a_token_ten_days_from_expiry_is_renewed_once_and_nobody_is_alerted(): void
    {
        [$tenant, $integration, $admin] = $this->channel('INSTAGRAM_DM', 10);
        Http::fake(['graph.instagram.com/refresh_access_token*' => Http::response(['access_token' => 'refreshed-token', 'expires_in' => 5184000])]);

        $this->artisan(self::COMMAND)->expectsOutput('renewed=1 alerted=0')->assertSuccessful();
        $this->artisan(self::COMMAND)->expectsOutput('renewed=0 alerted=0')->assertSuccessful();

        Http::assertSentCount(1);
        $this->assertSame('refreshed-token', app(IntegrationTokens::class)->forSending($tenant->id, $integration));
        $this->assertTrue($this->expiry($tenant, $integration)->greaterThan(CarbonImmutable::now()->addDays(59)));
        $this->assertDatabaseHas('audit_logs', ['tenant_id' => $tenant->id, 'entity_id' => $integration, 'action_code' => 'INSTAGRAM_TOKEN_REFRESHED', 'actor_type' => 'SYSTEM', 'actor_user_id' => null]);
        Notification::assertNotSentTo($admin, IntegrationTokenExpiring::class);
    }

    public function test_a_failed_renewal_alerts_integration_admins_once_a_day_and_keeps_the_current_token(): void
    {
        [$tenant, $integration, $admin] = $this->channel('INSTAGRAM_DM', 10);
        $advisor = $this->user($tenant, RoleCode::SALES_ADVISOR);
        $before = $this->expiry($tenant, $integration);
        Http::fake(['graph.instagram.com/refresh_access_token*' => Http::response(['error' => ['code' => 1]], 500)]);

        $this->artisan(self::COMMAND)->expectsOutput('renewed=0 alerted=1')->assertSuccessful();
        $this->artisan(self::COMMAND)->expectsOutput('renewed=0 alerted=0')->assertSuccessful();

        $this->assertSame('current-token', app(IntegrationTokens::class)->forSending($tenant->id, $integration));
        $this->assertTrue($before->equalTo($this->expiry($tenant, $integration)));
        Notification::assertSentToTimes($admin, IntegrationTokenExpiring::class, 1);
        Notification::assertSentTo($admin, IntegrationTokenExpiring::class, function (IntegrationTokenExpiring $n) use ($admin): bool {
            $data = $n->toArray($admin);

            return $n->renewalFailed && $n->channel === 'instagram' && $n->daysLeft === 9
                && $data['action_url'] === '/admin/settings#instagram' && ! str_contains(json_encode($data), 'current-token');
        });
        Notification::assertNotSentTo($advisor, IntegrationTokenExpiring::class);

        $this->travel(1)->days();
        $this->artisan(self::COMMAND)->expectsOutput('renewed=0 alerted=1')->assertSuccessful();
        Notification::assertSentToTimes($admin, IntegrationTokenExpiring::class, 2);
    }

    public function test_six_days_left_without_renewal_alerts_and_the_settings_card_says_expiring(): void
    {
        [$tenant, $instagram, $admin] = $this->channel('INSTAGRAM_DM', 6.5);
        Http::fake(['graph.instagram.com/refresh_access_token*' => Http::failedConnection()]);
        [$waTenant, , $waAdmin] = $this->channel('WHATSAPP', 6.5);

        $this->artisan(self::COMMAND)->expectsOutput('renewed=0 alerted=2')->assertSuccessful();

        Http::assertSentCount(1); // only Instagram can be renewed; a WhatsApp token is only alerted
        Notification::assertSentTo($waAdmin, IntegrationTokenExpiring::class,
            fn (IntegrationTokenExpiring $n): bool => $n->channel === 'whatsapp' && $n->daysLeft === 6 && ! $n->renewalFailed
                && $n->toArray($waAdmin)['title'] === 'El acceso de WhatsApp vence en 6 días');
        Notification::assertNotSentTo($admin, IntegrationTokenExpiring::class, fn (IntegrationTokenExpiring $n): bool => $n->channel === 'whatsapp');
        $this->assertSame('EXPIRING', app(InstagramOnboarding::class)->connections($tenant->id)[0]['token_status']);
        $this->assertSame(0, DB::table('audit_logs')->where('tenant_id', $waTenant->id)->where('action_code', 'INSTAGRAM_TOKEN_REFRESHED')->count());
    }

    public function test_far_revoked_suspended_or_long_expired_tokens_are_left_alone(): void
    {
        $this->channel('INSTAGRAM_DM', 30);
        [$tenant, $revoked] = $this->channel('INSTAGRAM_DM', 5);
        DB::table('integration_connections')->where('tenant_id', $tenant->id)->where('id', $revoked)->update(['status' => 'REVOKED']);
        $this->channel('INSTAGRAM_DM', 5, 'SUSPENDED');
        [, , $expiredAdmin] = $this->channel('INSTAGRAM_DM', -10);
        [, , $recentAdmin] = $this->channel('INSTAGRAM_DM', -2);

        $this->artisan(self::COMMAND)->expectsOutput('renewed=0 alerted=1')->assertSuccessful();

        Http::assertNothingSent(); // an expired token cannot be renewed: only the recently expired one is alerted
        Notification::assertNotSentTo($expiredAdmin, IntegrationTokenExpiring::class);
        Notification::assertSentTo($recentAdmin, IntegrationTokenExpiring::class,
            fn (IntegrationTokenExpiring $n): bool => $n->daysLeft < 0 && $n->toArray($recentAdmin)['title'] === 'El acceso de Instagram venció');
    }

    public function test_push_payload_names_the_channel_without_client_data_and_only_opens_settings(): void
    {
        $push = new SendWebPush(1, 1, 'n-1');
        $payload = $push->payload('Bellomo', 'n-1', ['event_type' => 'INTEGRATION_TOKEN_EXPIRING', 'title' => 'El acceso de Instagram vence en 6 días', 'action_url' => '/admin/settings#instagram']);
        $this->assertSame(['title' => 'El acceso de Instagram vence en 6 días', 'body' => 'Volvé a conectar el canal en Configuración para seguir respondiendo mensajes.',
            'tag' => 'integration-token-expiring', 'url' => '/admin/settings#instagram'], $payload);
        $this->assertSame('/admin/settings', $push->payload('Bellomo', 'n-1', ['event_type' => 'INTEGRATION_TOKEN_EXPIRING', 'action_url' => 'https://evil.example'])['url']);
    }
}
