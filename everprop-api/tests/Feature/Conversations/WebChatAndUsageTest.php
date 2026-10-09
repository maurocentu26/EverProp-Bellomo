<?php

namespace Tests\Feature\Conversations;

use App\Domain\AgentRuntime\Jobs\RunAgentJob;
use App\Domain\Conversations\Exceptions\DeliveryAmbiguous;
use App\Domain\Conversations\Services\ConversationControl;
use App\Domain\Conversations\Transports\WhatsAppCloudTransport;
use App\Domain\Usage\QuotaExceeded;
use App\Domain\Usage\UsageLedger;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Queue;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\Str;
use Tests\TestCase;

/** S05 web sessions, S06 transport against a fake Graph API, S08 ledger. */
final class WebChatAndUsageTest extends TestCase
{
    use ConversationTestSupport, DatabaseTransactions;

    protected function setUp(): void
    {
        parent::setUp();
        // Rate limits are exercised separately; a shared 127.0.0.1 must not throttle fixtures.
        config(['conversations.web_rate_limit_per_minute' => 10_000, 'conversations.ai_enabled' => true]);
        // G1 runtime tests: the assistant turn is covered in tests/Feature/AgentRuntime.
        Queue::fake([RunAgentJob::class]);
    }

    public function test_anonymous_session_creation_is_rate_limited(): void
    {
        ['tenant' => $tenant, 'integration' => $integration] = $this->tenantWithIntegration('WEB');
        $widget = $this->webChannel($tenant->id, $integration);
        config(['conversations.web_rate_limit_per_minute' => 2]);
        RateLimiter::clear(md5('public-chat'.'public-chat|127.0.0.1'));
        $start = fn () => $this->withHeaders($this->tenantHeaders($tenant))->postJson('/api/v1/public/chat/sessions', ['widget_id' => $widget['public_id']]);

        $start()->assertCreated();
        $start()->assertCreated();
        $start()->assertStatus(429);
    }

    public function test_widget_rejects_unlisted_origins_and_tokens_from_another_tenant_host(): void
    {
        ['tenant' => $a, 'integration' => $ia] = $this->tenantWithIntegration('WEB');
        ['tenant' => $b, 'integration' => $ib] = $this->tenantWithIntegration('WEB');
        $widgetA = $this->webChannel($a->id, $ia);
        $this->webChannel($b->id, $ib);

        $this->withHeaders(['X-Everprop-Tenant' => $a->public_id, 'Origin' => 'https://evil.example'])
            ->postJson('/api/v1/public/chat/sessions', ['widget_id' => $widgetA['public_id']])->assertForbidden();
        $token = $this->withHeaders($this->tenantHeaders($a))
            ->postJson('/api/v1/public/chat/sessions', ['widget_id' => $widgetA['public_id']])->json('data.token');

        // A valid token of tenant A presented on tenant B's host is not a session there.
        $this->withHeaders($this->tenantHeaders($b))->withToken($token)->getJson('/api/v1/public/chat/messages')->assertUnauthorized();
        $this->withHeaders($this->tenantHeaders($b))->withToken($token)
            ->postJson('/api/v1/public/chat/messages', ['client_message_id' => (string) Str::uuid(), 'text' => 'x'])->assertUnauthorized();
    }

    public function test_widget_must_belong_to_the_resolved_tenant(): void
    {
        ['tenant' => $a] = $this->tenantWithIntegration('WEB');
        ['tenant' => $b, 'integration' => $ib] = $this->tenantWithIntegration('WEB');
        $foreignWidget = $this->webChannel($b->id, $ib);

        $this->withHeaders($this->tenantHeaders($a))
            ->postJson('/api/v1/public/chat/sessions', ['widget_id' => $foreignWidget['public_id']])->assertNotFound();
        $this->assertSame(0, DB::table('public_chat_sessions')->where('tenant_id', $a->id)->count());
    }

    public function test_session_token_is_scoped_to_one_conversation_and_client_retries_are_deduped(): void
    {
        ['tenant' => $tenant, 'integration' => $integration] = $this->tenantWithIntegration('WEB');
        $widget = $this->webChannel($tenant->id, $integration);
        $headers = $this->tenantHeaders($tenant);
        $first = $this->withHeaders($headers)->postJson('/api/v1/public/chat/sessions', ['widget_id' => $widget['public_id']])->json('data.token');
        $second = $this->withHeaders($headers)->postJson('/api/v1/public/chat/sessions', ['widget_id' => $widget['public_id']])->json('data.token');
        $clientId = (string) Str::uuid();

        $this->withToken($first)->postJson('/api/v1/public/chat/messages', ['client_message_id' => $clientId, 'text' => 'Busco un lote'])->assertCreated();
        $this->withToken($first)->postJson('/api/v1/public/chat/messages', ['client_message_id' => $clientId, 'text' => 'Busco un lote'])
            ->assertOk()->assertJsonPath('data.replayed', true);

        $this->withToken($second)->getJson('/api/v1/public/chat/messages')->assertOk()->assertJsonCount(0, 'data');
        $this->withToken($first)->getJson('/api/v1/public/chat/messages')->assertOk()->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.from', 'visitor');
        $this->withToken('not-a-token')->getJson('/api/v1/public/chat/messages')->assertUnauthorized();

        // The DB never stores the bearer token itself.
        $this->assertSame(0, DB::table('public_chat_sessions')->where('token_sha256', $first)->count());
    }

