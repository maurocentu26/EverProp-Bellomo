<?php

namespace Tests\Feature\Conversations;

use App\Domain\Conversations\Data\InboundMessage;
use App\Domain\Conversations\Services\InboundMessageService;
use App\Domain\Identity\Enums\RoleCode;
use App\Domain\Tenancy\Models\Tenant;
use App\Models\User;
use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Tests\TestCase;

/**
 * EVP-125: Instagram, Messenger and WhatsApp DMs never create a lead on their own; while nobody answers them and the
 * contact has no open lead they are listed as "possible leads" with the inbox visibility rules. Commits (the lead
 * procedure refuses transactions); tenants removed after.
 */
final class PossibleLeadsTest extends TestCase
{
    use ConversationTestSupport;

    /** @var list<int> */
    private array $tenants = [];

    protected function setUp(): void
    {
        parent::setUp();
        config(['conversations.ai_enabled' => false]);
    }

    protected function tearDown(): void
    {
        $this->deleteSyntheticTenants($this->tenants);
        parent::tearDown();
    }

    /** @return array{tenant: Tenant, channels: array<string, int>} */
    private function tenant(): array
    {
        ['tenant' => $tenant, 'integration' => $integration] = $this->tenantWithIntegration();
        $this->tenants[] = (int) $tenant->id;
        DB::table('pipeline_stages')->insert(['tenant_id' => $tenant->id, 'code' => 'NEW', 'name' => 'New', 'category' => 'OPEN', 'position' => 1, 'is_active' => true]);
        $channels = [];
        foreach (['INSTAGRAM_DM', 'FACEBOOK_MESSENGER', 'WEB_CHAT'] as $type) {
            $channels[$type] = (int) DB::table('channel_accounts')->insertGetId(['tenant_id' => $tenant->id, 'integration_id' => $integration,
                'public_id' => (string) Str::uuid(), 'channel_type' => $type, 'provider_account_id' => $type.'-'.$tenant->id, 'display_name' => $type]);
        }
        $channels['WHATSAPP'] = $this->whatsappChannel($tenant->id, $integration, 'pl-wa-'.$tenant->id);

        return ['tenant' => $tenant, 'channels' => $channels];
    }

    /**
     * A client message on $type from $sender; returns the conversation public id.
     *
     * @param  array{tenant: Tenant, channels: array<string, int>}  $t
     */
    private function inbound(array $t, string $type, string $sender, string $text = 'Hola, ¿precio?'): string
    {
        $identity = ['INSTAGRAM_DM' => 'INSTAGRAM', 'FACEBOOK_MESSENGER' => 'FACEBOOK', 'WHATSAPP' => 'WHATSAPP', 'WEB_CHAT' => 'WEB_CHAT'][$type];
        $result = app(InboundMessageService::class)->accept(new InboundMessage(
            tenantId: (int) $t['tenant']->id, channelAccountId: $t['channels'][$type], identityChannelType: $identity,
            senderProviderId: $sender, threadId: strtolower($type).':'.$sender, providerMessageId: 'mid.'.Str::uuid(),
            type: 'TEXT', text: $text, occurredAt: CarbonImmutable::now('UTC'),
        ));

        return $result['conversation_public_id'];
    }

    /** An outbound message by $sender (USER or BOT), as the dispatcher stores it. */
    private function outbound(string $conversation, string $sender): void
    {
        $c = DB::table('conversations')->where('public_id', $conversation)->first(['id', 'tenant_id', 'channel_account_id', 'next_sequence']);
        DB::table('messages')->insert(['tenant_id' => $c->tenant_id, 'conversation_id' => $c->id, 'channel_account_id' => $c->channel_account_id,
            'sequence' => $c->next_sequence, 'direction' => 'OUTBOUND', 'sender_type' => $sender, 'message_type' => 'TEXT',
            'text_body' => 'Respuesta', 'delivery_status' => 'SENT', 'occurred_at' => now('UTC')]);
        DB::table('conversations')->where('id', $c->id)->update(['next_sequence' => $c->next_sequence + 1]);
    }

    /** @return list<string> */
    private function possibleLeads(User $user, Tenant $tenant): array
    {
        $headers = $this->tenantHeaders($tenant);
        $ids = array_column($this->actingAs($user)->withHeaders($headers)
            ->getJson('/api/v1/admin/conversations?possible_leads=1')->assertOk()->json('data'), 'id');
        $count = $this->actingAs($user)->withHeaders($headers)->getJson('/api/v1/admin/conversations/possible-leads/count')->assertOk()->json('data.count');
        $this->flushHeaders();
        $this->assertSame(count($ids), $count, 'the badge counts exactly what the list shows');
        sort($ids);

        return $ids;
    }

