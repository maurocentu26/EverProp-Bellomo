<?php

namespace Tests\Feature\Conversations;

use App\Domain\AgentRuntime\Coordinator\AgentCoordinator;
use App\Domain\AgentRuntime\Jobs\RunAgentJob;
use App\Domain\Conversations\Data\InboundMessage;
use App\Domain\Conversations\Notifications\ConversationNeedsAttention;
use App\Domain\Conversations\Services\ConversationControl;
use App\Domain\Conversations\Services\InboundMessageService;
use App\Domain\Identity\Enums\RoleCode;
use App\Domain\Tenancy\Models\Tenant;
use App\Jobs\SendWebPush;
use App\Models\User;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Notification;
use Illuminate\Support\Facades\Queue;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\Str;
use Tests\TestCase;

/** Advisors learn that a client is waiting (push via database notifications), without client data on the lock screen. */
final class ConversationAlertsTest extends TestCase
{
    use ConversationTestSupport, DatabaseTransactions;

    protected function setUp(): void
    {
        parent::setUp();
        config(['conversations.web_rate_limit_per_minute' => 10_000, 'conversations.ai_enabled' => false]);
        Queue::fake([RunAgentJob::class]);
        Notification::fake();
    }

    public function test_inbound_messages_do_not_alert_before_concrete_handoff(): void
    {
        config(['conversations.ai_enabled' => true]);
        [$tenant, $token] = $this->widget();
        $advisor = $this->user($tenant, RoleCode::SALES_ADVISOR);
        $manager = $this->user($tenant, RoleCode::SALES_MANAGER);
        $readOnly = $this->user($tenant, RoleCode::READ_ONLY);
        $disabled = User::factory()->for($tenant)->disabled()->create(['role_code' => RoleCode::SALES_ADVISOR->value]);
        [$otherTenant] = $this->widget();
        $foreign = $this->user($otherTenant, RoleCode::SALES_ADVISOR);

        $this->send($tenant, $token, 'Hola');
        $this->send($tenant, $token, '¿Siguen ahí?');

        $row = DB::table('conversations')->where('tenant_id', $tenant->id)->first(['id', 'public_id', 'control_epoch', 'control_state', 'unread_count']);
        $this->assertSame('AI_ACTIVE', $row->control_state);
        $this->assertSame(0, (int) $row->unread_count);
        Notification::assertNothingSent();

        app(ConversationControl::class)->requestHuman($tenant->id, (int) $row->id, (int) $row->control_epoch, 'ADVISOR_REQUESTED: Quiere hablar con un asesor');

        $this->assertDatabaseHas('conversations', ['id' => $row->id, 'control_state' => 'WAITING_HUMAN', 'unread_count' => 1]);
        foreach ([$advisor, $manager] as $user) {
            Notification::assertSentToTimes($user, ConversationNeedsAttention::class, 1);
        }
        Notification::assertSentTo($advisor, ConversationNeedsAttention::class, fn ($n) => $n->conversationPublicId === (string) $row->public_id);
        foreach ([$readOnly, $disabled, $foreign] as $user) {
            Notification::assertNotSentTo($user, ConversationNeedsAttention::class);
        }
    }

    public function test_active_human_conversation_increments_unread_without_notifying_on_every_message(): void
    {
        [$tenant, $token] = $this->widget();
        $advisor = $this->user($tenant, RoleCode::SALES_ADVISOR);
        $other = $this->user($tenant, RoleCode::SALES_ADVISOR);
        $this->send($tenant, $token, 'Hola');
        $publicId = (string) DB::table('conversations')->where('tenant_id', $tenant->id)->value('public_id');

        $this->actingAs($advisor)->withHeaders($this->tenantHeaders($tenant))->postJson("/api/v1/admin/conversations/$publicId/takeover")->assertOk();
        $this->actingAs($advisor)->getJson("/api/v1/admin/conversations/$publicId/messages")->assertOk();
        $this->assertDatabaseHas('conversations', ['public_id' => $publicId, 'unread_count' => 0, 'control_state' => 'HUMAN_ACTIVE']);
        Notification::fake();

        $this->send($tenant, $token, 'Una pregunta más');

        $this->assertDatabaseHas('conversations', ['public_id' => $publicId, 'unread_count' => 1, 'control_state' => 'HUMAN_ACTIVE']);
        Notification::assertNotSentTo($advisor, ConversationNeedsAttention::class);
        Notification::assertNotSentTo($other, ConversationNeedsAttention::class);
    }

