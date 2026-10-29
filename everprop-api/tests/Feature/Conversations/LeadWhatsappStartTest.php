<?php

namespace Tests\Feature\Conversations;

use App\Domain\Conversations\Http\Controllers\AdminConversationController;
use App\Domain\Identity\Enums\RoleCode;
use App\Domain\Integrations\Services\IntegrationTokens;
use App\Domain\Tenancy\Models\Tenant;
use App\Models\User;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Http\Client\Request;
use Illuminate\Http\Response;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Str;
use Illuminate\Testing\TestResponse;
use Tests\TestCase;

/** EVP-91: «Mensajes» from a lead opens its WhatsApp thread or starts one with an approved template (Meta simulated). */
final class LeadWhatsappStartTest extends TestCase
{
    use ConversationTestSupport, DatabaseTransactions;

    /** @return array{tenant: Tenant, advisor: User, lead: string, contact: int} */
    private function setUpLead(?string $phone = '+543881234567'): array
    {
        config(['services.meta.app_secret' => self::APP_SECRET, 'services.meta.send_enabled' => true, 'services.meta.graph_version' => 'v24.0',
            'conversations.ai_enabled' => false]);
        Http::preventStrayRequests();
        ['tenant' => $tenant, 'integration' => $integration] = $this->tenantWithIntegration();
        app(IntegrationTokens::class)->store($tenant->id, $integration, 'EAAG-synthetic-start-token');
        $channel = $this->whatsappChannel($tenant->id, $integration, '2002');
        DB::table('channel_accounts')->where('id', $channel)->update(['metadata_json' => json_encode(['waba_id' => '1001'])]);
        Http::fake(['*/v24.0/1001/message_templates*' => Http::response(['data' => [
            ['name' => 'primer_contacto', 'language' => 'es_AR', 'status' => 'APPROVED', 'category' => 'UTILITY',
                'components' => [['type' => 'BODY', 'text' => 'Hola {{1}}, te escribe tu asesor de Bellomo.']]],
        ]]), '*/v24.0/2002/messages' => Http::response(['messages' => [['id' => 'wamid.START']]])]);
        $advisor = $this->user($tenant, RoleCode::SALES_ADVISOR);

        return ['tenant' => $tenant, 'advisor' => $advisor] + $this->lead($tenant->id, $advisor->id, $phone);
    }

    /** @return array{lead: string, contact: int} */
    private function lead(int $tenantId, ?int $assignee, ?string $phone): array
    {
        $contact = (int) DB::table('contacts')->insertGetId(['tenant_id' => $tenantId, 'public_id' => (string) Str::uuid(),
            'display_name' => 'Ana Sintética', 'phone_e164' => $phone, 'lifecycle_status' => 'ACTIVE', 'first_seen_at' => now(), 'last_seen_at' => now()]);
        $stage = DB::table('pipeline_stages')->where('tenant_id', $tenantId)->value('id') ?? DB::table('pipeline_stages')->insertGetId([
            'tenant_id' => $tenantId, 'code' => 'NEW', 'name' => 'New', 'category' => 'OPEN', 'position' => 1]);
        $lead = (string) Str::uuid();
        DB::table('leads')->insert(['tenant_id' => $tenantId, 'public_id' => $lead, 'contact_id' => $contact, 'stage_id' => $stage,
            'assigned_user_id' => $assignee, 'source_channel' => 'WEB', 'source_kind' => 'MANUAL', 'title' => 'Lead', 'first_touch_at' => now(), 'last_touch_at' => now()]);

        return ['lead' => $lead, 'contact' => $contact];
    }

    /**
     * @param  array{tenant: Tenant, advisor: User, lead: string}  $f
     * @param  list<string>  $params
     * @return TestResponse<Response>
     */
    private function start(array $f, string $key = 'start-key-000000001', array $params = ['Ana']): TestResponse
    {
        return $this->actingAs($f['advisor'])->withHeaders($this->tenantHeaders($f['tenant']))->postJson("/api/v1/admin/leads/{$f['lead']}/whatsapp",
            ['name' => 'primer_contacto', 'language' => 'es_AR', 'params' => $params, 'idempotency_key' => $key]);
    }

    public function test_wa_id_adds_the_argentine_mobile_nine(): void
    {
        $this->assertSame('5493881234567', AdminConversationController::waId('+54 388 123-4567'));
        $this->assertSame('5493881234567', AdminConversationController::waId('+5493881234567'));
        $this->assertSame('14155550100', AdminConversationController::waId('+1 415 555 0100'));
        $this->assertNull(AdminConversationController::waId('123'));
        $this->assertNull(AdminConversationController::waId(null));
    }

