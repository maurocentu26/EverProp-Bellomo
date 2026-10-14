<?php

namespace Tests\Feature\Conversations;

use App\Domain\Conversations\Services\ConversationControl;
use App\Domain\Identity\Enums\RoleCode;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Tests\TestCase;

final class MorningInboxTest extends TestCase
{
    use ConversationTestSupport, DatabaseTransactions;

    protected function setUp(): void
    {
        parent::setUp();
        config(['services.meta.app_secret' => self::APP_SECRET, 'conversations.ai_enabled' => false, 'queue.default' => 'sync']);
    }

    public function test_overnight_waiting_conversations_precede_newer_daytime_rows_before_pagination(): void
    {
        ['tenant' => $tenant, 'integration' => $integration] = $this->tenantWithIntegration();
        $tenant->update(['timezone' => 'America/Argentina/Salta', 'settings_json' => ['conversations' => ['business_hours' => ['tue' => [['09:00', '18:00']]]]]]);
        $channel = $this->whatsappChannel($tenant->id, $integration, 'PN-MORNING');
        $this->travelTo(CarbonImmutable::parse('2026-10-13 08:00', 'America/Argentina/Salta'));
        $this->postWebhook($this->waPayload('PN-MORNING', [$this->waText('night', 'Consulta nocturna')]))->assertOk();
        $night = DB::table('conversations')->where('tenant_id', $tenant->id)->first();
        $this->assertSame(1, (int) $night->waiting_out_of_hours);
        $this->travelTo(CarbonImmutable::parse('2026-10-13 09:00', 'America/Argentina/Salta'));
        $this->postWebhook($this->waPayload('PN-MORNING', [$this->waText('day-followup', 'Sigo esperando')]))->assertOk();
        $this->assertSame(1, (int) DB::table('conversations')->where('id', $night->id)->value('waiting_out_of_hours'));
        for ($i = 0; $i < 51; $i++) {
            DB::table('conversations')->insert(['tenant_id' => $tenant->id, 'public_id' => (string) Str::uuid(), 'contact_id' => $night->contact_id,
                'channel_account_id' => $channel, 'provider_thread_id' => 'day-'.$i, 'control_state' => 'WAITING_HUMAN', 'last_activity_at' => now('UTC')]);
        }
        $advisor = $this->user($tenant, RoleCode::SALES_ADVISOR);
        $response = $this->actingAs($advisor)->withHeaders($this->tenantHeaders($tenant))->getJson('/api/v1/admin/conversations')->assertOk();
        $response->assertJsonPath('data.0.id', $night->public_id)->assertJsonPath('data.0.arrived_out_of_hours', true)->assertJsonPath('meta.next_page', 2);
        $page2 = $this->getJson('/api/v1/admin/conversations?page=2')->assertOk();
        $this->assertCount(52, array_unique(array_merge($response->json('data.*.id'), $page2->json('data.*.id'))));
        $this->assertNull($response->json('data.0.handoff_summary'));
        app(ConversationControl::class)->takeover($tenant->id, (int) $night->id, $advisor);
        $this->assertSame(0, (int) DB::table('conversations')->where('id', $night->id)->value('waiting_out_of_hours'));
    }

    public function test_priority_does_not_expose_another_tenant_or_another_advisors_conversation(): void
    {
        ['tenant' => $tenant, 'integration' => $integration] = $this->tenantWithIntegration();
        $channel = $this->whatsappChannel($tenant->id, $integration, 'PN-PRIVATE');
        $this->postWebhook($this->waPayload('PN-PRIVATE', [$this->waText('private', 'Privado')]))->assertOk();
        $advisor = $this->user($tenant, RoleCode::SALES_ADVISOR);
        DB::table('conversations')->where('tenant_id', $tenant->id)->update(['waiting_out_of_hours' => 1, 'assigned_user_id' => $this->user($tenant, RoleCode::SALES_ADVISOR)->id]);
        ['tenant' => $other, 'integration' => $otherIntegration] = $this->tenantWithIntegration();
        $this->whatsappChannel($other->id, $otherIntegration, 'PN-OTHER-MORNING');
        $this->postWebhook($this->waPayload('PN-OTHER-MORNING', [$this->waText('other-private', 'Otro tenant')]))->assertOk();
        DB::table('conversations')->where('tenant_id', $other->id)->update(['waiting_out_of_hours' => 1]);
        $this->actingAs($advisor)->withHeaders($this->tenantHeaders($tenant))->getJson('/api/v1/admin/conversations')->assertOk()->assertJsonCount(0, 'data');
    }

    public function test_handoff_records_closed_hours_and_only_shows_summary_of_current_epoch(): void
    {
        ['tenant' => $tenant, 'integration' => $integration] = $this->tenantWithIntegration();
        $tenant->update(['settings_json' => ['conversations' => ['business_hours' => []]]]);
        $this->whatsappChannel($tenant->id, $integration, 'PN-HANDOFF-MORNING');
        $this->postWebhook($this->waPayload('PN-HANDOFF-MORNING', [$this->waText('handoff', 'Consulta')]))->assertOk();
        $row = DB::table('conversations')->where('tenant_id', $tenant->id)->first();
        DB::table('conversations')->where('id', $row->id)->update(['control_state' => 'AI_ACTIVE']);
        app(ConversationControl::class)->requestHuman($tenant->id, (int) $row->id, (int) $row->control_epoch, 'USER_REQUEST: Busca el lote 12B.');
        $this->assertSame(1, (int) DB::table('conversations')->where('id', $row->id)->value('waiting_out_of_hours'));
        $manager = $this->user($tenant, RoleCode::SALES_MANAGER);
        $this->actingAs($manager)->withHeaders($this->tenantHeaders($tenant))->getJson('/api/v1/admin/conversations')->assertOk()
            ->assertJsonPath('data.0.handoff_summary', 'USER_REQUEST: Busca el lote 12B.');
        DB::table('conversations')->where('id', $row->id)->increment('control_epoch');
        $this->getJson('/api/v1/admin/conversations')->assertOk()->assertJsonPath('data.0.handoff_summary', null);
        app(ConversationControl::class)->close($tenant->id, (int) $row->id, $manager);
        $this->assertSame(0, (int) DB::table('conversations')->where('id', $row->id)->value('waiting_out_of_hours'));
        $tenant->update(['timezone' => 'America/Argentina/Salta', 'settings_json' => ['conversations' => ['business_hours' => ['tue' => [['09:00', '18:00']]]]]]);
        $this->travelTo(CarbonImmutable::parse('2026-10-13 09:30', 'America/Argentina/Salta'));
        $this->postWebhook($this->waPayload('PN-HANDOFF-MORNING', [$this->waText('reopen-daytime', 'Vuelvo a consultar')]))->assertOk();
        $this->assertSame(0, (int) DB::table('conversations')->where('id', $row->id)->value('waiting_out_of_hours'));
        $this->assertSame('WAITING_HUMAN', DB::table('conversations')->where('id', $row->id)->value('control_state'));
    }

    public function test_no_schedule_is_always_open_and_does_not_mark_inbound_messages(): void
    {
        ['tenant' => $tenant, 'integration' => $integration] = $this->tenantWithIntegration();
        $this->whatsappChannel($tenant->id, $integration, 'PN-ALWAYS');
        $this->postWebhook($this->waPayload('PN-ALWAYS', [$this->waText('always', 'Hola')]))->assertOk();
        $this->assertSame(0, (int) DB::table('conversations')->where('tenant_id', $tenant->id)->value('waiting_out_of_hours'));
    }
}
