<?php

namespace Tests\Feature\Conversations;

use App\Domain\AgentRuntime\Jobs\RunAgentJob;
use App\Domain\Conversations\Exceptions\DeliveryAmbiguous;
use App\Domain\Conversations\Jobs\ProcessMetaWebhookReceipt;
use App\Domain\Conversations\Services\ConversationControl;
use App\Domain\Conversations\Services\MetaWebhookProcessor;
use App\Domain\Conversations\Services\OutboundDispatcher;
use App\Domain\Conversations\Transports\MetaMessengerTransport;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Queue;
use Illuminate\Support\Str;
use Tests\TestCase;

final class MetaSocialWebhookTest extends TestCase
{
    use ConversationTestSupport, DatabaseTransactions;

    protected function setUp(): void
    {
        parent::setUp();
        config([
            'conversations.web_rate_limit_per_minute' => 10_000,
            'conversations.ai_enabled' => true,
            'services.meta.app_secret' => self::APP_SECRET,
            'services.meta.webhook_verify_token' => 'verify-me',
            'services.meta.send_enabled' => false,
            'services.meta.send_fake' => false,
        ]);
        Queue::fake([RunAgentJob::class]);
    }

    private function socialChannel(int $tenantId, int $integrationId, string $channelType, string $accountId): int
    {
        return (int) DB::table('channel_accounts')->insertGetId([
            'tenant_id' => $tenantId,
            'integration_id' => $integrationId,
            'public_id' => (string) Str::uuid(),
            'channel_type' => $channelType,
            'provider_account_id' => $accountId,
            'display_name' => $channelType.' '.$accountId,
            'status' => 'ACTIVE',
        ]);
    }

    /**
     * @param  list<array<string, mixed>>  $messaging
     */
    private function socialPayload(string $object, string $accountId, array $messaging): string
    {
        return json_encode([
            'object' => $object,
            'entry' => [[
                'id' => $accountId,
                'time' => now()->getTimestampMs(),
                'messaging' => $messaging,
            ]],
        ], JSON_THROW_ON_ERROR);
    }

    /** @return array<string, mixed> */
    private function socialMessage(string $senderId, string $accountId, string $mid, string $text, bool $echo = false): array
    {
        return [
            'sender' => ['id' => $senderId],
            'recipient' => ['id' => $accountId],
            'timestamp' => now()->getTimestampMs(),
            'message' => array_filter([
                'mid' => $mid,
                'text' => $text,
                'is_echo' => $echo ?: null,
            ], fn ($v) => $v !== null),
        ];
    }

    public function test_invalid_signature_is_rejected_on_neutral_meta_webhook(): void
    {
        ['tenant' => $tenant, 'integration' => $integration] = $this->tenantWithIntegration();
        $this->socialChannel($tenant->id, $integration, 'INSTAGRAM_DM', 'IG-ACC-1');
        $raw = $this->socialPayload('instagram', 'IG-ACC-1', [$this->socialMessage('IGSID-1', 'IG-ACC-1', 'm_ig_1', 'Hola')]);

        $this->call('POST', '/api/v1/webhooks/meta', [], [], [], [
            'CONTENT_TYPE' => 'application/json',
            'HTTP_X_HUB_SIGNATURE_256' => 'sha256='.hash_hmac('sha256', $raw, 'wrong-secret'),
        ], $raw)->assertStatus(401);

        $this->assertSame(0, DB::table('messages')->where('tenant_id', $tenant->id)->count());
    }

