<?php

namespace Tests\Feature\Conversations;

use App\Console\Commands\ConversationKpis;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Tests\TestCase;

/** S16 minimal pilot KPIs: cohort, first human response, unanswered, leads, duplicates, tenant scope. */
final class ConversationKpisTest extends TestCase
{
    use ConversationTestSupport, DatabaseTransactions;

    protected function setUp(): void
    {
        parent::setUp();
        config(['services.meta.app_secret' => self::APP_SECRET, 'conversations.ai_enabled' => false]);
    }

    protected function tearDown(): void
    {
        CarbonImmutable::setTestNow();
        parent::tearDown();
    }

    /**
     * Customer writes at $at.
     *
     * @return array{0: int, 1: int} conversation id, contact id
     */
    private function customerWrites(int $tenantId, string $phoneNumberId, string $from, CarbonImmutable $at): array
    {
        CarbonImmutable::setTestNow($at);
        $this->postWebhook($this->waPayload($phoneNumberId, [$this->waText('wamid.'.Str::random(8), 'Hola', $from)]))->assertOk();
        $row = DB::table('conversations')->where('tenant_id', $tenantId)->where('provider_thread_id', 'wa:'.$from)->orderByDesc('id')->first(['id', 'contact_id']);

        return [(int) $row->id, (int) $row->contact_id];
    }

    private function advisorSays(int $tenantId, int $conversationId, ?string $text, CarbonImmutable $at, string $status = 'DELIVERED'): void
    {
        $conversation = DB::table('conversations')->where('id', $conversationId)->first(['channel_account_id', 'next_sequence']);
        DB::table('messages')->insert([
            'tenant_id' => $tenantId, 'conversation_id' => $conversationId, 'channel_account_id' => $conversation->channel_account_id,
            'sequence' => $conversation->next_sequence, 'direction' => 'OUTBOUND', 'sender_type' => 'USER', 'message_type' => $text === null ? 'IMAGE' : 'TEXT',
            'text_body' => $text, 'delivery_status' => $status, 'occurred_at' => $at->format('Y-m-d H:i:s.v'),
        ]);
        DB::table('conversations')->where('id', $conversationId)->increment('next_sequence');
    }

    private function lead(int $tenantId, int $contactId, CarbonImmutable $at, ?int $sourceChannel = null): void
    {
        $stage = DB::table('pipeline_stages')->where('tenant_id', $tenantId)->value('id') ?? DB::table('pipeline_stages')->insertGetId([
            'tenant_id' => $tenantId, 'code' => 'NEW', 'name' => 'New', 'category' => 'OPEN', 'position' => 1,
        ]);
        // Closed leads, so a contact may have several (only one open lead per contact is allowed).
        DB::table('leads')->insert([
            'tenant_id' => $tenantId, 'public_id' => (string) Str::uuid(), 'contact_id' => $contactId, 'stage_id' => $stage,
            'source_channel' => 'WHATSAPP', 'source_kind' => 'CONVERSATION', 'source_channel_account_id' => $sourceChannel,
            'title' => 'Chat', 'first_touch_at' => $at, 'last_touch_at' => $at, 'created_at' => $at->format('Y-m-d H:i:s.v'),
            'is_open' => 0,
        ]);
    }