    public function test_handoff_request_alerts_the_suggested_assignee_with_contact_context(): void
    {
        config(['conversations.ai_enabled' => true]);
        [$tenant, $token] = $this->widget();
        $owner = $this->user($tenant, RoleCode::SALES_ADVISOR);
        $bystander = $this->user($tenant, RoleCode::SALES_ADVISOR);
        $this->send($tenant, $token, 'Quiero hablar con alguien');
        $row = DB::table('conversations')->where('tenant_id', $tenant->id)->first(['id', 'contact_id', 'control_epoch', 'control_state']);
        $this->assertSame('AI_ACTIVE', $row->control_state);
        Notification::assertNothingSent();

        DB::table('contacts')->where('tenant_id', $tenant->id)->where('id', $row->contact_id)->update([
            'display_name' => 'Lucía Gómez',
            'phone_e164' => '+5493885550199',
        ]);

        app(ConversationControl::class)->requestHuman(
            $tenant->id,
            (int) $row->id,
            (int) $row->control_epoch,
            'ADVISOR_REQUESTED: Quiere tasar su casa https://evil.example',
            suggestedAssigneeId: $owner->id,
        );

        Notification::assertSentToTimes($owner, ConversationNeedsAttention::class, 1);
        Notification::assertSentTo($owner, ConversationNeedsAttention::class, function (ConversationNeedsAttention $notification) use ($owner): bool {
            $payload = $notification->toArray($owner);

            return $payload['title'] === 'Derivación de Lucía Gómez (Chat web)'
                && $payload['message'] === 'Lucía Gómez pidió hablar con un asesor en Chat web.'
                && ! str_contains(json_encode($payload, JSON_THROW_ON_ERROR), 'evil.example');
        });
        Notification::assertNotSentTo($bystander, ConversationNeedsAttention::class);
    }

    public function test_reopened_conversation_of_a_disabled_assignee_alerts_managers_not_advisors_who_cannot_see_it(): void
    {
        [$tenant, $token] = $this->widget();
        $gone = $this->user($tenant, RoleCode::SALES_ADVISOR);
        $advisor = $this->user($tenant, RoleCode::SALES_ADVISOR);
        $manager = $this->user($tenant, RoleCode::SALES_MANAGER);
        $this->send($tenant, $token, 'Hola');
        $conversationId = (int) DB::table('conversations')->where('tenant_id', $tenant->id)->value('id');
        DB::table('conversations')->where('id', $conversationId)->update(['assigned_user_id' => $gone->id, 'unread_count' => 0]);
        app(ConversationControl::class)->close($tenant->id, $conversationId, $manager);
        $gone->update(['status' => 'DISABLED']);
        Notification::fake();

        $this->send($tenant, $token, '¿Hay alguien?');

        Notification::assertSentToTimes($manager, ConversationNeedsAttention::class, 1);
        Notification::assertNotSentTo($advisor, ConversationNeedsAttention::class);
        Notification::assertNotSentTo($gone, ConversationNeedsAttention::class);
    }

