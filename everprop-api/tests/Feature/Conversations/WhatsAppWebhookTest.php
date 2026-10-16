<?php

namespace Tests\Feature\Conversations;

use App\Domain\AgentRuntime\Jobs\RunAgentJob;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Queue;
use Tests\TestCase;

/** S06 with synthetic payloads only: no connection to Meta. */
final class WhatsAppWebhookTest extends TestCase
{
    use ConversationTestSupport, DatabaseTransactions;

    protected function setUp(): void
    {
        parent::setUp();
        // Rate limits are exercised separately; a shared 127.0.0.1 must not throttle fixtures.
        config(['conversations.web_rate_limit_per_minute' => 10_000, 'conversations.ai_enabled' => true]);
        // G1 runtime tests: the assistant turn is covered in tests/Feature/AgentRuntime.
        Queue::fake([RunAgentJob::class]);
        config(['services.meta.app_secret' => self::APP_SECRET, 'services.meta.webhook_verify_token' => 'verify-me']);
    }

    public function test_verification_handshake_requires_the_configured_token(): void
    {
        $this->get('/api/v1/webhooks/meta/whatsapp?hub.mode=subscribe&hub.verify_token=verify-me&hub.challenge=1158201444')
            ->assertOk()->assertSee('1158201444', false);
        $this->get('/api/v1/webhooks/meta/whatsapp?hub.mode=subscribe&hub.verify_token=wrong&hub.challenge=1')->assertForbidden();
    }

    public function test_without_ai_new_conversations_wait_for_an_advisor(): void
    {
        config(['conversations.ai_enabled' => false]);
        ['tenant' => $tenant, 'integration' => $integration] = $this->tenantWithIntegration();
        $this->whatsappChannel($tenant->id, $integration, 'PN-NOAI');

        $this->postWebhook($this->waPayload('PN-NOAI', [$this->waText('wamid.noai', 'hola')]))->assertOk();

        $this->assertDatabaseHas('conversations', ['tenant_id' => $tenant->id, 'control_state' => 'WAITING_HUMAN', 'bot_mode' => 'HUMAN_FIRST']);
    }

    public function test_invalid_or_missing_signature_is_rejected_before_any_write(): void
    {
        ['tenant' => $tenant, 'integration' => $integration] = $this->tenantWithIntegration();
        $this->whatsappChannel($tenant->id, $integration, 'PN-1');
        $raw = $this->waPayload('PN-1', [$this->waText('wamid.A', 'hola')]);

        $this->postWebhook($raw, 'other-secret')->assertStatus(401);
        $this->postWebhook($raw, null)->assertStatus(401);
        $this->assertSame(0, DB::table('messages')->where('tenant_id', $tenant->id)->count());
    }

    public function test_twenty_deliveries_of_the_same_event_persist_one_message_in_the_right_tenant(): void
    {
        ['tenant' => $tenant, 'integration' => $integration] = $this->tenantWithIntegration();
        $channel = $this->whatsappChannel($tenant->id, $integration, 'PN-2');
        $raw = $this->waPayload('PN-2', [$this->waText('wamid.DUP', 'tenés el 12a?')]);

        for ($i = 0; $i < 20; $i++) {
            $this->postWebhook($raw)->assertOk();
        }

        $this->assertSame(1, DB::table('messages')->where('tenant_id', $tenant->id)->where('channel_account_id', $channel)->count());
        $this->assertSame(1, DB::table('conversations')->where('tenant_id', $tenant->id)->count());
        $this->assertSame(1, DB::table('domain_outbox')->where('tenant_id', $tenant->id)->where('event_type', 'MESSAGE_INBOUND_RECEIVED')->count());
        $this->assertDatabaseHas('messages', ['tenant_id' => $tenant->id, 'provider_message_id' => 'wamid.DUP', 'sequence' => 1, 'text_body' => 'tenés el 12a?']);
    }

    public function test_same_sender_on_two_tenants_never_shares_contacts_or_conversations(): void
    {
        ['tenant' => $a, 'integration' => $ia] = $this->tenantWithIntegration();
        ['tenant' => $b, 'integration' => $ib] = $this->tenantWithIntegration();
        $this->whatsappChannel($a->id, $ia, 'PN-A');
        $this->whatsappChannel($b->id, $ib, 'PN-B');

        $this->postWebhook($this->waPayload('PN-A', [$this->waText('wamid.1', 'hola A')]))->assertOk();
        $this->postWebhook($this->waPayload('PN-B', [$this->waText('wamid.1', 'hola B')]))->assertOk();

        $this->assertSame(['hola A'], DB::table('messages')->where('tenant_id', $a->id)->pluck('text_body')->all());
        $this->assertSame(['hola B'], DB::table('messages')->where('tenant_id', $b->id)->pluck('text_body')->all());
        $contactA = DB::table('contacts')->where('tenant_id', $a->id)->value('id');
        $this->assertSame(0, DB::table('conversations')->where('tenant_id', $b->id)->where('contact_id', $contactA)->count());
    }