    public function test_pilot_kpis_for_one_week(): void
    {
        ['tenant' => $tenant, 'integration' => $integration] = $this->tenantWithIntegration();
        $this->whatsappChannel($tenant->id, $integration, 'PN-KPI');
        $webChannel = $this->webChannel($tenant->id, $integration)['id'];
        $monday = CarbonImmutable::parse('2026-01-05 12:00:00', 'UTC');

        // Answered in 10 min, then the same text sent twice (Meta already marked both as delivered).
        [$answered, $contact] = $this->customerWrites($tenant->id, 'PN-KPI', '5493810000001', $monday);
        $this->advisorSays($tenant->id, $answered, 'Hola, te paso la info', $monday->addMinutes(10));
        $this->advisorSays($tenant->id, $answered, 'Hola, te paso la info', $monday->addMinutes(10)->addSeconds(30));
        $this->lead($tenant->id, $contact, $monday->addMinutes(20));
        $this->lead($tenant->id, $contact, $monday->addDays(8)); // after the range: neither counted nor a duplicate

        // Answered in 2 h; two photos in a row are not a duplicate; a lead from the web chat is not WhatsApp's.
        [$slow, $slowContact] = $this->customerWrites($tenant->id, 'PN-KPI', '5493810000002', $monday->addDay());
        $this->advisorSays($tenant->id, $slow, 'Perdón la demora', $monday->addDay()->addHours(2), 'READ');
        $this->advisorSays($tenant->id, $slow, null, $monday->addDay()->addHours(2)->addSeconds(10));
        $this->advisorSays($tenant->id, $slow, null, $monday->addDay()->addHours(2)->addSeconds(20));
        $this->lead($tenant->id, $slowContact, $monday->addDay()->addHours(3), $webChannel);

        // Never answered: a message written before the customer's, one that failed and one still queued.
        [$ignored] = $this->customerWrites($tenant->id, 'PN-KPI', '5493810000003', $monday->addDays(2));
        $this->advisorSays($tenant->id, $ignored, 'Plantilla previa', $monday->addDays(2)->subHour(), 'SENT');
        $this->advisorSays($tenant->id, $ignored, 'No salió', $monday->addDays(2)->addMinute(), 'FAILED');
        $this->advisorSays($tenant->id, $ignored, 'Sigue en cola', $monday->addDays(2)->addMinutes(2), 'QUEUED');

        $this->customerWrites($tenant->id, 'PN-KPI', '5493810000004', $monday->addDays(9)); // outside the range

        // Another tenant, same customer phone, its own double send and leads: nothing leaks into ours.
        ['tenant' => $other, 'integration' => $otherIntegration] = $this->tenantWithIntegration();
        $this->whatsappChannel($other->id, $otherIntegration, 'PN-OTHER');
        [$theirs, $theirContact] = $this->customerWrites($other->id, 'PN-OTHER', '5493810000001', $monday);
        $this->advisorSays($other->id, $theirs, 'Hola', $monday->addMinute());
        $this->advisorSays($other->id, $theirs, 'Hola', $monday->addMinute()->addSeconds(5));
        $this->lead($other->id, $theirContact, $monday->addMinutes(2));
        $this->lead($other->id, $theirContact, $monday->addMinutes(3));

        $kpis = app(ConversationKpis::class)->compute($tenant->id, $monday->startOfDay(), $monday->startOfDay()->addDays(7));

        $this->assertSame(['WHATSAPP'], array_keys($kpis['by_channel']));
        $this->assertSame([
            'conversations' => 3,
            'first_human_response_minutes' => ['answered' => 2, 'p50' => 10.0, 'p95' => 120.0],
            'without_human_response' => 1,
            'conversations_with_lead' => 1,
            'conversations_with_complete_lead' => 1,
        ], $kpis['by_channel']['WHATSAPP']);
        $this->assertSame(['contacts_with_several_leads' => 0, 'advisor_messages_sent_twice' => 1], $kpis['duplicates']);

        $theirKpis = app(ConversationKpis::class)->compute($other->id, $monday->startOfDay(), $monday->startOfDay()->addDays(7));
        $this->assertSame(['contacts_with_several_leads' => 1, 'advisor_messages_sent_twice' => 1], $theirKpis['duplicates']);
    }

    public function test_the_command_prints_only_aggregates_and_validates_its_input(): void
    {
        ['tenant' => $tenant] = $this->tenantWithIntegration();

        $this->artisan('everprop:conversations:kpis', ['--tenant' => 'nope'])->assertFailed();
        $this->artisan('everprop:conversations:kpis', ['--tenant' => $tenant->slug, '--from' => '2026-01-10', '--to' => '2026-01-03'])->assertFailed();
        $this->artisan('everprop:conversations:kpis', ['--tenant' => $tenant->slug, '--from' => '05/01/2026'])->assertFailed();

        $this->assertSame(0, Artisan::call('everprop:conversations:kpis', ['--tenant' => $tenant->slug, '--from' => '2026-01-05', '--to' => '2026-01-12']));
        $output = json_decode(Artisan::output(), true, 512, JSON_THROW_ON_ERROR);
        $this->assertSame(['tenant_id', 'from', 'to_exclusive', 'timezone', 'by_channel', 'duplicates', 'copilot'], array_keys($output));
    }
}