    public function test_instagram_and_messenger_webhooks_create_conversations_identities_and_ignore_echoes(): void
    {
        ['tenant' => $tenant, 'integration' => $integration] = $this->tenantWithIntegration();
        $tenant->update(['settings_json' => ['conversations' => ['ai_enabled' => true]]]);
        $igChannel = $this->socialChannel($tenant->id, $integration, 'INSTAGRAM_DM', 'IG-ACC-10');
        $fbChannel = $this->socialChannel($tenant->id, $integration, 'FACEBOOK_MESSENGER', 'FB-PAGE-20');

        $igPayload = $this->socialPayload('instagram', 'IG-ACC-10', [
            $this->socialMessage('IGSID-USER-1', 'IG-ACC-10', 'mid.ig.1', 'Hola desde Instagram!'),
            $this->socialMessage('IG-ACC-10', 'IGSID-USER-1', 'mid.ig.echo', 'Eco propio', true),
        ]);
        $fbPayload = $this->socialPayload('page', 'FB-PAGE-20', [
            $this->socialMessage('PSID-USER-2', 'FB-PAGE-20', 'mid.fb.1', 'Hola desde Messenger!'),
        ]);

        // Redeliver Instagram payload twice to verify idempotency
        $this->postWebhook($igPayload)->assertOk();
        $this->postWebhook($igPayload)->assertOk();
        $this->postWebhook($fbPayload)->assertOk();

        $this->assertSame(1, DB::table('messages')->where('tenant_id', $tenant->id)->where('channel_account_id', $igChannel)->count());
        $this->assertSame(1, DB::table('messages')->where('tenant_id', $tenant->id)->where('channel_account_id', $fbChannel)->count());

        $this->assertDatabaseHas('conversations', [
            'tenant_id' => $tenant->id,
            'channel_account_id' => $igChannel,
            'provider_thread_id' => 'ig:IGSID-USER-1',
            'control_state' => 'AI_ACTIVE',
        ]);
        $this->assertDatabaseHas('conversations', [
            'tenant_id' => $tenant->id,
            'channel_account_id' => $fbChannel,
            'provider_thread_id' => 'fb:PSID-USER-2',
            'control_state' => 'AI_ACTIVE',
        ]);

        $this->assertDatabaseHas('contact_identities', [
            'tenant_id' => $tenant->id,
            'channel_type' => 'INSTAGRAM',
            'provider_user_id' => 'IGSID-USER-1',
        ]);
        $this->assertDatabaseHas('contact_identities', [
            'tenant_id' => $tenant->id,
            'channel_type' => 'FACEBOOK',
            'provider_user_id' => 'PSID-USER-2',
        ]);

        Queue::assertPushed(RunAgentJob::class, 2);
    }

    public function test_unmapped_or_ambiguous_social_account_fails_closed(): void
    {
        ['tenant' => $a, 'integration' => $ia] = $this->tenantWithIntegration();
        ['tenant' => $b, 'integration' => $ib] = $this->tenantWithIntegration();
        $this->socialChannel($a->id, $ia, 'INSTAGRAM_DM', 'IG-DUP');
        $this->socialChannel($b->id, $ib, 'INSTAGRAM_DM', 'IG-DUP');

        $this->postWebhook($this->socialPayload('instagram', 'IG-UNKNOWN', [
            $this->socialMessage('U1', 'IG-UNKNOWN', 'mid.u1', 'Hola'),
        ]))->assertOk();

        $this->postWebhook($this->socialPayload('instagram', 'IG-DUP', [
            $this->socialMessage('U2', 'IG-DUP', 'mid.u2', 'Hola'),
        ]))->assertOk();

        $this->assertSame(0, DB::table('messages')->whereIn('tenant_id', [$a->id, $b->id])->count());
    }

    public function test_receipt_is_rejected_if_social_account_moves_to_another_tenant(): void
    {
        Queue::fake([ProcessMetaWebhookReceipt::class]);
        ['tenant' => $a, 'integration' => $ia] = $this->tenantWithIntegration();
        ['tenant' => $b, 'integration' => $ib] = $this->tenantWithIntegration();
        $channelA = $this->socialChannel($a->id, $ia, 'FACEBOOK_MESSENGER', 'FB-MOVE');

        $this->postWebhook($this->socialPayload('page', 'FB-MOVE', [
            $this->socialMessage('PSID-9', 'FB-MOVE', 'mid.move.1', 'Secreto de A'),
        ]))->assertOk();

        $receiptId = (int) DB::table('webhook_receipts')->where('tenant_id', $a->id)->value('id');
        DB::table('channel_accounts')->where('id', $channelA)->update(['provider_account_id' => 'FB-OLD']);
        $this->socialChannel($b->id, $ib, 'FACEBOOK_MESSENGER', 'FB-MOVE');

        (new ProcessMetaWebhookReceipt($a->id, $receiptId))->handle(app(MetaWebhookProcessor::class));

        $this->assertDatabaseHas('webhook_receipts', [
            'id' => $receiptId,
            'processing_status' => 'REJECTED',
            'last_error_code' => 'CHANNEL_CHANGED',
        ]);
        $this->assertDatabaseMissing('messages', ['provider_message_id' => 'mid.move.1']);
    }

