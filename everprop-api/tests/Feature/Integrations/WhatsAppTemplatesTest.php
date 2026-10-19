<?php

namespace Tests\Feature\Integrations;

use App\Domain\Conversations\Services\ConversationControl;
use App\Domain\Identity\Enums\RoleCode;
use App\Domain\Integrations\Services\IntegrationTokens;
use App\Domain\Tenancy\Models\Tenant;
use App\Models\User;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Http\Client\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Tests\Feature\Conversations\ConversationTestSupport;
use Tests\TestCase;

/** Fase 4: after the 24 h window, only an approved template goes (Meta simulated; not proof of a live send). */
final class WhatsAppTemplatesTest extends TestCase
{
    use ConversationTestSupport, DatabaseTransactions;

    /** @return array{tenant: Tenant, conversation: string, advisor: User} */
    private function closedWindow(): array
    {
        config(['services.meta.app_secret' => self::APP_SECRET, 'services.meta.send_enabled' => true, 'services.meta.graph_version' => 'v24.0',
            'conversations.ai_enabled' => false]);
        Http::preventStrayRequests();
        ['tenant' => $tenant, 'integration' => $integration] = $this->tenantWithIntegration();
        app(IntegrationTokens::class)->store($tenant->id, $integration, 'EAAG-synthetic-template-token');
        $channel = $this->whatsappChannel($tenant->id, $integration, '2002');
        Http::fake(['*/v24.0/1001/message_templates*' => Http::response(['data' => [
            ['name' => 'seguimiento_visita', 'language' => 'es_AR', 'status' => 'APPROVED', 'category' => 'UTILITY',
                'components' => [['type' => 'BODY', 'text' => 'Hola {{1}}, ¿seguís interesado en el lote {{2}}? Un asesor te puede llamar.']]],
            ['name' => 'promo_con_foto', 'language' => 'es_AR', 'status' => 'APPROVED', 'category' => 'MARKETING',
                'components' => [['type' => 'HEADER', 'format' => 'IMAGE'], ['type' => 'BODY', 'text' => 'Promo']]],
            ['name' => 'pendiente', 'language' => 'es_AR', 'status' => 'PENDING', 'components' => [['type' => 'BODY', 'text' => 'x']]],
        ]]), '*/v24.0/2002/messages' => Http::response(['messages' => [['id' => 'wamid.TPL']]])]);
        // The client wrote two days ago: the free-form window is closed.
        $this->postWebhook($this->waPayload('2002', [['timestamp' => (string) now()->subDays(2)->timestamp] + $this->waText('wamid.old', 'Hola')]))->assertOk();
        $conversationId = (int) DB::table('conversations')->where('tenant_id', $tenant->id)->value('id');
        // The account the templates live in (set after the webhook: the synthetic payload names another WABA).
        DB::table('channel_accounts')->where('id', $channel)->update(['metadata_json' => json_encode(['waba_id' => '1001'])]);
        DB::table('messages')->where('conversation_id', $conversationId)->update(['created_at' => now()->subDays(2)]);
        $advisor = $this->user($tenant, RoleCode::SALES_ADVISOR);
        app(ConversationControl::class)->takeover((int) $tenant->id, $conversationId, $advisor);

        return ['tenant' => $tenant, 'advisor' => $advisor, 'conversation' => (string) DB::table('conversations')->where('id', $conversationId)->value('public_id')];
    }

    public function test_an_approved_template_reopens_the_conversation_after_24_hours(): void
    {
        $f = $this->closedWindow();
        $as = fn () => $this->actingAs($f['advisor'])->withHeaders($this->tenantHeaders($f['tenant']));

        // Only approved templates with body-only variables are offered.
        $as()->getJson("/api/v1/admin/conversations/{$f['conversation']}/templates")->assertOk()
            ->assertJsonCount(1, 'data')->assertJsonPath('data.0.name', 'seguimiento_visita')->assertJsonPath('data.0.params', 2);
        // Free text is still refused outside the window.
        $as()->postJson("/api/v1/admin/conversations/{$f['conversation']}/messages", ['text' => 'Hola', 'idempotency_key' => 'tpl-text-0000000001'])
            ->assertStatus(409)->assertJsonPath('error.code', 'OUTSIDE_SERVICE_WINDOW');

        $as()->postJson("/api/v1/admin/conversations/{$f['conversation']}/template", ['name' => 'seguimiento_visita', 'language' => 'es_AR',
            'params' => ["Ana\n", '12A'], 'idempotency_key' => 'tpl-send-0000000001'])->assertStatus(202);

        $message = DB::table('messages')->where('direction', 'OUTBOUND')->latest('id')->first();
        $this->assertSame(['TEMPLATE', 'Hola Ana, ¿seguís interesado en el lote 12A? Un asesor te puede llamar.', 'SENT'],
            [$message->message_type, $message->text_body, $message->delivery_status]);
        Http::assertSent(fn (Request $r) => str_ends_with($r->url(), '/2002/messages') && $r['type'] === 'template'
            && $r['template'] === ['name' => 'seguimiento_visita', 'language' => ['code' => 'es_AR'],
                'components' => [['type' => 'body', 'parameters' => [['type' => 'text', 'text' => 'Ana'], ['type' => 'text', 'text' => '12A']]]]]);
    }

    public function test_unapproved_or_incomplete_templates_never_go(): void
    {
        $f = $this->closedWindow();
        $send = fn (array $body) => $this->actingAs($f['advisor'])->withHeaders($this->tenantHeaders($f['tenant']))
            ->postJson("/api/v1/admin/conversations/{$f['conversation']}/template", $body + ['language' => 'es_AR', 'idempotency_key' => 'tpl-send-0000000002']);

        $send(['name' => 'pendiente', 'params' => []])->assertStatus(422);
        $send(['name' => 'promo_con_foto', 'params' => []])->assertStatus(422);
        $send(['name' => 'seguimiento_visita', 'params' => ['Ana']])->assertStatus(422);
        $this->actingAs($this->user($f['tenant'], RoleCode::SALES_MANAGER))->withHeaders($this->tenantHeaders($f['tenant']))
            ->postJson("/api/v1/admin/conversations/{$f['conversation']}/template", ['name' => 'seguimiento_visita', 'language' => 'es_AR', 'params' => ['Ana', '12A'], 'idempotency_key' => 'tpl-send-0000000003'])
            ->assertStatus(409)->assertJsonPath('error.code', 'NOT_IN_CONTROL');

        $this->assertSame(0, DB::table('messages')->where('direction', 'OUTBOUND')->count());
        Http::assertNotSent(fn (Request $r) => str_ends_with($r->url(), '/messages'));
    }
}
