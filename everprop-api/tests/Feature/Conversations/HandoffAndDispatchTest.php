<?php

namespace Tests\Feature\Conversations;

use App\Domain\AgentRuntime\Jobs\RunAgentJob;
use App\Domain\Conversations\Contracts\ChannelTransport;
use App\Domain\Conversations\Data\SendResult;
use App\Domain\Conversations\Exceptions\ConversationConflict;
use App\Domain\Conversations\Exceptions\DeliveryAmbiguous;
use App\Domain\Conversations\Services\ConversationControl;
use App\Domain\Conversations\Services\OutboundDispatcher;
use App\Domain\Conversations\Transports\TransportRegistry;
use App\Domain\Identity\Enums\RoleCode;
use App\Domain\Tenancy\Models\Tenant;
use App\Models\User;
use Closure;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Queue;
use Illuminate\Support\Str;
use Tests\TestCase;

/** S07: epoch fencing, send races and ambiguous deliveries (ADR D10/D11). */
final class HandoffAndDispatchTest extends TestCase
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

    public function test_takeover_cancels_unsent_bot_output_and_rejects_stale_generations(): void
    {
        [$tenant, $conversation, $advisor] = $this->conversation();
        $control = app(ConversationControl::class);

        $draft = $control->proposeBotReply($tenant->id, $conversation, 1, 'Te paso precios', 'gen-1');
        $control->takeover($tenant->id, $conversation, $advisor);

        $this->assertDatabaseHas('outbound_jobs', ['id' => $draft['job_id'], 'status' => 'CANCELLED', 'last_error_code' => 'STALE_CONTROL']);
        $this->assertDatabaseHas('messages', ['id' => $draft['message_id'], 'delivery_status' => 'CANCELLED']);
        $this->assertSame('CANCELLED', app(OutboundDispatcher::class)->dispatch($tenant->id, $draft['job_id']));

        // A generation that started under epoch 1 finishes after the takeover: discarded.
        $this->expectExceptionObject(new ConversationConflict('STALE_CONTROL', 'La conversación cambió de responsable.'));
        $control->proposeBotReply($tenant->id, $conversation, 1, 'Respuesta tardía', 'gen-2');
    }

    public function test_takeover_while_a_bot_send_is_in_flight_waits_for_it_then_confirms(): void
    {
        [$tenant, $conversation, $advisor] = $this->conversation();
        $control = app(ConversationControl::class);
        $draft = $control->proposeBotReply($tenant->id, $conversation, 1, 'Hola', 'gen-1');
        $observed = null;

        // The advisor takes control exactly while the provider call is running.
        $this->transport(function () use ($control, $tenant, $conversation, $advisor, &$observed): SendResult {
            $observed = $control->takeover($tenant->id, $conversation, $advisor);

            return SendResult::accepted('prov-1');
        });

        $this->assertSame('SENT', app(OutboundDispatcher::class)->dispatch($tenant->id, $draft['job_id']));
        $this->assertSame('TRANSITION_PENDING', $observed['state']);
        $this->assertDatabaseHas('conversations', ['id' => $conversation, 'control_state' => 'HUMAN_ACTIVE', 'control_epoch' => 2]);

        // No further bot output can start after the barrier.
        $this->expectException(ConversationConflict::class);
        $control->proposeBotReply($tenant->id, $conversation, 1, 'Otra', 'gen-3');
    }

    public function test_second_advisor_cannot_steal_a_pending_takeover(): void
    {
        [$tenant, $conversation, $manager] = $this->conversation();
        $control = app(ConversationControl::class);
        $draft = $control->proposeBotReply($tenant->id, $conversation, 1, 'Hola', 'gen-1');
        $second = $this->user($tenant, RoleCode::SALES_MANAGER);
        $stolen = null;
        $this->transport(function () use ($control, $tenant, $conversation, $manager, $second, &$stolen): SendResult {
            $control->takeover($tenant->id, $conversation, $manager);
            try {
                $control->takeover($tenant->id, $conversation, $second);
            } catch (ConversationConflict $e) {
                $stolen = $e->code_;
            }

            return SendResult::accepted(null);
        });

        app(OutboundDispatcher::class)->dispatch($tenant->id, $draft['job_id']);

        $this->assertSame('ALREADY_CONTROLLED', $stolen);
        $this->assertDatabaseHas('conversations', ['id' => $conversation, 'controlled_by_user_id' => $manager->id, 'control_state' => 'HUMAN_ACTIVE']);
    }

    public function test_reply_queued_by_a_user_deactivated_before_sending_is_not_sent(): void
    {
        [$tenant, $conversation, $manager] = $this->conversation();
        $control = app(ConversationControl::class);
        $control->takeover($tenant->id, $conversation, $manager);
        $reply = $control->humanReply($tenant->id, $conversation, $manager, 'hola', 'key-deactivated-001');
        DB::table('users')->where('id', $manager->id)->update(['status' => 'DISABLED']);

        $this->assertSame('CANCELLED', app(OutboundDispatcher::class)->dispatch($tenant->id, $reply['job_id']));
    }

    public function test_ambiguous_delivery_is_never_retried_and_needs_manual_resolution(): void
    {
        [$tenant, $conversation, $advisor, $publicId] = $this->conversation();
        $control = app(ConversationControl::class);
        $draft = $control->proposeBotReply($tenant->id, $conversation, 1, 'Hola', 'gen-1');
        $calls = 0;
        $this->transport(function () use (&$calls): SendResult {
            $calls++;
            throw new DeliveryAmbiguous('timeout after write');
        });

        $this->assertSame('UNKNOWN', app(OutboundDispatcher::class)->dispatch($tenant->id, $draft['job_id']));
        $this->assertSame('UNKNOWN', app(OutboundDispatcher::class)->dispatch($tenant->id, $draft['job_id']));
        $this->artisan('everprop:conversations:reconcile')->assertSuccessful();
        $this->assertSame(1, $calls);
        $this->assertDatabaseHas('messages', ['id' => $draft['message_id'], 'delivery_status' => 'UNKNOWN']);

        $this->assertSame('TRANSITION_PENDING', $control->takeover($tenant->id, $conversation, $advisor)['state']);
        $this->actingAs($advisor)->withHeaders($this->tenantHeaders($tenant))
            ->postJson("/api/v1/admin/conversations/$publicId/messages", ['text' => 'hola', 'idempotency_key' => Str::random(20)])
            ->assertStatus(409)->assertJsonPath('error.code', 'NOT_IN_CONTROL');

        $this->postJson("/api/v1/admin/conversations/$publicId/resolve-unknown")->assertOk()->assertJsonPath('data.resolved', 1);
        $this->assertDatabaseHas('conversations', ['id' => $conversation, 'control_state' => 'HUMAN_ACTIVE']);
        $this->assertDatabaseHas('outbound_jobs', ['id' => $draft['job_id'], 'status' => 'UNKNOWN_FINAL']);
        $this->assertDatabaseHas('audit_logs', ['tenant_id' => $tenant->id, 'action_code' => 'OUTBOUND_UNKNOWN_FINAL', 'entity_id' => $draft['job_id']]);
    }

    public function test_expired_dispatch_lease_becomes_unknown_not_resent(): void
    {
        [$tenant, $conversation] = $this->conversation();
        $draft = app(ConversationControl::class)->proposeBotReply($tenant->id, $conversation, 1, 'Hola', 'gen-1');
        DB::table('outbound_jobs')->where('id', $draft['job_id'])->update(['status' => 'PROCESSING', 'lease_expires_at' => now()->subMinute()]);

        $this->artisan('everprop:conversations:reconcile')->assertSuccessful();

        $this->assertDatabaseHas('outbound_jobs', ['id' => $draft['job_id'], 'status' => 'UNKNOWN', 'last_error_code' => 'LEASE_EXPIRED']);
        $this->assertDatabaseHas('messages', ['id' => $draft['message_id'], 'delivery_status' => 'UNKNOWN']);
    }

    public function test_human_reply_flow_is_idempotent_and_reaches_the_web_widget(): void
    {
        [$tenant, $conversation, $advisor, $publicId] = $this->conversation();
        $headers = $this->tenantHeaders($tenant);
        $this->actingAs($advisor)->withHeaders($headers)->postJson("/api/v1/admin/conversations/$publicId/takeover")
            ->assertOk()->assertJsonPath('data.confirmed', true);

        $body = ['text' => 'Hola, soy tu asesora', 'idempotency_key' => 'reply-0001-abcdefgh'];
        $this->postJson("/api/v1/admin/conversations/$publicId/messages", $body)->assertStatus(202);
        $this->postJson("/api/v1/admin/conversations/$publicId/messages", $body)->assertOk()->assertJsonPath('data.replayed', true);
        $this->postJson("/api/v1/admin/conversations/$publicId/messages", ['text' => 'otro', 'idempotency_key' => 'reply-0001-abcdefgh'])
            ->assertStatus(409)->assertJsonPath('error.code', 'IDEMPOTENCY_CONFLICT');

        $this->assertSame(1, DB::table('outbound_jobs')->where('tenant_id', $tenant->id)->where('conversation_id', $conversation)->count());
        $this->assertDatabaseHas('messages', ['conversation_id' => $conversation, 'sender_type' => 'USER', 'delivery_status' => 'SENT']);

        $this->postJson("/api/v1/admin/conversations/$publicId/resume", ['reason' => 'Consulta resuelta'])->assertOk()->assertJsonPath('data.state', 'AI_ACTIVE');
        $this->assertDatabaseHas('conversations', ['id' => $conversation, 'control_epoch' => 3, 'controlled_by_user_id' => null]);
    }

    public function test_advisor_cannot_close_or_resume_conversations_they_do_not_control(): void
    {
        [$tenant, $conversation, , $publicId] = $this->conversation();
        $advisor = $this->user($tenant, RoleCode::SALES_ADVISOR);
        $inventory = $this->user($tenant, RoleCode::ROTATOR);
        app(ConversationControl::class)->requestHuman($tenant->id, $conversation, 1, 'Pide asesor');
        $headers = $this->tenantHeaders($tenant);

        // Visible in the pool, but only taking control grants close/resume.
        $this->actingAs($advisor)->withHeaders($headers)->getJson("/api/v1/admin/conversations/$publicId/messages")->assertOk();
        $this->actingAs($advisor)->postJson("/api/v1/admin/conversations/$publicId/close")->assertForbidden();
        $this->actingAs($advisor)->postJson("/api/v1/admin/conversations/$publicId/resume", ['reason' => 'x'])->assertForbidden();
        $this->actingAs($inventory)->getJson('/api/v1/admin/conversations')->assertForbidden();

        $this->actingAs($advisor)->postJson("/api/v1/admin/conversations/$publicId/takeover")->assertOk();
        $this->actingAs($advisor)->postJson("/api/v1/admin/conversations/$publicId/close")->assertOk();
    }

    public function test_whatsapp_replies_go_to_the_thread_identity_not_the_latest_contact_number(): void
    {
        ['tenant' => $tenant, 'integration' => $integration] = $this->tenantWithIntegration();
        $channel = $this->whatsappChannel($tenant->id, $integration, 'PN-R');
        config(['services.meta.app_secret' => self::APP_SECRET]);
        $this->postWebhook($this->waPayload('PN-R', [$this->waText('wamid.r', 'hola', '5493881111111')]))->assertOk();
        $conversation = DB::table('conversations')->where('tenant_id', $tenant->id)->first();
        // Same contact later linked to a second number (e.g. manual merge).
        DB::table('contact_identities')->insert([
            'tenant_id' => $tenant->id, 'contact_id' => $conversation->contact_id, 'channel_type' => 'WHATSAPP', 'provider_scope_id' => '',
            'provider_user_id' => '5493889999999', 'first_seen_at' => now()->addDay(), 'last_seen_at' => now()->addDay(),
        ]);
        $recipient = null;
        $fake = new class(function (string $to) use (&$recipient): SendResult {
            $recipient = $to;

            return SendResult::accepted('wamid.sent');
        }) implements ChannelTransport
        {

            public function __construct(private readonly Closure $send) {}

            public function send(array $channel, string $recipientProviderId, string $text, string $dispatchNonce, ?array $media = null, ?array $template = null): SendResult
            {
                return ($this->send)($recipientProviderId);
            }
        };
        app(TransportRegistry::class)->use('WHATSAPP', $fake);
        $draft = app(ConversationControl::class)->proposeBotReply($tenant->id, (int) $conversation->id, 1, 'Hola', 'gen-r');

        $this->assertSame('SENT', app(OutboundDispatcher::class)->dispatch($tenant->id, $draft['job_id']));
        $this->assertSame('5493881111111', $recipient);
        $this->assertSame($channel, (int) DB::table('messages')->where('id', $draft['message_id'])->value('channel_account_id'));
    }

    public function test_inbox_visibility_and_write_permissions(): void
    {
        [$tenant, $conversation, $advisor, $publicId] = $this->conversation();
        $other = $this->user($tenant, RoleCode::SALES_ADVISOR);
        $readOnly = $this->user($tenant, RoleCode::READ_ONLY);
        [$otherTenant] = $this->conversation();
        $foreignAdmin = $this->user($otherTenant, RoleCode::TENANT_ADMIN);
        DB::table('conversations')->where('id', $conversation)->update(['assigned_user_id' => $advisor->id]);

        $this->actingAs($other)->withHeaders($this->tenantHeaders($tenant))->getJson("/api/v1/admin/conversations/$publicId/messages")->assertNotFound();
        $this->actingAs($other)->getJson('/api/v1/admin/conversations')->assertOk()->assertJsonMissing(['id' => $publicId]);
        $this->actingAs($readOnly)->getJson("/api/v1/admin/conversations/$publicId/messages")->assertOk();
        $this->actingAs($readOnly)->postJson("/api/v1/admin/conversations/$publicId/takeover")->assertForbidden();
        $this->actingAs($foreignAdmin)->withHeaders($this->tenantHeaders($otherTenant))
            ->postJson("/api/v1/admin/conversations/$publicId/takeover")->assertNotFound();
        $this->assertDatabaseHas('conversations', ['id' => $conversation, 'control_epoch' => 1]);
    }

    /** @return array{0: Tenant, 1: int, 2: User, 3: string} */
    private function conversation(): array
    {
        ['tenant' => $tenant, 'integration' => $integration] = $this->tenantWithIntegration('WEB');
        $channel = $this->webChannel($tenant->id, $integration);
        $session = $this->withHeaders($this->tenantHeaders($tenant))
            ->postJson('/api/v1/public/chat/sessions', ['widget_id' => $channel['public_id']])->assertCreated();
        $this->withToken($session->json('data.token'))
            ->postJson('/api/v1/public/chat/messages', ['client_message_id' => (string) Str::uuid(), 'text' => 'Hola'])->assertCreated();
        $this->flushHeaders();
        $row = DB::table('conversations')->where('tenant_id', $tenant->id)->first(['id', 'public_id']);

        return [$tenant, (int) $row->id, $this->user($tenant, RoleCode::SALES_MANAGER), (string) $row->public_id];
    }

    private function transport(Closure $send): void
    {
        $fake = new class($send) implements ChannelTransport
        {
            public function __construct(private readonly Closure $send) {}

            public function send(array $channel, string $recipientProviderId, string $text, string $dispatchNonce, ?array $media = null, ?array $template = null): SendResult
            {
                return ($this->send)();
            }
        };
        app(TransportRegistry::class)->use('WEB_CHAT', $fake);
    }
}
