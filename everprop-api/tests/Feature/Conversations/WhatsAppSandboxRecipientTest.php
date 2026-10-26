<?php

namespace Tests\Feature\Conversations;

use App\Domain\Conversations\Transports\WhatsAppCloudTransport;
use App\Domain\Identity\Enums\RoleCode;
use App\Domain\Integrations\Services\IntegrationTokens;
use App\Domain\Tenancy\Models\Tenant;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

final class WhatsAppSandboxRecipientTest extends TestCase
{
    use ConversationTestSupport, DatabaseTransactions;

    private const FROM = '5493881111111';

    private const TO = '543881111111';

    /** @return array<string, mixed> */
    private function channel(string $phone = '2002'): array
    {
        ['tenant' => $tenant, 'integration' => $integration] = $this->tenantWithIntegration();
        app(IntegrationTokens::class)->store($tenant->id, $integration, 'synthetic-sandbox-token');
        config(['services.meta.send_enabled' => true, 'services.meta.whatsapp_sandbox_phone_number_id' => '2002',
            'services.meta.whatsapp_sandbox_recipient_from' => self::FROM, 'services.meta.whatsapp_sandbox_recipient_to' => self::TO]);
        Http::preventStrayRequests();
        Http::fake(['*/messages' => Http::response(['messages' => [['id' => 'wamid.sandbox']]])]);

        return (array) DB::table('channel_accounts')->find($this->whatsappChannel($tenant->id, $integration, $phone));
    }

    public function test_only_the_explicit_sandbox_pair_is_mapped_without_changing_the_channel(): void
    {
        $channel = $this->channel();
        $before = DB::table('channel_accounts')->where('id', $channel['id'])->first();
        $this->assertTrue(app(WhatsAppCloudTransport::class)->send($channel, self::FROM, 'test', 'n')->accepted);
        Http::assertSent(fn ($r) => str_ends_with($r->url(), '/2002/messages') && $r['to'] === self::TO);
        Http::assertSentCount(1);
        $this->assertEquals($before, DB::table('channel_accounts')->where('id', $channel['id'])->first());
    }

    public function test_other_recipients_channels_and_tenants_keep_their_original_identity(): void
    {
        $a = $this->channel();
        $b = $this->channel('3003');
        $transport = app(WhatsAppCloudTransport::class);
        $transport->send($a, '5493882222222', 'other person', 'a');
        $transport->send($b, self::FROM, 'other tenant', 'b');
        Http::assertSent(fn ($r) => str_ends_with($r->url(), '/2002/messages') && $r['to'] === '5493882222222');
        Http::assertSent(fn ($r) => str_ends_with($r->url(), '/3003/messages') && $r['to'] === self::FROM);
        Http::assertSentCount(2);
    }

    public function test_explicit_list_maps_three_testers_only_on_the_sandbox_channel(): void
    {
        $channel = $this->channel();
        $other = $this->channel('3003');
        $recipients = [self::FROM, '5493882222222', '5493883333333'];
        config(['services.meta.whatsapp_sandbox_recipients' => $recipients,
            'services.meta.whatsapp_sandbox_recipient_from' => null, 'services.meta.whatsapp_sandbox_recipient_to' => null]);
        $transport = app(WhatsAppCloudTransport::class);
        foreach ($recipients as $recipient) {
            $this->assertTrue($transport->send($channel, $recipient, 'text', 'n')->accepted);
            Http::assertSent(fn ($r) => $r['to'] === '54'.substr($recipient, 3));
        }
        $transport->send($channel, '5493884444444', 'unlisted', 'n');
        $transport->send($other, $recipients[1], 'other channel', 'n');
        Http::assertSent(fn ($r) => $r['to'] === '5493884444444');
        Http::assertSent(fn ($r) => str_ends_with($r->url(), '/3003/messages') && $r['to'] === $recipients[1]);
        Http::assertSentCount(5);
    }

    public function test_malformed_listed_recipient_is_rejected_without_http(): void
    {
        $channel = $this->channel();
        config(['services.meta.whatsapp_sandbox_recipients' => ['549invalid']]);
        $this->assertSame('SANDBOX_RECIPIENT_INVALID', app(WhatsAppCloudTransport::class)->send($channel, '549invalid', 'text', 'n')->errorCode);
        Http::assertNothingSent();
    }

