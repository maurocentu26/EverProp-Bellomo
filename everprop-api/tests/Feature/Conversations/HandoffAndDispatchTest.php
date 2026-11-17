<?php

namespace Tests\Feature\Conversations;

use App\Domain\AgentRuntime\Jobs\RunAgentJob;
use App\Domain\Conversations\Contracts\ChannelTransport;
use App\Domain\Conversations\Data\InboundMessage;
use App\Domain\Conversations\Data\SendResult;
use App\Domain\Conversations\Exceptions\ConversationConflict;
use App\Domain\Conversations\Exceptions\DeliveryAmbiguous;
use App\Domain\Conversations\Notifications\ConversationNeedsAttention;
use App\Domain\Conversations\Services\ConversationControl;
use App\Domain\Conversations\Services\InboundMessageService;
use App\Domain\Conversations\Services\OutboundDispatcher;
use App\Domain\Conversations\Transports\TransportRegistry;
use App\Domain\Identity\Enums\RoleCode;
use App\Domain\Integrations\Notifications\IntegrationRevoked;
use App\Domain\Tenancy\Models\Tenant;
use App\Models\User;
use Carbon\CarbonImmutable;
use Closure;
use Illuminate\Contracts\Debug\ExceptionHandler;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Log\Events\MessageLogged;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Event;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Notification;
use Illuminate\Support\Facades\Queue;
use Illuminate\Support\Str;
use PHPUnit\Framework\Attributes\DataProvider;
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
        // EVP-127: the bot's reply may never arrive and is never resent, so a person is called in.
        $this->assertDatabaseHas('conversations', ['id' => $conversation, 'control_state' => 'WAITING_HUMAN', 'control_epoch' => 2]);

        $this->assertSame('TRANSITION_PENDING', $control->takeover($tenant->id, $conversation, $advisor)['state']);
        $this->actingAs($advisor)->withHeaders($this->tenantHeaders($tenant))
            ->postJson("/api/v1/admin/conversations/$publicId/messages", ['text' => 'hola', 'idempotency_key' => Str::random(20)])
            ->assertStatus(409)->assertJsonPath('error.code', 'NOT_IN_CONTROL');

        $this->postJson("/api/v1/admin/conversations/$publicId/resolve-unknown")->assertOk()->assertJsonPath('data.resolved', 1);
        $this->assertDatabaseHas('conversations', ['id' => $conversation, 'control_state' => 'HUMAN_ACTIVE']);
        $this->assertDatabaseHas('outbound_jobs', ['id' => $draft['job_id'], 'status' => 'UNKNOWN_FINAL']);
        $this->assertDatabaseHas('audit_logs', ['tenant_id' => $tenant->id, 'action_code' => 'OUTBOUND_UNKNOWN_FINAL', 'entity_id' => $draft['job_id']]);
    }

    public function test_conversation_conflict_is_not_reported_as_an_error(): void
    {
        $logged = [];
        Event::listen(MessageLogged::class, function (MessageLogged $event) use (&$logged): void {
            $logged[] = $event->level;
        });

        app(ExceptionHandler::class)->report(new ConversationConflict('NOT_IN_CONTROL', 'Tomá el control.'));

        $this->assertSame([], $logged);
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

        Queue::fake([RunAgentJob::class]);
        $this->postJson("/api/v1/admin/conversations/$publicId/resume", ['reason' => 'Consulta resuelta'])->assertOk()->assertJsonPath('data.state', 'AI_ACTIVE');
        $this->assertDatabaseHas('conversations', ['id' => $conversation, 'control_epoch' => 3, 'controlled_by_user_id' => null]);
        Queue::assertNothingPushed();

        // When the advisor delegates while the latest non-internal message is from the lead, the AI answers it immediately.
        $this->postJson("/api/v1/admin/conversations/$publicId/takeover")->assertOk();
        $convRow = DB::table('conversations')->where('id', $conversation)->first(['channel_account_id', 'provider_thread_id']);
        $inbound = app(InboundMessageService::class)->accept(new InboundMessage(
            tenantId: $tenant->id,
            channelAccountId: (int) $convRow->channel_account_id,
            identityChannelType: 'WEB_CHAT',
            senderProviderId: 'visitor-1',
            threadId: (string) $convRow->provider_thread_id,
            providerMessageId: 'msg-pending-lead',
            type: 'TEXT',
            text: '¿Tienen departamentos de 2 dormitorios?',
            occurredAt: CarbonImmutable::now('UTC'),
        ));
        $this->postJson("/api/v1/admin/conversations/$publicId/notes", ['text' => 'Nota interna antes de delegar', 'idempotency_key' => 'note-0001-abcdefgh'])->assertStatus(201);
        Queue::fake([RunAgentJob::class]);

        $this->postJson("/api/v1/admin/conversations/$publicId/resume", ['reason' => 'Que responda la IA'])->assertOk()->assertJsonPath('data.state', 'AI_ACTIVE');
        Queue::assertPushed(RunAgentJob::class, fn (RunAgentJob $job): bool => $job->conversationId === $conversation && $job->inputSequence === $inbound['sequence']);
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

    /** @return array<string, array{0: string}> */
    public static function undeliverableCodes(): array
    {
        return ['channel not configured' => ['CHANNEL_NOT_CONFIGURED'], 'token revoked' => ['META_TOKEN_REVOKED'], 'meta 400' => ['META_HTTP_400']];
    }

    /** EVP-127: two bot replies fail back to back (the second while the first is still in flight): one handoff, one alert. */
    #[DataProvider('undeliverableCodes')]
    public function test_undeliverable_bot_reply_hands_off_to_a_person_once(string $code): void
    {
        [$tenant, $conversation, $manager] = $this->conversation();
        $admin = $this->user($tenant, RoleCode::TENANT_ADMIN);
        Notification::fake();
        $control = app(ConversationControl::class);
        $dispatcher = app(OutboundDispatcher::class);
        $first = $control->proposeBotReply($tenant->id, $conversation, 1, 'Hola', 'gen-1');
        $second = $control->proposeBotReply($tenant->id, $conversation, 1, 'Te paso precios', 'gen-2');
        $calls = 0;
        $secondStatus = null;
        $this->transport(function () use (&$calls, &$secondStatus, $dispatcher, $tenant, $second, $code): SendResult {
            // Barrier: the second reply is claimed, sent and settled while the first is PROCESSING.
            if (++$calls === 1) {
                $secondStatus = $dispatcher->dispatch($tenant->id, $second['job_id']);
            }

            return SendResult::rejected($code, false);
        });

        $this->assertSame('FAILED', $dispatcher->dispatch($tenant->id, $first['job_id']));
        $this->assertSame('FAILED', $secondStatus);
        $this->assertSame(2, $calls);
        $this->assertDatabaseHas('conversations', ['id' => $conversation, 'control_state' => 'WAITING_HUMAN', 'control_epoch' => 2, 'bot_mode' => 'HUMAN_FIRST']);
        // What the inbox shows: both AI bubbles marked "No enviado".
        $this->assertSame(['FAILED'], DB::table('messages')->whereIn('id', [$first['message_id'], $second['message_id']])->distinct()->pluck('delivery_status')->all());
        $handoffs = DB::table('domain_outbox')->where('tenant_id', $tenant->id)->where('aggregate_id', $conversation)->where('event_type', 'CONVERSATION_HANDOFF_REQUESTED')->pluck('payload_json');
        $this->assertCount(1, $handoffs);
        $this->assertSame('DELIVERY_FAILED: '.$code, json_decode((string) $handoffs[0], true)['reason']);
        foreach ([$manager, $admin] as $user) {
            Notification::assertSentToTimes($user, ConversationNeedsAttention::class, 1);
        }
        Notification::assertSentTo($manager, ConversationNeedsAttention::class,
            fn (ConversationNeedsAttention $n): bool => str_contains($n->message, 'no le llegó al cliente') && ! str_contains($n->message, 'Hola'));
        // Credential alert from the dispatcher only when nothing else told the admins (META_TOKEN_REVOKED: IntegrationTokens::revoke did).
        if ($code === 'CHANNEL_NOT_CONFIGURED') {
            Notification::assertSentToTimes($admin, IntegrationRevoked::class, 1);
            Notification::assertSentTo($admin, IntegrationRevoked::class, fn (IntegrationRevoked $n): bool => $n->cannotSend);
        } else {
            Notification::assertNotSentTo($admin, IntegrationRevoked::class);
        }
        Notification::assertNotSentTo($manager, IntegrationRevoked::class);
    }

    public function test_channel_credential_alert_goes_once_per_integration_and_never_to_another_tenant(): void
    {
        [$tenant, $conversation, $manager] = $this->conversation();
        $admin = $this->user($tenant, RoleCode::TENANT_ADMIN);
        [$otherTenant] = $this->conversation();
        $foreignAdmin = $this->user($otherTenant, RoleCode::TENANT_ADMIN);
        $row = DB::table('conversations')->where('id', $conversation)->first(['channel_account_id']);
        $other = app(InboundMessageService::class)->accept(new InboundMessage(
            tenantId: $tenant->id, channelAccountId: (int) $row->channel_account_id, identityChannelType: 'WEB_CHAT',
            senderProviderId: 'visitor-2', threadId: 'web:visitor-2', providerMessageId: 'msg-visitor-2', type: 'TEXT',
            text: 'Hola', occurredAt: CarbonImmutable::now('UTC'),
        ));
        $otherConversation = (int) $other['conversation_id'];
        $otherEpoch = (int) DB::table('conversations')->where('id', $otherConversation)->value('control_epoch');
        Notification::fake();
        $this->transport(fn (): SendResult => SendResult::rejected('CHANNEL_NOT_CONFIGURED', false));
        $control = app(ConversationControl::class);

        foreach ([[$conversation, 1], [$otherConversation, $otherEpoch]] as [$id, $epoch]) {
            $draft = $control->proposeBotReply($tenant->id, $id, $epoch, 'Hola', 'gen-'.$id);
            $this->assertSame('FAILED', app(OutboundDispatcher::class)->dispatch($tenant->id, $draft['job_id']));
            $this->assertDatabaseHas('conversations', ['id' => $id, 'control_state' => 'WAITING_HUMAN']);
        }

        Notification::assertSentToTimes($admin, IntegrationRevoked::class, 1);
        Notification::assertSentToTimes($manager, ConversationNeedsAttention::class, 2);
        Notification::assertNotSentTo($foreignAdmin, IntegrationRevoked::class);
        Notification::assertNotSentTo($foreignAdmin, ConversationNeedsAttention::class);
        $this->assertDatabaseHas('conversations', ['tenant_id' => $otherTenant->id, 'control_state' => 'AI_ACTIVE', 'control_epoch' => 1]);
    }

    public function test_whatsapp_revoked_token_on_a_bot_reply_hands_off_and_tells_integration_admins_once(): void
    {
        ['tenant' => $tenant, 'integration' => $integration] = $this->tenantWithIntegration();
        $this->whatsappChannel($tenant->id, $integration, 'PN-127');
        $admin = $this->user($tenant, RoleCode::TENANT_ADMIN);
        config(['services.meta.app_secret' => self::APP_SECRET]);
        $this->postWebhook($this->waPayload('PN-127', [$this->waText('wamid.127', 'hola', '5493881111127')]))->assertOk();
        $conversation = DB::table('conversations')->where('tenant_id', $tenant->id)->first(['id', 'control_epoch']);
        config(['services.meta.send_enabled' => true, 'services.meta.send_fake' => false,
            'services.webhooks.secrets' => ['wa-token-'.$tenant->id => 'page-token']]);
        Http::fake(['graph.facebook.com/*' => Http::response(['error' => ['code' => 190]], 401)]);
        Notification::fake();
        $draft = app(ConversationControl::class)->proposeBotReply($tenant->id, (int) $conversation->id, (int) $conversation->control_epoch, 'Hola', 'gen-wa');

        $this->assertSame('FAILED', app(OutboundDispatcher::class)->dispatch($tenant->id, $draft['job_id']));

        $this->assertDatabaseHas('messages', ['id' => $draft['message_id'], 'delivery_status' => 'FAILED', 'provider_error_code' => 'META_TOKEN_REVOKED']);
        $this->assertDatabaseHas('conversations', ['id' => $conversation->id, 'control_state' => 'WAITING_HUMAN']);
        $this->assertDatabaseHas('integration_connections', ['id' => $integration, 'status' => 'REVOKED']);
        Notification::assertSentToTimes($admin, IntegrationRevoked::class, 1);
        Notification::assertSentToTimes($admin, ConversationNeedsAttention::class, 1);
    }

    public function test_failed_advisor_reply_does_not_change_control(): void
    {
        [$tenant, $conversation, $manager] = $this->conversation();
        $control = app(ConversationControl::class);
        $control->takeover($tenant->id, $conversation, $manager);
        $reply = $control->humanReply($tenant->id, $conversation, $manager, 'hola', 'key-failed-human-001');
        Notification::fake();
        $this->transport(fn (): SendResult => SendResult::rejected('CHANNEL_NOT_CONFIGURED', false));

        $this->assertSame('FAILED', app(OutboundDispatcher::class)->dispatch($tenant->id, $reply['job_id']));

        $this->assertDatabaseHas('conversations', ['id' => $conversation, 'control_state' => 'HUMAN_ACTIVE', 'control_epoch' => 2, 'controlled_by_user_id' => $manager->id]);
        Notification::assertNothingSent();
    }

    /** The race: the advisor takes control while the failing bot send is in flight. The failure must not hand it back to the queue. */
    public function test_takeover_during_a_failing_bot_send_keeps_the_advisor_in_control(): void
    {
        [$tenant, $conversation, $manager] = $this->conversation();
        $control = app(ConversationControl::class);
        $draft = $control->proposeBotReply($tenant->id, $conversation, 1, 'Hola', 'gen-1');
        Notification::fake();
        $this->transport(function () use ($control, $tenant, $conversation, $manager): SendResult {
            $control->takeover($tenant->id, $conversation, $manager);

            return SendResult::rejected('META_HTTP_400', false);
        });

        $this->assertSame('FAILED', app(OutboundDispatcher::class)->dispatch($tenant->id, $draft['job_id']));

        $this->assertDatabaseHas('conversations', ['id' => $conversation, 'control_state' => 'HUMAN_ACTIVE', 'control_epoch' => 2, 'controlled_by_user_id' => $manager->id]);
        $this->assertDatabaseMissing('domain_outbox', ['aggregate_id' => $conversation, 'event_type' => 'CONVERSATION_HANDOFF_REQUESTED']);
        Notification::assertNothingSent();
    }

    public function test_bot_reply_blocked_by_the_channel_at_claim_time_hands_off(): void
    {
        [$tenant, $conversation] = $this->conversation();
        $draft = app(ConversationControl::class)->proposeBotReply($tenant->id, $conversation, 1, 'Hola', 'gen-1');
        DB::table('channel_accounts')->where('id', DB::table('conversations')->where('id', $conversation)->value('channel_account_id'))->update(['status' => 'PAUSED']);

        $this->assertSame('FAILED', app(OutboundDispatcher::class)->dispatch($tenant->id, $draft['job_id']));

        $this->assertDatabaseHas('conversations', ['id' => $conversation, 'control_state' => 'WAITING_HUMAN', 'control_epoch' => 2]);
    }

    /** An ambiguous send may still have arrived: the alert says it is unconfirmed, never that it did not arrive. */
    public function test_ambiguous_bot_send_hands_off_saying_it_is_unconfirmed(): void
    {
        [$tenant, $conversation, $manager] = $this->conversation();
        $draft = app(ConversationControl::class)->proposeBotReply($tenant->id, $conversation, 1, 'Hola', 'gen-1');
        Notification::fake();
        $this->transport(fn (): SendResult => throw new DeliveryAmbiguous('timeout after write'));

        $this->assertSame('UNKNOWN', app(OutboundDispatcher::class)->dispatch($tenant->id, $draft['job_id']));

        $this->assertDatabaseHas('conversations', ['id' => $conversation, 'control_state' => 'WAITING_HUMAN', 'control_epoch' => 2]);
        $this->assertSame('DELIVERY_UNKNOWN: DELIVERY_UNKNOWN', json_decode((string) DB::table('domain_outbox')->where('aggregate_id', $conversation)
            ->where('event_type', 'CONVERSATION_HANDOFF_REQUESTED')->value('payload_json'), true)['reason']);
        Notification::assertSentToTimes($manager, ConversationNeedsAttention::class, 1);
        Notification::assertSentTo($manager, ConversationNeedsAttention::class,
            fn (ConversationNeedsAttention $n): bool => str_contains($n->message, 'No pudimos confirmar') && ! str_contains($n->message, 'no le llegó'));
    }

    /** Review finding 2: an error while recording a known rejection must not turn it into UNKNOWN/DELIVERY_UNKNOWN. */
    public function test_error_while_handing_off_does_not_rewrite_a_known_rejection_as_unknown(): void
    {
        [$tenant, $conversation] = $this->conversation();
        $draft = app(ConversationControl::class)->proposeBotReply($tenant->id, $conversation, 1, 'Hola', 'gen-1');
        $this->transport(fn (): SendResult => SendResult::rejected('META_HTTP_400', false));
        $failOnce = true;
        // Injected fault: the handoff's outbox write fails on the first attempt.
        DB::connection()->beforeExecuting(function (string $query) use (&$failOnce): void {
            if ($failOnce && str_starts_with($query, 'insert into `domain_outbox`')) {
                $failOnce = false;
                throw new \RuntimeException('forced handoff failure');
            }
        });

        try {
            app(OutboundDispatcher::class)->dispatch($tenant->id, $draft['job_id']);
            $this->fail('the settle error must surface, not be swallowed as an ambiguous send');
        } catch (\RuntimeException $e) {
            $this->assertSame('forced handoff failure', $e->getMessage());
        }

        $this->assertFalse($failOnce);
        $this->assertDatabaseMissing('outbound_jobs', ['id' => $draft['job_id'], 'last_error_code' => 'DELIVERY_UNKNOWN']);
        // Nothing half-written: the job keeps its lease, and the lease sweep recovers it.
        $this->assertDatabaseHas('outbound_jobs', ['id' => $draft['job_id'], 'status' => 'PROCESSING']);
        $this->assertDatabaseHas('conversations', ['id' => $conversation, 'control_state' => 'AI_ACTIVE', 'control_epoch' => 1]);
    }

    /** Review finding 1: a worker that died mid-send leaves UNKNOWN/LEASE_EXPIRED; the sweep hands off, once. */
    public function test_lease_expired_bot_send_is_handed_off_once_by_the_reconciler(): void
    {
        [$tenant, $conversation, $manager] = $this->conversation();
        $draft = app(ConversationControl::class)->proposeBotReply($tenant->id, $conversation, 1, 'Hola', 'gen-1');
        DB::table('outbound_jobs')->where('id', $draft['job_id'])->update(['status' => 'PROCESSING', 'lease_expires_at' => now()->subMinute()]);
        Notification::fake();

        $this->artisan('everprop:conversations:reconcile')->assertSuccessful();
        $this->artisan('everprop:conversations:reconcile')->assertSuccessful();

        $this->assertDatabaseHas('outbound_jobs', ['id' => $draft['job_id'], 'status' => 'UNKNOWN', 'last_error_code' => 'LEASE_EXPIRED']);
        $this->assertDatabaseHas('conversations', ['id' => $conversation, 'control_state' => 'WAITING_HUMAN', 'control_epoch' => 2]);
        $handoffs = DB::table('domain_outbox')->where('aggregate_id', $conversation)->where('event_type', 'CONVERSATION_HANDOFF_REQUESTED')->pluck('payload_json');
        $this->assertCount(1, $handoffs);
        $this->assertSame('DELIVERY_UNKNOWN: LEASE_EXPIRED', json_decode((string) $handoffs[0], true)['reason']);
        Notification::assertSentToTimes($manager, ConversationNeedsAttention::class, 1);
    }

    /** Review finding 5: the daily credential alert is per integration, so each tenant gets its own. */
    public function test_two_tenants_failing_the_same_day_each_get_their_own_credential_alert(): void
    {
        $admins = [];
        $runs = [];
        foreach ([1, 2] as $i) {
            [$tenant, $conversation] = $this->conversation();
            $admins[$i] = $this->user($tenant, RoleCode::TENANT_ADMIN);
            $runs[$i] = [$tenant, $conversation];
        }
        Notification::fake();
        $this->transport(fn (): SendResult => SendResult::rejected('CHANNEL_NOT_CONFIGURED', false));

        foreach ($runs as [$tenant, $conversation]) {
            $draft = app(ConversationControl::class)->proposeBotReply($tenant->id, $conversation, 1, 'Hola', 'gen-1');
            $this->assertSame('FAILED', app(OutboundDispatcher::class)->dispatch($tenant->id, $draft['job_id']));
        }

        foreach ($admins as $admin) {
            Notification::assertSentToTimes($admin, IntegrationRevoked::class, 1);
        }
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