    public function test_a_lead_without_thread_starts_one_with_a_template_and_the_reply_lands_in_it(): void
    {
        $f = $this->setUpLead();
        $as = fn () => $this->actingAs($f['advisor'])->withHeaders($this->tenantHeaders($f['tenant']));

        $as()->getJson("/api/v1/admin/leads/{$f['lead']}/whatsapp")->assertOk()
            ->assertJsonPath('data.conversation_id', null)->assertJsonPath('data.phone', '+5493881234567')
            ->assertJsonPath('data.reason', null)->assertJsonPath('data.templates.0.name', 'primer_contacto');
        // Reading never sends.
        Http::assertNotSent(fn (Request $r) => str_ends_with($r->url(), '/messages'));

        $id = $this->start($f)->assertStatus(201)->json('data.conversation_id');
        $this->start($f)->assertOk()->assertJsonPath('data.conversation_id', $id)->assertJsonPath('data.replayed', true);

        $conversation = DB::table('conversations')->where('public_id', $id)->first();
        $this->assertSame(['wa:5493881234567', 'HUMAN_ACTIVE', $f['advisor']->id, $f['advisor']->id, $f['contact']],
            [$conversation->provider_thread_id, $conversation->control_state, (int) $conversation->controlled_by_user_id,
                (int) $conversation->assigned_user_id, (int) $conversation->contact_id]);
        $this->assertSame(1, DB::table('messages')->where('conversation_id', $conversation->id)->where('message_type', 'TEMPLATE')->count());
        Http::assertSentCount(2); // templates sync + one send
        Http::assertSent(fn (Request $r) => str_ends_with($r->url(), '/2002/messages') && $r['to'] === '5493881234567' && $r['type'] === 'template');

        $as()->getJson("/api/v1/admin/leads/{$f['lead']}/whatsapp")->assertOk()->assertJsonPath('data.conversation_id', $id)->assertJsonPath('data.templates', []);
        $this->start($f, 'start-key-000000002')->assertStatus(409)->assertJsonPath('error.code', 'CONVERSATION_EXISTS');

        // The client's reply goes to the same thread and the lead's contact, not a new one.
        $this->postWebhook($this->waPayload('2002', [$this->waText('wamid.reply', 'Hola!', '5493881234567')]))->assertOk();
        $this->assertSame(1, DB::table('conversations')->where('tenant_id', $f['tenant']->id)->count());
        $this->assertSame(1, DB::table('contacts')->where('tenant_id', $f['tenant']->id)->count());
    }

    public function test_nothing_is_sent_without_phone_template_access_or_own_identity(): void
    {
        $f = $this->setUpLead(null);
        $as = fn () => $this->actingAs($f['advisor'])->withHeaders($this->tenantHeaders($f['tenant']));
        $as()->getJson("/api/v1/admin/leads/{$f['lead']}/whatsapp")->assertOk()->assertJsonPath('data.reason', 'NO_PHONE');
        $this->start($f)->assertStatus(422)->assertJsonPath('error.code', 'NO_PHONE');

        DB::table('contacts')->where('id', $f['contact'])->update(['phone_e164' => '+5493881234567']);
        $this->start($f, params: [])->assertStatus(422)->assertJsonPath('error.code', 'TEMPLATE_NOT_APPROVED');

        // Another advisor's lead is invisible.
        $other = $this->lead($f['tenant']->id, $this->user($f['tenant'], RoleCode::SALES_ADVISOR)->id, '+5493887654321');
        $as()->getJson("/api/v1/admin/leads/{$other['lead']}/whatsapp")->assertNotFound();
        $this->start(['lead' => $other['lead']] + $f)->assertNotFound();

        // The number already belongs to another contact.
        $stranger = (int) DB::table('contacts')->insertGetId(['tenant_id' => $f['tenant']->id, 'public_id' => (string) Str::uuid(), 'lifecycle_status' => 'ACTIVE', 'first_seen_at' => now(), 'last_seen_at' => now()]);
        DB::table('contact_identities')->insert(['tenant_id' => $f['tenant']->id, 'contact_id' => $stranger, 'channel_type' => 'WHATSAPP',
            'provider_scope_id' => '', 'provider_user_id' => '5493881234567', 'identity_hash' => hash('sha256', "WHATSAPP\0".'5493881234567', true),
            'first_seen_at' => now(), 'last_seen_at' => now()]);
        $this->start($f)->assertStatus(409)->assertJsonPath('error.code', 'IDENTITY_OF_ANOTHER_CONTACT');

        // Read-only users cannot send.
        $this->actingAs($this->user($f['tenant'], RoleCode::READ_ONLY))->withHeaders($this->tenantHeaders($f['tenant']))
            ->postJson("/api/v1/admin/leads/{$f['lead']}/whatsapp", ['name' => 'primer_contacto', 'language' => 'es_AR', 'params' => ['Ana'], 'idempotency_key' => 'start-key-000000003'])
            ->assertForbidden();

        $this->assertSame(0, DB::table('conversations')->where('tenant_id', $f['tenant']->id)->count());
        Http::assertNotSent(fn (Request $r) => str_ends_with($r->url(), '/messages'));
    }
}