    public function test_visitor_never_sees_queued_or_cancelled_bot_drafts(): void
    {
        ['tenant' => $tenant, 'integration' => $integration] = $this->tenantWithIntegration('WEB');
        $widget = $this->webChannel($tenant->id, $integration);
        $token = $this->withHeaders($this->tenantHeaders($tenant))
            ->postJson('/api/v1/public/chat/sessions', ['widget_id' => $widget['public_id']])->json('data.token');
        $this->withToken($token)->postJson('/api/v1/public/chat/messages', ['client_message_id' => (string) Str::uuid(), 'text' => 'hola']);
        $conversation = (int) DB::table('conversations')->where('tenant_id', $tenant->id)->value('id');

        app(ConversationControl::class)->proposeBotReply($tenant->id, $conversation, 1, 'borrador interno', 'gen-1');

        $this->withToken($token)->getJson('/api/v1/public/chat/messages')->assertOk()->assertJsonCount(1, 'data')
            ->assertJsonMissing(['text' => 'borrador interno'])
            // The queued draft (sequence 2) holds the cursor so it is not skipped once it is sent.
            ->assertJsonPath('next_after', 1);
        $this->withToken($token)->postJson('/api/v1/public/chat/messages', ['client_message_id' => (string) Str::uuid(), 'text' => 'sigo acá']);
        $this->withToken($token)->getJson('/api/v1/public/chat/messages?after=1')->assertOk()->assertJsonPath('next_after', 1);
    }

    public function test_whatsapp_transport_is_disabled_by_default_and_maps_provider_outcomes(): void
    {
        ['tenant' => $tenant, 'integration' => $integration] = $this->tenantWithIntegration();
        $channelId = $this->whatsappChannel($tenant->id, $integration, 'PN-T');
        $channel = (array) DB::table('channel_accounts')->find($channelId);
        $transport = app(WhatsAppCloudTransport::class);
        Http::preventStrayRequests();

        $this->assertSame('CHANNEL_SEND_DISABLED', $transport->send($channel, '5493881111111', 'hola', 'n')->errorCode);

        config(['services.meta.send_enabled' => true, 'services.webhooks.secrets' => ['wa-token-'.$tenant->id => 'tok']]);
        Http::fake(['graph.facebook.com/*' => Http::sequence()
            ->push(['messages' => [['id' => 'wamid.OK']]], 200)
            ->push(['error' => ['code' => 131047]], 400)
            ->push('', 503)]);

        $this->assertSame('wamid.OK', $transport->send($channel, '5493881111111', 'hola', 'n')->providerMessageId);
        $rejected = $transport->send($channel, '5493881111111', 'hola', 'n');
        $this->assertFalse($rejected->accepted);
        $this->assertFalse($rejected->retryable);
        $this->expectException(DeliveryAmbiguous::class);
        $transport->send($channel, '5493881111111', 'hola', 'n');
    }

    public function test_ledger_reserves_before_spending_and_never_exceeds_caps(): void
    {
        ['tenant' => $a] = $this->tenantWithIntegration();
        ['tenant' => $b] = $this->tenantWithIntegration();
        config(['usage.global_cap_micros' => 1_000_000, 'usage.default_tenant_cap_micros' => 700_000]);
        $ledger = app(UsageLedger::class);
        $period = now('UTC')->format('Y-m');
        DB::table('usage_ledger')->where('period', $period)->delete();

        $ledger->reserve($a->id, 'run-1', 'LLM', 600_000);
        $this->assertTrue($ledger->reserve($a->id, 'run-1', 'LLM', 600_000)['replayed']);
        $ledger->reserve($b->id, 'run-2', 'LLM', 300_000);

        try {
            $ledger->reserve($a->id, 'run-3', 'LLM', 200_000); // tenant cap 700k
            $this->fail('Tenant cap exceeded without error.');
        } catch (QuotaExceeded) {
        }
        try {
            $ledger->reserve($b->id, 'run-4', 'LLM', 200_000); // global cap 1M (600k + 300k reserved)
            $this->fail('Global cap exceeded without error.');
        } catch (QuotaExceeded) {
        }

        $ledger->commit($a->id, 'run-1', 150_000); // real cost frees the unused reservation
        $ledger->reserve($b->id, 'run-4', 'LLM', 200_000);
        $ledger->markUnknown($b->id, 'run-4'); // UNKNOWN keeps its reservation
        $this->assertSame(650_000, $ledger->spent($period, null));
        $ledger->release($b->id, 'run-2');
        $this->assertSame(350_000, $ledger->spent($period, null));
    }
}
