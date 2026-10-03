<?php

namespace Tests\Feature\Conversations;

use App\Domain\Conversations\Jobs\DispatchOutboundJob;
use App\Domain\Conversations\Services\ChannelPolicy;
use App\Domain\Conversations\Services\OutboundDispatcher;
use App\Domain\Identity\Enums\RoleCode;
use App\Domain\Integrations\Services\IntegrationTokens;
use App\Domain\Tenancy\Models\Tenant;
use App\Models\User;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Http\Response;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Queue;
use Illuminate\Support\Str;
use Illuminate\Testing\TestResponse;
use Tests\TestCase;

/** Plan W2: WhatsApp's 24-hour customer service window, per conversation and number, enforced server-side. */
final class ChannelPolicyTest extends TestCase
{
    use ConversationTestSupport, DatabaseTransactions;

    protected function setUp(): void
    {
        parent::setUp();
        config(['services.meta.app_secret' => self::APP_SECRET, 'services.meta.send_enabled' => true, 'conversations.ai_enabled' => false]);
        Http::preventStrayRequests();
        Http::fake(['graph.facebook.com/*' => Http::response(['messages' => [['id' => 'wamid.OUT']]])]);
    }

    protected function tearDown(): void
    {
        CarbonImmutable::setTestNow();
        parent::tearDown();
    }

    /** @return array{tenant: Tenant, conversation: int, channel: array<string, mixed>, advisor: User} */
    private function whatsappConversation(string $phoneNumberId, CarbonImmutable $customerWroteAt): array
    {
        ['tenant' => $tenant, 'integration' => $integration] = $this->tenantWithIntegration();
        $channelId = $this->whatsappChannel($tenant->id, $integration, $phoneNumberId);
        app(IntegrationTokens::class)->store($tenant->id, $integration, 'token-'.$phoneNumberId);
        $this->postWebhook($this->waPayload($phoneNumberId, [['timestamp' => (string) $customerWroteAt->timestamp] + $this->waText('wamid.'.Str::random(8), 'Hola')]))->assertOk();
        $conversation = (int) DB::table('conversations')->where('tenant_id', $tenant->id)->where('channel_account_id', $channelId)->value('id');
        $advisor = $this->user($tenant, RoleCode::SALES_ADVISOR);
        DB::table('conversations')->where('id', $conversation)->update(['control_state' => 'HUMAN_ACTIVE', 'controlled_by_user_id' => $advisor->id, 'assigned_user_id' => $advisor->id]);

        return ['tenant' => $tenant, 'conversation' => $conversation, 'channel' => (array) DB::table('channel_accounts')->find($channelId), 'advisor' => $advisor];
    }

    /**
     * @param  array{tenant: Tenant, conversation: int, channel: array<string, mixed>, advisor: User}  $c
     * @return TestResponse<Response>
     */
    private function reply(array $c, string $text, ?string $key = null): TestResponse
    {
        $publicId = (string) DB::table('conversations')->where('id', $c['conversation'])->value('public_id');

        return $this->actingAs($c['advisor'])->withHeaders($this->tenantHeaders($c['tenant']))
            ->postJson("/api/v1/admin/conversations/$publicId/messages", ['text' => $text, 'idempotency_key' => $key ?? 'reply-'.Str::random(16)]);
    }

    public function test_inside_the_window_the_advisor_reply_is_sent(): void
    {
        $c = $this->whatsappConversation('PN-OPEN', CarbonImmutable::now()->subHours(23));

        $this->reply($c, 'Hola, te paso la info')->assertStatus(202);

        $this->assertDatabaseHas('messages', ['conversation_id' => $c['conversation'], 'direction' => 'OUTBOUND', 'delivery_status' => 'SENT']);
        Http::assertSent(fn ($r) => str_contains($r->url(), '/PN-OPEN/messages'));
    }

    public function test_after_24_hours_free_text_is_refused_up_front_and_nothing_is_sent(): void
    {
        $c = $this->whatsappConversation('PN-CLOSED', CarbonImmutable::now()->subHours(25));

        $this->reply($c, 'Hola, ¿seguís interesado?')->assertStatus(409)->assertJsonPath('error.code', 'OUTSIDE_SERVICE_WINDOW');

        $this->assertDatabaseMissing('messages', ['conversation_id' => $c['conversation'], 'direction' => 'OUTBOUND']);
        Http::assertNothingSent();
    }

    public function test_the_exact_24_hour_mark_is_closed(): void
    {
        $wrote = CarbonImmutable::parse('2026-01-05 10:00:00', 'UTC');
        CarbonImmutable::setTestNow($wrote);
        $c = $this->whatsappConversation('PN-EDGE', $wrote);
        $policy = app(ChannelPolicy::class);

        CarbonImmutable::setTestNow($wrote->addHours(24)->subSecond());
        $this->assertNull($policy->check($c['tenant']->id, $c['conversation'], $c['channel']));
        CarbonImmutable::setTestNow($wrote->addHours(24));
        $this->assertSame('OUTSIDE_SERVICE_WINDOW', $policy->check($c['tenant']->id, $c['conversation'], $c['channel']));
    }

    public function test_a_reply_queued_inside_the_window_fails_at_send_time_if_it_closed_meanwhile(): void
    {
        $wrote = CarbonImmutable::now()->subHours(23);
        $c = $this->whatsappConversation('PN-LATE', $wrote);
        Queue::fake([DispatchOutboundJob::class]);
        $this->reply($c, 'Respuesta que quedó en cola')->assertStatus(202);
        $job = DB::table('outbound_jobs')->where('conversation_id', $c['conversation'])->first(['id']);

        CarbonImmutable::setTestNow($wrote->addHours(24)->addMinute());
        $status = app(OutboundDispatcher::class)->dispatch($c['tenant']->id, (int) $job->id);

        $this->assertSame('FAILED', $status);
        $this->assertDatabaseHas('outbound_jobs', ['id' => $job->id, 'status' => 'FAILED', 'last_error_code' => 'OUTSIDE_SERVICE_WINDOW']);
        Http::assertNothingSent();
    }