    public function test_handoff_ignores_a_suggested_assignee_from_another_tenant_or_inactive(): void
    {
        config(['conversations.ai_enabled' => true]);
        [$tenant, $token] = $this->widget();
        $advisor = $this->user($tenant, RoleCode::SALES_ADVISOR);
        $readOnly = $this->user($tenant, RoleCode::READ_ONLY);
        [$otherTenant] = $this->widget();
        $foreign = $this->user($otherTenant, RoleCode::SALES_ADVISOR);
        $this->send($tenant, $token, 'Quiero hablar con alguien');
        $row = DB::table('conversations')->where('tenant_id', $tenant->id)->first(['id', 'contact_id', 'control_epoch']);
        DB::table('contacts')->where('tenant_id', $tenant->id)->where('id', $row->contact_id)->update(['display_name' => 'Cliente Privado']);
        $stageId = (int) DB::table('pipeline_stages')->insertGetId([
            'tenant_id' => $tenant->id, 'code' => 'NEW', 'name' => 'New', 'category' => 'OPEN', 'position' => 1, 'is_active' => true,
        ]);
        DB::table('leads')->insert([
            'tenant_id' => $tenant->id, 'public_id' => (string) Str::uuid(), 'contact_id' => $row->contact_id,
            'stage_id' => $stageId, 'assigned_user_id' => $readOnly->id, 'assignment_method' => 'MANUAL',
            'source_channel' => 'WEB_CHAT', 'source_kind' => 'CHATBOT', 'title' => 'Lead',
            'is_open' => 1, 'priority' => 'NORMAL', 'first_touch_at' => now(), 'last_touch_at' => now(),
        ]);

        app(ConversationControl::class)->requestHuman($tenant->id, (int) $row->id, (int) $row->control_epoch, 'pidió humano', suggestedAssigneeId: null);

        $this->assertDatabaseHas('conversations', ['tenant_id' => $tenant->id, 'id' => $row->id, 'assigned_user_id' => null, 'control_state' => 'WAITING_HUMAN']);
        Notification::assertSentTo($advisor, ConversationNeedsAttention::class, function (ConversationNeedsAttention $notification) use ($advisor): bool {
            $payload = $notification->toArray($advisor);

            return $payload['title'] === 'Cliente derivado en Chat web'
                && ! str_contains(json_encode($payload, JSON_THROW_ON_ERROR), 'Cliente Privado');
        });
        Notification::assertNotSentTo($foreign, ConversationNeedsAttention::class);
        Notification::assertNotSentTo($readOnly, ConversationNeedsAttention::class);
    }

    public function test_assistant_off_first_social_message_alerts_once_per_episode(): void
    {
        // The web-chat cap (0 here) never applies to social channels.
        config(['services.meta.app_secret' => self::APP_SECRET, 'services.meta.send_enabled' => false, 'conversations.web_new_conversation_alerts_per_10_minutes' => 0]);
        ['tenant' => $tenant, 'integration' => $integration] = $this->tenantWithIntegration();
        $advisor = $this->user($tenant, RoleCode::SALES_ADVISOR);
        $manager = $this->user($tenant, RoleCode::SALES_MANAGER);
        $admin = $this->user($tenant, RoleCode::TENANT_ADMIN);
        $readOnly = $this->user($tenant, RoleCode::READ_ONLY);
        ['tenant' => $otherTenant] = $this->tenantWithIntegration();
        $foreign = $this->user($otherTenant, RoleCode::SALES_ADVISOR);
        $this->whatsappChannel($tenant->id, $integration, 'PN-126');
        foreach (['INSTAGRAM_DM' => 'IG-126', 'FACEBOOK_MESSENGER' => 'FB-126'] as $type => $account) {
            DB::table('channel_accounts')->insert(['tenant_id' => $tenant->id, 'integration_id' => $integration, 'public_id' => (string) Str::uuid(),
                'channel_type' => $type, 'provider_account_id' => $account, 'display_name' => $type, 'status' => 'ACTIVE']);
        }
        $deliveries = [
            'WhatsApp' => fn (int $i) => $this->waPayload('PN-126', [$this->waText("wamid.126.$i", "Hola $i")]),
            'Instagram' => fn (int $i) => $this->socialPayload('instagram', 'IG-126', "mid.ig.$i", "Hola $i"),
            'Messenger' => fn (int $i) => $this->socialPayload('page', 'FB-126', "mid.fb.$i", "Hola $i"),
        ];

        foreach ($deliveries as $raw) {
            $this->postWebhook($raw(1))->assertOk();
            $this->postWebhook($raw(1))->assertOk(); // provider redelivery: same message, no second alert
        }

        $rows = DB::table('conversations as c')->join('channel_accounts as ca', 'ca.id', '=', 'c.channel_account_id')
            ->where('c.tenant_id', $tenant->id)->pluck('c.public_id', 'ca.channel_type');
        $this->assertCount(3, $rows);
        $this->assertSame(['WAITING_HUMAN'], DB::table('conversations')->where('tenant_id', $tenant->id)->distinct()->pluck('control_state')->all());
        foreach ([$advisor, $manager, $admin] as $user) {
            Notification::assertSentToTimes($user, ConversationNeedsAttention::class, 3);
        }
        foreach (['WHATSAPP' => 'WhatsApp', 'INSTAGRAM_DM' => 'Instagram', 'FACEBOOK_MESSENGER' => 'Messenger'] as $type => $label) {
            Notification::assertSentTo($advisor, ConversationNeedsAttention::class, function (ConversationNeedsAttention $n) use ($advisor, $rows, $type, $label): bool {
                $payload = $n->toArray($advisor);

                return $n->conversationPublicId === $rows[$type]
                    && $payload['title'] === "Nueva conversación en $label"
                    && $payload['message'] === "Entró un mensaje nuevo por $label y nadie lo respondió todavía."
                    && $payload['action_url'] === '/admin/conversaciones?c='.$rows[$type];
            });
        }
        foreach ([$readOnly, $foreign] as $user) {
            Notification::assertNotSentTo($user, ConversationNeedsAttention::class);
        }

        // Second and third message of the same unanswered episode: no new alert.
        foreach ($deliveries as $raw) {
            $this->postWebhook($raw(2))->assertOk();
            $this->postWebhook($raw(3))->assertOk();
        }
        Notification::assertSentToTimes($advisor, ConversationNeedsAttention::class, 3);
        $this->assertSame(9, DB::table('messages')->where('tenant_id', $tenant->id)->count());
    }