    public function test_unanswered_social_dms_without_a_lead_are_listed_and_never_create_a_lead(): void
    {
        $t = $this->tenant();
        $admin = $this->user($t['tenant'], RoleCode::TENANT_ADMIN);
        $instagram = $this->inbound($t, 'INSTAGRAM_DM', 'ig-1');
        $messenger = $this->inbound($t, 'FACEBOOK_MESSENGER', 'fb-1');
        $whatsapp = $this->inbound($t, 'WHATSAPP', '5493880000001');
        $this->inbound($t, 'WEB_CHAT', 'visitor-1'); // the web chat is not a social DM

        $expected = [$instagram, $messenger, $whatsapp];
        sort($expected);
        $this->assertSame($expected, $this->possibleLeads($admin, $t['tenant']));
        $this->assertSame(0, DB::table('leads')->where('tenant_id', $t['tenant']->id)->count(), 'no lead is created automatically');

        /** @var list<array<string, mixed>> $rows */
        $rows = $this->actingAs($admin)->withHeaders($this->tenantHeaders($t['tenant']))
            ->getJson('/api/v1/admin/conversations?possible_leads=1')->json('data');
        $row = collect($rows)->firstWhere('id', $instagram);
        $this->assertSame('INSTAGRAM_DM', $row['channel']);
        $this->assertNotNull($row['waiting_since'], 'the wait is shown');
        $this->assertSame('Hola, ¿precio?', $row['last_message']['text']);
    }

    public function test_a_bot_reply_keeps_it_while_an_advisor_reply_a_lead_or_closing_removes_it(): void
    {
        $t = $this->tenant();
        $admin = $this->user($t['tenant'], RoleCode::TENANT_ADMIN);
        $botOnly = $this->inbound($t, 'INSTAGRAM_DM', 'ig-bot');
        $answered = $this->inbound($t, 'INSTAGRAM_DM', 'ig-answered');
        $converted = $this->inbound($t, 'WHATSAPP', '5493880000002');
        $closed = $this->inbound($t, 'FACEBOOK_MESSENGER', 'fb-closed');

        $this->outbound($botOnly, 'BOT');
        $this->outbound($answered, 'USER');
        $this->actingAs($admin)->withHeaders($this->tenantHeaders($t['tenant']))
            ->postJson("/api/v1/admin/conversations/$converted/lead")->assertCreated();
        DB::table('conversations')->where('public_id', $closed)->update(['control_state' => 'CLOSED', 'status' => 'RESOLVED']);
        $this->flushHeaders();

        $this->assertSame([$botOnly], $this->possibleLeads($admin, $t['tenant']));
        $contact = DB::table('conversations')->where('public_id', $converted)->value('contact_id');
        $this->assertSame('WHATSAPP', DB::table('leads')->where('contact_id', $contact)->value('source_channel'), 'the lead keeps the channel');

        // The client writes again after the advisor answered: it is a possible lead again.
        $this->inbound($t, 'INSTAGRAM_DM', 'ig-answered', 'Otra consulta');
        $expected = [$botOnly, $answered];
        sort($expected);
        $this->assertSame($expected, $this->possibleLeads($admin, $t['tenant']));
    }

    public function test_advisors_only_see_their_own_and_unassigned_ones_and_other_tenants_never(): void
    {
        $t = $this->tenant();
        $other = $this->tenant();
        $advisor = $this->user($t['tenant'], RoleCode::SALES_ADVISOR);
        $colleague = $this->user($t['tenant'], RoleCode::SALES_ADVISOR);
        $unassigned = $this->inbound($t, 'INSTAGRAM_DM', 'ig-a');
        $mine = $this->inbound($t, 'INSTAGRAM_DM', 'ig-b');
        $theirs = $this->inbound($t, 'WHATSAPP', '5493880000003');
        $this->inbound($other, 'INSTAGRAM_DM', 'ig-other-tenant');
        DB::table('conversations')->where('public_id', $mine)->update(['assigned_user_id' => $advisor->id, 'control_state' => 'HUMAN_ACTIVE']);
        DB::table('conversations')->where('public_id', $theirs)->update(['assigned_user_id' => $colleague->id, 'control_state' => 'HUMAN_ACTIVE']);

        $expected = [$unassigned, $mine];
        sort($expected);
        $this->assertSame($expected, $this->possibleLeads($advisor, $t['tenant']));
        $this->assertCount(3, $this->possibleLeads($this->user($t['tenant'], RoleCode::SALES_MANAGER), $t['tenant']));
        $this->assertCount(1, $this->possibleLeads($this->user($other['tenant'], RoleCode::TENANT_ADMIN), $other['tenant']), 'tenant isolation');
    }
}