    public function test_a_future_dated_provider_timestamp_cannot_extend_the_window(): void
    {
        $received = CarbonImmutable::now();
        $c = $this->whatsappConversation('PN-FUTURE', $received->addHours(48));

        CarbonImmutable::setTestNow($received->addHours(25));

        $this->assertSame('OUTSIDE_SERVICE_WINDOW', app(ChannelPolicy::class)->check($c['tenant']->id, $c['conversation'], $c['channel']));
    }

    public function test_retrying_a_queued_reply_after_the_window_closed_is_a_replay_not_a_refusal(): void
    {
        $wrote = CarbonImmutable::now()->subHours(23);
        $c = $this->whatsappConversation('PN-REPLAY', $wrote);
        $this->reply($c, 'Te paso la info', 'reply-same-key-0001')->assertStatus(202);

        CarbonImmutable::setTestNow($wrote->addHours(25));

        $this->reply($c, 'Te paso la info', 'reply-same-key-0001')->assertOk()->assertJsonPath('data.replayed', true);
        $this->assertSame(1, DB::table('outbound_jobs')->where('conversation_id', $c['conversation'])->count());
    }

    public function test_a_recent_message_in_another_conversation_of_the_same_number_does_not_open_this_one(): void
    {
        $c = $this->whatsappConversation('PN-TWO', CarbonImmutable::now()->subHours(30));
        $this->postWebhook($this->waPayload('PN-TWO', [$this->waText('wamid.other', 'Hola, soy otro cliente', '5493889999999')]))->assertOk();
        $this->assertSame(2, DB::table('conversations')->where('tenant_id', $c['tenant']->id)->where('channel_account_id', $c['channel']['id'])->count());

        $this->assertSame('OUTSIDE_SERVICE_WINDOW', app(ChannelPolicy::class)->check($c['tenant']->id, $c['conversation'], $c['channel']));
    }

    public function test_missing_data_fails_closed(): void
    {
        $c = $this->whatsappConversation('PN-MISS', CarbonImmutable::now()->subHour());
        $policy = app(ChannelPolicy::class);
        $tenant = $c['tenant']->id;

        DB::table('messages')->where('conversation_id', $c['conversation'])->where('direction', 'INBOUND')->delete();
        $this->assertSame('OUTSIDE_SERVICE_WINDOW', $policy->check($tenant, $c['conversation'], $c['channel']), 'no inbound message');
        $this->assertSame('CHANNEL_INACTIVE', $policy->check($tenant, $c['conversation'], ['status' => 'PAUSED'] + $c['channel']));
        $this->assertSame('CHANNEL_INACTIVE', $policy->check($tenant, $c['conversation'], []));
        $this->assertSame('CHANNEL_UNSUPPORTED', $policy->check($tenant, $c['conversation'], ['channel_type' => 'INSTAGRAM'] + $c['channel']));
    }

    public function test_only_approved_templates_pass(): void
    {
        $c = $this->whatsappConversation('PN-TPL', CarbonImmutable::now()->subHours(48));
        $policy = app(ChannelPolicy::class);
        $channel = ['metadata_json' => json_encode(['approved_templates' => ['seguimiento_visita']])] + $c['channel'];

        $this->assertNull($policy->check($c['tenant']->id, $c['conversation'], $channel, 'seguimiento_visita'));
        $this->assertSame('TEMPLATE_NOT_APPROVED', $policy->check($c['tenant']->id, $c['conversation'], $channel, 'promo_no_aprobada'));
        $this->assertSame('TEMPLATE_NOT_APPROVED', $policy->check($c['tenant']->id, $c['conversation'], $c['channel'], 'seguimiento_visita'));
    }

    public function test_the_window_is_per_number_and_per_tenant(): void
    {
        $old = $this->whatsappConversation('PN-A', CarbonImmutable::now()->subHours(30));
        // A recent message from the same customer on another tenant's number opens nothing here.
        $this->whatsappConversation('PN-OTHER', CarbonImmutable::now()->subMinutes(5));
        // Nor does a recent message on a second number of the same tenant.
        $second = $this->whatsappChannel($old['tenant']->id, (int) $old['channel']['integration_id'], 'PN-A2');
        $this->postWebhook($this->waPayload('PN-A2', [$this->waText('wamid.second', 'Hola por el otro número')]))->assertOk();
        $this->assertDatabaseHas('conversations', ['tenant_id' => $old['tenant']->id, 'channel_account_id' => $second]);

        $this->assertSame('OUTSIDE_SERVICE_WINDOW', app(ChannelPolicy::class)->check($old['tenant']->id, $old['conversation'], $old['channel']));
        $this->assertSame('CHANNEL_INACTIVE', app(ChannelPolicy::class)->check($old['tenant']->id + 1, $old['conversation'], $old['channel']), 'channel of another tenant');
    }

    public function test_web_chat_has_no_provider_window(): void
    {
        ['tenant' => $tenant, 'integration' => $integration] = $this->tenantWithIntegration('WEB');
        $channel = (array) DB::table('channel_accounts')->find($this->webChannel($tenant->id, $integration)['id']);

        $this->assertNull(app(ChannelPolicy::class)->check($tenant->id, 0, $channel));
    }
}