    public function test_assistant_off_new_episode_alerts_only_the_owner_without_client_data(): void
    {
        config(['services.meta.app_secret' => self::APP_SECRET, 'services.meta.send_enabled' => false]);
        ['tenant' => $tenant, 'integration' => $integration] = $this->tenantWithIntegration();
        $owner = $this->user($tenant, RoleCode::SALES_ADVISOR);
        $bystander = $this->user($tenant, RoleCode::SALES_ADVISOR);
        $this->whatsappChannel($tenant->id, $integration, 'PN-OWNER');
        $this->postWebhook($this->waPayload('PN-OWNER', [$this->waText('wamid.owner.1', 'Hola')]))->assertOk();
        // The owner read the chat (unread back to 0) without answering; the client writes again.
        DB::table('conversations')->where('tenant_id', $tenant->id)->update(['assigned_user_id' => $owner->id, 'unread_count' => 0]);
        Notification::fake();

        $this->postWebhook($this->waPayload('PN-OWNER', [$this->waText('wamid.owner.2', 'Mi DNI es 30111222')]))->assertOk();

        Notification::assertSentToTimes($owner, ConversationNeedsAttention::class, 1);
        Notification::assertSentTo($owner, ConversationNeedsAttention::class, function (ConversationNeedsAttention $n) use ($owner): bool {
            $json = json_encode($n->toArray($owner), JSON_THROW_ON_ERROR | JSON_UNESCAPED_UNICODE);

            return ! str_contains($json, 'Cliente Sintético') && ! str_contains($json, '5493881111111') && ! str_contains($json, '30111222');
        });
        Notification::assertNotSentTo($bystander, ConversationNeedsAttention::class);
    }

