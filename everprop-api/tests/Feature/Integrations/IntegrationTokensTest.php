<?php

namespace Tests\Feature\Integrations;

use App\Domain\Conversations\Transports\WhatsAppCloudTransport;
use App\Domain\Integrations\Services\IntegrationTokens;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Http\Client\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Tests\Feature\Conversations\ConversationTestSupport;
use Tests\TestCase;

/** Tech Provider W3: each tenant's provider token is stored encrypted and only that tenant can use it. */
final class IntegrationTokensTest extends TestCase
{
    use ConversationTestSupport, DatabaseTransactions;

    private const TOKEN = 'EAAG-synthetic-business-token-0001';

    public function test_token_is_encrypted_at_rest_and_takes_precedence_over_the_legacy_config_map(): void
    {
        ['tenant' => $tenant, 'integration' => $integration] = $this->tenantWithIntegration();
        config(['services.webhooks.secrets' => ['wa-token-'.$tenant->id => 'legacy-token']]);
        $tokens = app(IntegrationTokens::class);
        $this->assertSame('legacy-token', $tokens->forSending($tenant->id, $integration));

        $tokens->store($tenant->id, $integration, self::TOKEN);

        $stored = (string) DB::table('integration_connections')->where('id', $integration)->value('access_token_ciphertext');
        $this->assertStringNotContainsString(self::TOKEN, $stored);
        $this->assertSame(self::TOKEN, $tokens->forSending($tenant->id, $integration));
    }

    public function test_another_tenant_can_neither_read_nor_overwrite_the_token(): void
    {
        ['tenant' => $a, 'integration' => $integration] = $this->tenantWithIntegration();
        ['tenant' => $b] = $this->tenantWithIntegration();
        $tokens = app(IntegrationTokens::class);
        $tokens->store($a->id, $integration, self::TOKEN);

        $this->assertNull($tokens->forSending($b->id, $integration));
        $this->expectException(\RuntimeException::class);
        $tokens->store($b->id, $integration, 'attacker-token');
    }

    public function test_revoked_expired_or_unreadable_tokens_are_never_used(): void
    {
        ['tenant' => $tenant, 'integration' => $integration] = $this->tenantWithIntegration();
        $tokens = app(IntegrationTokens::class);

        $tokens->store($tenant->id, $integration, self::TOKEN, CarbonImmutable::now()->subMinute());
        $this->assertNull($tokens->forSending($tenant->id, $integration), 'expired');

        $tokens->store($tenant->id, $integration, self::TOKEN, CarbonImmutable::now()->addDay());
        DB::table('integration_connections')->where('id', $integration)->update(['status' => 'REVOKED']);
        $this->assertNull($tokens->forSending($tenant->id, $integration), 'revoked');

        DB::table('integration_connections')->where('id', $integration)->update(['status' => 'ACTIVE', 'access_token_ciphertext' => 'not-a-valid-payload']);
        $this->assertNull($tokens->forSending($tenant->id, $integration), 'unreadable');
    }

    public function test_clearing_the_stored_token_never_revives_the_legacy_one_and_legacy_tokens_expire(): void
    {
        ['tenant' => $tenant, 'integration' => $integration] = $this->tenantWithIntegration();
        config(['services.webhooks.secrets' => ['wa-token-'.$tenant->id => 'legacy-token']]);
        $tokens = app(IntegrationTokens::class);

        DB::table('integration_connections')->where('id', $integration)->update(['token_expires_at' => now()->subMinute()]);
        $this->assertNull($tokens->forSending($tenant->id, $integration), 'expired legacy');

        $tokens->store($tenant->id, $integration, self::TOKEN);
        DB::table('integration_connections')->where('id', $integration)->update(['access_token_ciphertext' => null]);
        $this->assertNull($tokens->forSending($tenant->id, $integration), 'legacy revived');
    }

    public function test_paused_number_or_missing_token_sends_nothing(): void
    {
        ['tenant' => $tenant, 'integration' => $integration] = $this->tenantWithIntegration();
        $channelId = $this->whatsappChannel($tenant->id, $integration, 'PN-PAUSED');
        app(IntegrationTokens::class)->store($tenant->id, $integration, self::TOKEN);
        config(['services.meta.send_enabled' => true]);
        Http::fake();

        DB::table('channel_accounts')->where('id', $channelId)->update(['status' => 'PAUSED']);
        $paused = app(WhatsAppCloudTransport::class)->send((array) DB::table('channel_accounts')->find($channelId), '5493881111111', 'hola', 'n');
        $this->assertSame('CHANNEL_INACTIVE', $paused->errorCode);

        DB::table('channel_accounts')->where('id', $channelId)->update(['status' => 'ACTIVE']);
        DB::table('integration_connections')->where('id', $integration)->update(['status' => 'REVOKED']);
        $revoked = app(WhatsAppCloudTransport::class)->send((array) DB::table('channel_accounts')->find($channelId), '5493881111111', 'hola', 'n');
        $this->assertSame('CHANNEL_NOT_CONFIGURED', $revoked->errorCode);
        Http::assertNothingSent();
    }

    public function test_whatsapp_transport_sends_with_the_stored_token(): void
    {
        ['tenant' => $tenant, 'integration' => $integration] = $this->tenantWithIntegration();
        $channel = (array) DB::table('channel_accounts')->find($this->whatsappChannel($tenant->id, $integration, 'PN-W3'));
        app(IntegrationTokens::class)->store($tenant->id, $integration, self::TOKEN);
        config(['services.meta.send_enabled' => true, 'services.webhooks.secrets' => []]);
        Http::preventStrayRequests();
        Http::fake(['graph.facebook.com/*' => Http::response(['messages' => [['id' => 'wamid.W3']]], 200)]);

        $this->assertSame('wamid.W3', app(WhatsAppCloudTransport::class)->send($channel, '5493881111111', 'hola', 'n')->providerMessageId);
        Http::assertSent(fn (Request $request) => $request->hasHeader('Authorization', 'Bearer '.self::TOKEN));
    }
}