    public function test_a_mapping_to_a_different_person_is_rejected_without_http(): void
    {
        $channel = $this->channel();
        config(['services.meta.whatsapp_sandbox_recipient_to' => '543882222222']);
        $result = app(WhatsAppCloudTransport::class)->send($channel, self::FROM, 'test', 'n');
        $this->assertSame('SANDBOX_RECIPIENT_INVALID', $result->errorCode);
        Http::assertNothingSent();
    }

    public function test_disabled_mapping_and_templates_do_not_rewrite_recipients(): void
    {
        $channel = $this->channel();
        $transport = app(WhatsAppCloudTransport::class);
        $transport->send($channel, self::FROM, '', 'template', null, ['name' => 'hello_world', 'language' => 'en_US', 'params' => []]);
        config(['services.meta.whatsapp_sandbox_phone_number_id' => null]);
        $transport->send($channel, self::FROM, 'normal', 'normal');
        Http::assertSentCount(2);
        Http::assertNotSent(fn ($r) => $r['to'] !== self::FROM);
    }

    public function test_blank_or_malformed_mapping_fails_closed(): void
    {
        $channel = $this->channel();
        foreach (['', null, '+543881111111', ['543881111111']] as $invalid) {
            config(['services.meta.whatsapp_sandbox_recipient_to' => $invalid]);
            $this->assertSame('SANDBOX_RECIPIENT_INVALID', app(WhatsAppCloudTransport::class)->send($channel, self::FROM, 'test', 'n')->errorCode);
        }
        config(['services.meta.whatsapp_sandbox_recipient_from' => '549invalid']);
        $this->assertSame('SANDBOX_RECIPIENT_INVALID', app(WhatsAppCloudTransport::class)->send($channel, '549invalid', 'test', 'n')->errorCode);
        Http::assertNothingSent();
    }

    public function test_media_keeps_its_original_recipient(): void
    {
        $channel = $this->channel();
        Http::fake(['*/media' => Http::response(['id' => 'media.test']), '*/messages' => Http::response(['messages' => [['id' => 'wamid.media']]])]);
        $this->assertTrue(app(WhatsAppCloudTransport::class)->send($channel, self::FROM, 'caption', 'n',
            ['kind' => 'IMAGE', 'mime' => 'image/png', 'name' => 'test.png', 'contents' => 'synthetic'])->accepted);
        Http::assertSent(fn ($r) => str_ends_with($r->url(), '/messages') && $r['to'] === self::FROM);
    }

    public function test_inbox_reply_uses_override_but_preserves_the_inbound_conversation_identity(): void
    {
        $channel = $this->channel();
        config(['services.meta.app_secret' => self::APP_SECRET, 'conversations.ai_enabled' => false]);
        $this->postWebhook($this->waPayload('2002', [$this->waText('wamid.sandbox.in', 'hello', self::FROM)]))->assertOk();
        $tenant = Tenant::query()->findOrFail($channel['tenant_id']);
        $conversation = DB::table('conversations')->where('tenant_id', $tenant->id)->sole();
        $admin = $this->user($tenant, RoleCode::TENANT_ADMIN);
        $this->actingAs($admin)->withHeaders($this->tenantHeaders($tenant))
            ->postJson('/api/v1/admin/conversations/'.$conversation->public_id.'/takeover')->assertOk();
        $this->postJson('/api/v1/admin/conversations/'.$conversation->public_id.'/messages',
            ['text' => 'reply', 'idempotency_key' => 'sandbox-reply-0001'])->assertStatus(202);
        Http::assertSent(fn ($r) => $r['to'] === self::TO && $r['text']['body'] === 'reply');
        $this->assertDatabaseHas('conversations', ['id' => $conversation->id, 'tenant_id' => $tenant->id, 'provider_thread_id' => 'wa:'.self::FROM]);
        $this->assertDatabaseHas('messages', ['tenant_id' => $tenant->id, 'conversation_id' => $conversation->id, 'text_body' => 'reply', 'delivery_status' => 'SENT']);
    }
}