    public function test_assistant_off_reopened_social_conversation_alerts_once(): void
    {
        config(['services.meta.app_secret' => self::APP_SECRET, 'services.meta.send_enabled' => false]);
        ['tenant' => $tenant, 'integration' => $integration] = $this->tenantWithIntegration();
        $manager = $this->user($tenant, RoleCode::SALES_MANAGER);
        $this->whatsappChannel($tenant->id, $integration, 'PN-REOPEN');
        $this->postWebhook($this->waPayload('PN-REOPEN', [$this->waText('wamid.reopen.1', 'Hola')]))->assertOk();
        app(ConversationControl::class)->close($tenant->id, (int) DB::table('conversations')->where('tenant_id', $tenant->id)->value('id'), $manager);
        Notification::fake();

        $this->postWebhook($this->waPayload('PN-REOPEN', [$this->waText('wamid.reopen.2', 'Volví')]))->assertOk();

        Notification::assertSentToTimes($manager, ConversationNeedsAttention::class, 1);
        Notification::assertSentTo($manager, ConversationNeedsAttention::class, fn (ConversationNeedsAttention $n) => $n->toArray($manager)['title'] !== 'Nueva conversación en WhatsApp');
    }

    public function test_assistant_on_first_social_message_does_not_alert(): void
    {
        config(['conversations.ai_enabled' => true, 'services.meta.app_secret' => self::APP_SECRET, 'services.meta.send_enabled' => false]);
        ['tenant' => $tenant, 'integration' => $integration] = $this->tenantWithIntegration();
        $advisor = $this->user($tenant, RoleCode::SALES_ADVISOR);
        $this->whatsappChannel($tenant->id, $integration, 'PN-AI');

        $this->postWebhook($this->waPayload('PN-AI', [$this->waText('wamid.ai.1', 'Hola')]))->assertOk();

        $this->assertDatabaseHas('conversations', ['tenant_id' => $tenant->id, 'control_state' => 'AI_ACTIVE']);
        Notification::assertNotSentTo($advisor, ConversationNeedsAttention::class);
    }

    public function test_assistant_off_web_chat_alerts_once_like_social_channels(): void
    {
        [$tenant, $token] = $this->widget();
        $manager = $this->user($tenant, RoleCode::SALES_MANAGER);

        $this->send($tenant, $token, 'Hola');
        $this->send($tenant, $token, '¿Hay alguien?');

        Notification::assertSentToTimes($manager, ConversationNeedsAttention::class, 1);
        Notification::assertSentTo($manager, ConversationNeedsAttention::class, fn (ConversationNeedsAttention $n) => $n->toArray($manager)['title'] === 'Nueva conversación en Chat web');
    }

    public function test_web_chat_new_conversation_alerts_are_capped_per_tenant(): void
    {
        config(['conversations.web_new_conversation_alerts_per_10_minutes' => 2]);
        ['tenant' => $tenant, 'integration' => $integration] = $this->tenantWithIntegration('WEB');
        $channel = $this->webChannel($tenant->id, $integration);
        $manager = $this->user($tenant, RoleCode::SALES_MANAGER);
        RateLimiter::clear('new-conv-alert:'.$tenant->id);

        foreach (range(1, 3) as $i) {
            $token = (string) $this->withHeaders($this->tenantHeaders($tenant))
                ->postJson('/api/v1/public/chat/sessions', ['widget_id' => $channel['public_id']])->assertCreated()->json('data.token');
            $this->flushHeaders();
            $this->send($tenant, $token, "Hola $i");
        }

        Notification::assertSentToTimes($manager, ConversationNeedsAttention::class, 2);
        // Past the cap the conversation is still stored and waiting for a person.
        $this->assertSame(3, DB::table('conversations')->where('tenant_id', $tenant->id)->where('control_state', 'WAITING_HUMAN')->count());
    }