    public function test_unmapped_phone_number_is_acknowledged_and_ignored(): void
    {
        ['tenant' => $a, 'integration' => $ia] = $this->tenantWithIntegration();
        $this->whatsappChannel($a->id, $ia, 'PN-KNOWN');

        $this->postWebhook($this->waPayload('PN-UNKNOWN', [$this->waText('wamid.x', 'x')]))->assertOk();

        $this->assertSame(0, DB::table('messages')->where('tenant_id', $a->id)->count());
    }

    public function test_a_phone_number_id_can_belong_to_only_one_tenant(): void
    {
        ['tenant' => $a, 'integration' => $ia] = $this->tenantWithIntegration();
        ['tenant' => $b, 'integration' => $ib] = $this->tenantWithIntegration();
        $this->whatsappChannel($a->id, $ia, 'PN-UNIQUE');

        $this->expectException(UniqueConstraintViolationException::class);
        $this->whatsappChannel($b->id, $ib, 'PN-UNIQUE');
    }

    public function test_paused_channel_or_mismatched_waba_drops_messages(): void
    {
        ['tenant' => $tenant, 'integration' => $integration] = $this->tenantWithIntegration();
        $channel = $this->whatsappChannel($tenant->id, $integration, 'PN-P');
        DB::table('channel_accounts')->where('id', $channel)->update(['metadata_json' => json_encode(['waba_id' => 'OTHER-WABA'])]);
        $this->postWebhook($this->waPayload('PN-P', [$this->waText('wamid.w', 'hola')]))->assertOk();
        DB::table('channel_accounts')->where('id', $channel)->update(['metadata_json' => null, 'status' => 'PAUSED']);
        $this->postWebhook($this->waPayload('PN-P', [$this->waText('wamid.p', 'hola')]))->assertOk();

        $this->assertSame(0, DB::table('messages')->where('tenant_id', $tenant->id)->count());
    }

    public function test_signed_but_malformed_payload_is_acknowledged_without_crashing(): void
    {
        ['tenant' => $tenant, 'integration' => $integration] = $this->tenantWithIntegration();
        $this->whatsappChannel($tenant->id, $integration, 'PN-M');
        $raw = json_encode(['object' => 'whatsapp_business_account', 'entry' => ['x', ['changes' => 'y'], ['changes' => [[
            'field' => 'messages', 'value' => ['metadata' => ['phone_number_id' => 'PN-M'], 'contacts' => 'z',
                'messages' => ['bad', ['from' => ['nested'], 'id' => 'wamid.m'], ['from' => '5493881111111', 'id' => 'wamid.ok', 'type' => 'text', 'text' => 'not-an-object']],
                'statuses' => [7]],
        ]]]]]);

        $this->postWebhook($raw)->assertOk();
        $this->postWebhook('{not json')->assertOk();
        $this->assertDatabaseHas('messages', ['tenant_id' => $tenant->id, 'provider_message_id' => 'wamid.ok', 'text_body' => null]);
    }

    public function test_delivery_statuses_never_move_backwards(): void
    {
        ['tenant' => $tenant, 'integration' => $integration] = $this->tenantWithIntegration();
        $channel = $this->whatsappChannel($tenant->id, $integration, 'PN-3');
        $this->postWebhook($this->waPayload('PN-3', [$this->waText('wamid.in', 'hola')]))->assertOk();
        $conversation = DB::table('conversations')->where('tenant_id', $tenant->id)->first();
        DB::table('messages')->insert([
            'tenant_id' => $tenant->id, 'conversation_id' => $conversation->id, 'channel_account_id' => $channel, 'sequence' => 2,
            'provider_message_id' => 'wamid.out', 'direction' => 'OUTBOUND', 'sender_type' => 'USER', 'message_type' => 'TEXT',
            'text_body' => 'respuesta', 'delivery_status' => 'SENT', 'occurred_at' => now(),
        ]);

        $status = fn (string $s) => ['id' => 'wamid.out', 'status' => $s, 'timestamp' => (string) now()->timestamp, 'recipient_id' => '5493881111111'];
        $this->postWebhook($this->waPayload('PN-3', [], [$status('read')]))->assertOk();
        $this->postWebhook($this->waPayload('PN-3', [], [$status('delivered')]))->assertOk();
        $this->postWebhook($this->waPayload('PN-3', [], [$status('failed')]))->assertOk();

        $this->assertDatabaseHas('messages', ['provider_message_id' => 'wamid.out', 'delivery_status' => 'READ']);
    }
}