    public function test_messenger_transport_and_dispatcher_handle_outcomes_and_24h_window(): void
    {
        ['tenant' => $tenant, 'integration' => $integration] = $this->tenantWithIntegration();
        $channelId = $this->socialChannel($tenant->id, $integration, 'INSTAGRAM_DM', 'IG-SEND-1');
        $channel = (array) DB::table('channel_accounts')->find($channelId);
        $transport = app(MetaMessengerTransport::class);
        Http::preventStrayRequests();

        // Disabled by default
        $this->assertSame('CHANNEL_SEND_DISABLED', $transport->send($channel, 'IGSID-5', 'hola', 'nonce-1')->errorCode);

        // Media unsupported
        $this->assertSame('MEDIA_UNSUPPORTED', $transport->send($channel, 'IGSID-5', 'hola', 'nonce-1', ['kind' => 'IMAGE', 'mime' => 'image/jpeg', 'name' => 'x.jpg', 'contents' => 'x'])->errorCode);

        // Fake send mode works locally
        config(['services.meta.send_fake' => true]);
        $fakeResult = $transport->send($channel, 'IGSID-5', 'hola', 'nonce-fake');
        $this->assertTrue($fakeResult->accepted);
        $this->assertSame('fake:nonce-fake', $fakeResult->providerMessageId);
        config(['services.meta.send_fake' => false]);

        // Live Graph API outcomes via Http::fake
        config(['services.meta.send_enabled' => true, 'services.webhooks.secrets' => ['wa-token-'.$tenant->id => 'page-token']]);
        Http::fake([
            'graph.facebook.com/*' => Http::sequence()
                ->push(['recipient_id' => 'IGSID-5', 'message_id' => 'm_out_1'], 200)
                ->push(['error' => ['code' => 190]], 401)
                ->push('', 502),
        ]);

        $ok = $transport->send($channel, 'IGSID-5', 'hola', 'nonce-2');
        $this->assertTrue($ok->accepted);
        $this->assertSame('m_out_1', $ok->providerMessageId);

        $revoked = $transport->send($channel, 'IGSID-5', 'hola', 'nonce-3');
        $this->assertFalse($revoked->accepted);
        $this->assertSame('META_TOKEN_REVOKED', $revoked->errorCode);

        // Re-activate integration to test 502 ambiguity and 24h window via OutboundDispatcher
        DB::table('integration_connections')->where('id', $integration)->update(['status' => 'ACTIVE', 'access_token_secret_ref' => 'wa-token-'.$tenant->id]);
        try {
            $transport->send($channel, 'IGSID-5', 'hola', 'nonce-4');
            $this->fail('Expected DeliveryAmbiguous on 502');
        } catch (DeliveryAmbiguous) {
        }

        // End-to-end outbound dispatch with expired 24h service window
        $this->postWebhook($this->socialPayload('instagram', 'IG-SEND-1', [
            $this->socialMessage('IGSID-WIN', 'IG-SEND-1', 'mid.win.1', 'Consulta vieja'),
        ]))->assertOk();

        $conversationId = (int) DB::table('conversations')->where('tenant_id', $tenant->id)->where('provider_thread_id', 'ig:IGSID-WIN')->value('id');
        DB::table('messages')->where('tenant_id', $tenant->id)->where('conversation_id', $conversationId)->update([
            'occurred_at' => CarbonImmutable::now('UTC')->subHours(25)->format('Y-m-d H:i:s.v'),
            'created_at' => CarbonImmutable::now('UTC')->subHours(25)->format('Y-m-d H:i:s.v'),
        ]);

        $draft = app(ConversationControl::class)->proposeBotReply($tenant->id, $conversationId, 1, 'Respuesta fuera de ventana', 'gen-win-1');
        $status = app(OutboundDispatcher::class)->dispatch($tenant->id, (int) $draft['job_id']);
        $this->assertSame('FAILED', $status);
        $this->assertDatabaseHas('outbound_jobs', ['id' => $draft['job_id'], 'status' => 'FAILED', 'last_error_code' => 'OUTSIDE_SERVICE_WINDOW']);
    }

    public function test_meta_simulate_command_provisions_channels_and_delivers_signed_webhook(): void
    {
        ['tenant' => $tenant] = $this->tenantWithIntegration();

        $this->artisan('meta:simulate', [
            'channel' => 'instagram',
            'sender' => 'IGSID-SIM-99',
            'text' => 'Hola desde meta:simulate!',
            '--tenant' => $tenant->slug,
            '--setup' => true,
        ])->assertSuccessful();

        $this->assertDatabaseHas('conversations', [
            'tenant_id' => $tenant->id,
            'provider_thread_id' => 'ig:IGSID-SIM-99',
        ]);
        $this->assertDatabaseHas('messages', [
            'tenant_id' => $tenant->id,
            'text_body' => 'Hola desde meta:simulate!',
        ]);
    }
}