    public function test_assistant_switched_off_between_reads_still_ends_in_exactly_one_alert(): void
    {
        config(['conversations.ai_enabled' => true]);
        ['tenant' => $tenant, 'integration' => $integration] = $this->tenantWithIntegration();
        $manager = $this->user($tenant, RoleCode::SALES_MANAGER);
        $channelId = $this->whatsappChannel($tenant->id, $integration, 'PN-FLIP');
        // Barrier: the admin switches the assistant off right after the first read of the tenant switch.
        $flipped = false;
        DB::listen(function ($query) use (&$flipped, $tenant): void {
            if (! $flipped && str_contains($query->sql, 'settings_json') && str_starts_with(strtolower($query->sql), 'select')) {
                $flipped = true;
                DB::table('tenants')->where('id', $tenant->id)->update(['settings_json' => json_encode(['conversations' => ['ai_enabled' => false]])]);
            }
        });

        $result = app(InboundMessageService::class)->accept(new InboundMessage($tenant->id, $channelId, 'WHATSAPP', '5493881111111', '5493881111111',
            'wamid.flip.1', 'TEXT', 'Hola', CarbonImmutable::now()));
        $this->assertTrue($flipped);
        // The coordinator runs the queued turn, sees the assistant off and hands the chat to a person.
        Queue::assertPushed(RunAgentJob::class);
        app(AgentCoordinator::class)->handle($tenant->id, $result['conversation_id'], $result['sequence']);

        $this->assertDatabaseHas('conversations', ['id' => $result['conversation_id'], 'control_state' => 'WAITING_HUMAN']);
        Notification::assertSentToTimes($manager, ConversationNeedsAttention::class, 1);
    }

    public function test_bot_conversation_with_assistant_switched_off_alerts_once_as_handoff(): void
    {
        config(['conversations.ai_enabled' => true, 'services.meta.app_secret' => self::APP_SECRET, 'services.meta.send_enabled' => false]);
        ['tenant' => $tenant, 'integration' => $integration] = $this->tenantWithIntegration();
        $advisor = $this->user($tenant, RoleCode::SALES_ADVISOR);
        $this->whatsappChannel($tenant->id, $integration, 'PN-BOT');
        $this->postWebhook($this->waPayload('PN-BOT', [$this->waText('wamid.bot.1', 'Hola')]))->assertOk();
        $this->assertDatabaseHas('conversations', ['tenant_id' => $tenant->id, 'control_state' => 'AI_ACTIVE']);
        config(['conversations.ai_enabled' => false]);
        Notification::fake();

        $this->postWebhook($this->waPayload('PN-BOT', [$this->waText('wamid.bot.2', '¿Hola?')]))->assertOk();
        $this->postWebhook($this->waPayload('PN-BOT', [$this->waText('wamid.bot.3', '¿Hay alguien?')]))->assertOk();

        $this->assertDatabaseHas('conversations', ['tenant_id' => $tenant->id, 'control_state' => 'WAITING_HUMAN']);
        $this->assertDatabaseHas('domain_outbox', ['tenant_id' => $tenant->id, 'event_type' => 'CONVERSATION_HANDOFF_REQUESTED']);
        Notification::assertSentToTimes($advisor, ConversationNeedsAttention::class, 1);
        Notification::assertSentTo($advisor, ConversationNeedsAttention::class, fn (ConversationNeedsAttention $n) => $n->toArray($advisor)['title'] === 'Cliente derivado en WhatsApp');
    }

    public function test_new_episode_of_an_inactive_owner_alerts_only_managers_and_admins(): void
    {
        config(['services.meta.app_secret' => self::APP_SECRET, 'services.meta.send_enabled' => false]);
        ['tenant' => $tenant, 'integration' => $integration] = $this->tenantWithIntegration();
        $gone = $this->user($tenant, RoleCode::SALES_ADVISOR);
        $advisor = $this->user($tenant, RoleCode::SALES_ADVISOR);
        $manager = $this->user($tenant, RoleCode::SALES_MANAGER);
        $admin = $this->user($tenant, RoleCode::TENANT_ADMIN);
        $this->whatsappChannel($tenant->id, $integration, 'PN-GONE');
        $this->postWebhook($this->waPayload('PN-GONE', [$this->waText('wamid.gone.1', 'Hola')]))->assertOk();
        DB::table('conversations')->where('tenant_id', $tenant->id)->update(['assigned_user_id' => $gone->id, 'unread_count' => 0]);
        $gone->update(['status' => 'DISABLED']);
        Notification::fake();

        $this->postWebhook($this->waPayload('PN-GONE', [$this->waText('wamid.gone.2', 'Sigo esperando')]))->assertOk();

        foreach ([$manager, $admin] as $user) {
            Notification::assertSentTo($user, ConversationNeedsAttention::class, fn (ConversationNeedsAttention $n) => $n->toArray($user)['title'] === 'Nueva conversación en WhatsApp');
            Notification::assertSentToTimes($user, ConversationNeedsAttention::class, 1);
        }
        Notification::assertNotSentTo($advisor, ConversationNeedsAttention::class);
        Notification::assertNotSentTo($gone, ConversationNeedsAttention::class);
    }

    private function socialPayload(string $object, string $accountId, string $mid, string $text): string
    {
        return json_encode(['object' => $object, 'entry' => [['id' => $accountId, 'time' => now()->getTimestampMs(), 'messaging' => [[
            'sender' => ['id' => 'VISITOR-'.$accountId], 'recipient' => ['id' => $accountId], 'timestamp' => now()->getTimestampMs(),
            'message' => ['mid' => $mid, 'text' => $text],
        ]]]]], JSON_THROW_ON_ERROR);
    }

    public function test_push_payload_opens_the_chat_without_client_data(): void
    {
        $id = (string) Str::uuid();
        $job = new SendWebPush(1, 1, 'n-1');

        $payload = $job->payload('Bellomo', 'n-1', ['event_type' => 'CONVERSATION_NEEDS_ATTENTION', 'conversation_id' => $id, 'lead_name' => 'Juana Pérez']);
        $this->assertSame("/admin/conversaciones?c=$id", $payload['url']);
        $this->assertSame("conversation-$id", $payload['tag']);
        $this->assertStringNotContainsString('Juana', json_encode($payload, JSON_THROW_ON_ERROR));

        $forged = $job->payload('Bellomo', 'n-2', ['event_type' => 'CONVERSATION_NEEDS_ATTENTION', 'conversation_id' => '../../logout']);
        $this->assertSame('/admin/notifications', $forged['url']);
    }

    public function test_inbox_list_shows_the_last_message_preview(): void
    {
        [$tenant, $token] = $this->widget();
        $manager = $this->user($tenant, RoleCode::SALES_MANAGER);
        $this->send($tenant, $token, 'Primero');
        $this->send($tenant, $token, 'Me interesa el lote 12B');

        // Neither an internal note, another conversation nor another tenant can become the preview.
        $conversation = DB::table('conversations')->where('tenant_id', $tenant->id)->first(['id', 'next_sequence']);
        DB::table('messages')->insert(['tenant_id' => $tenant->id, 'conversation_id' => $conversation->id, 'sequence' => $conversation->next_sequence,
            'direction' => 'INTERNAL', 'sender_type' => 'SYSTEM', 'message_type' => 'TEXT', 'text_body' => 'nota interna', 'delivery_status' => 'RECEIVED', 'occurred_at' => now()]);
        [$otherTenant, $otherToken] = $this->widget();
        $this->send($otherTenant, $otherToken, 'Mensaje de otro tenant');

        $response = $this->actingAs($manager)->withHeaders($this->tenantHeaders($tenant))->getJson('/api/v1/admin/conversations')->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.last_message', ['text' => 'Me interesa el lote 12B', 'sender' => 'CONTACT', 'type' => 'TEXT', 'event_kind' => null]);
        $this->assertStringNotContainsString('otro tenant', $response->getContent());
    }

    /** @return array{0: Tenant, 1: string} */
    private function widget(): array
    {
        ['tenant' => $tenant, 'integration' => $integration] = $this->tenantWithIntegration('WEB');
        $channel = $this->webChannel($tenant->id, $integration);
        $session = $this->withHeaders($this->tenantHeaders($tenant))
            ->postJson('/api/v1/public/chat/sessions', ['widget_id' => $channel['public_id']])->assertCreated();
        $this->flushHeaders();

        return [$tenant, (string) $session->json('data.token')];
    }

    private function send(Tenant $tenant, string $token, string $text): void
    {
        $this->withHeaders($this->tenantHeaders($tenant))->withToken($token)
            ->postJson('/api/v1/public/chat/messages', ['client_message_id' => (string) Str::uuid(), 'text' => $text])->assertCreated();
        $this->flushHeaders();
    }
}
