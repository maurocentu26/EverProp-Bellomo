<?php

namespace Tests\Feature\Integrations;

use App\Domain\Conversations\Transports\WhatsAppCloudTransport;
use App\Domain\Identity\Enums\RoleCode;
use App\Domain\Integrations\Services\IntegrationTokens;
use App\Domain\Tenancy\Models\Tenant;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Http\Client\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Storage;
use Tests\Feature\Conversations\ConversationTestSupport;
use Tests\TestCase;

/** Fase 4: a photo or PDF is uploaded to Meta first, then sent by its media id (Meta simulated; not proof of a live send). */
final class WhatsAppMediaSendTest extends TestCase
{
    use ConversationTestSupport, DatabaseTransactions;

    private const TOKEN = 'EAAG-synthetic-media-token';

    /** @return array<string, mixed> */
    private function channel(): array
    {
        ['tenant' => $tenant, 'integration' => $integration] = $this->tenantWithIntegration();
        app(IntegrationTokens::class)->store($tenant->id, $integration, self::TOKEN);
        config(['services.meta.send_enabled' => true, 'services.meta.graph_version' => 'v24.0']);
        Http::preventStrayRequests();

        return (array) DB::table('channel_accounts')->find($this->whatsappChannel($tenant->id, $integration, '2002'));
    }

    public function test_a_photo_is_uploaded_then_sent_with_its_caption(): void
    {
        $channel = $this->channel();
        Http::fake(['*/2002/media' => Http::response(['id' => 'MEDIA-1']), '*/2002/messages' => Http::response(['messages' => [['id' => 'wamid.X']]])]);

        $result = app(WhatsAppCloudTransport::class)->send($channel, '5493881111111', 'El 12A visto de frente', 'n',
            ['kind' => 'IMAGE', 'mime' => 'image/png', 'name' => 'lote.png', 'contents' => 'PNGBYTES']);

        $this->assertTrue($result->accepted);
        $this->assertSame('wamid.X', $result->providerMessageId);
        Http::assertSent(fn (Request $r) => str_ends_with($r->url(), '/2002/media') && $r->isMultipart() && $r->hasHeader('Authorization', 'Bearer '.self::TOKEN));
        Http::assertSent(fn (Request $r) => str_ends_with($r->url(), '/2002/messages') && $r['type'] === 'image'
            && $r['image'] === ['id' => 'MEDIA-1', 'caption' => 'El 12A visto de frente'] && $r['to'] === '5493881111111');
    }

    public function test_a_pdf_keeps_its_name_and_a_failed_upload_sends_nothing(): void
    {
        $channel = $this->channel();
        Http::fake(['*/2002/media' => Http::sequence()->push(['error' => ['code' => 1]], 503)->push(['id' => 'MEDIA-2']),
            '*/2002/messages' => Http::response(['messages' => [['id' => 'wamid.Y']]])]);
        $pdf = ['kind' => 'DOCUMENT', 'mime' => 'application/pdf', 'name' => 'Plano 12A.pdf', 'contents' => '%PDF'];
        $transport = app(WhatsAppCloudTransport::class);

        $failed = $transport->send($channel, '5493881111111', '', 'n', $pdf);
        $this->assertSame(['META_MEDIA_UPLOAD_503', true], [$failed->errorCode, $failed->retryable], 'nothing reached the client: safe to retry');
        Http::assertNotSent(fn (Request $r) => str_ends_with($r->url(), '/messages'));

        $this->assertTrue($transport->send($channel, '5493881111111', '', 'n', $pdf)->accepted);
        Http::assertSent(fn (Request $r) => str_ends_with($r->url(), '/2002/messages') && $r['document'] === ['id' => 'MEDIA-2', 'filename' => 'Plano 12A.pdf']);
    }

    public function test_a_photo_the_client_sends_is_fetched_once_checked_and_kept_private(): void
    {
        $png = (string) base64_decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==');
        config(['services.meta.app_secret' => self::APP_SECRET, 'conversations.ai_enabled' => false, 'filesystems.private' => 'local']);
        Storage::fake('local');
        $channel = $this->channel();
        $tenant = Tenant::query()->findOrFail($channel['tenant_id']);
        Http::fake(['*/v24.0/MEDIA-9' => Http::response(['url' => 'https://lookaside.fbsbx.com/whatsapp/x?mid=9', 'mime_type' => 'image/png']),
            'lookaside.fbsbx.com/*' => Http::response($png), '*/v24.0/MEDIA-EVIL' => Http::response(['url' => 'https://evil.example/steal'])]);
        $image = fn (string $wamid, string $mediaId) => ['from' => '5493881111111', 'id' => $wamid, 'timestamp' => (string) time(), 'type' => 'image',
            'image' => ['id' => $mediaId, 'mime_type' => 'image/png', 'caption' => 'Así está mi terreno']];

        $this->postWebhook($this->waPayload('2002', [$image('wamid.IMG1', 'MEDIA-9'), $image('wamid.IMG2', 'MEDIA-EVIL')]))->assertOk();
        $conversation = DB::table('conversations')->where('tenant_id', $tenant->id)->value('public_id');
        $message = DB::table('messages')->where('provider_message_id', 'wamid.IMG1')->first();
        $this->assertSame(['IMAGE', 'Así está mi terreno', 'MEDIA-9'], [$message->message_type, $message->text_body, json_decode((string) $message->media_json, true)['provider_media_id']]);

        $admin = $this->user($tenant, RoleCode::TENANT_ADMIN);
        $view = fn (int $sequence) => $this->actingAs($admin)->withHeaders($this->tenantHeaders($tenant))->get("/api/v1/admin/conversations/$conversation/media/$sequence");
        $this->assertSame($png, $view(1)->assertOk()->assertHeader('Content-Type', 'image/png')->streamedContent());
        $this->assertArrayHasKey('path', json_decode((string) DB::table('messages')->where('id', $message->id)->value('media_json'), true));
        $view(1)->assertOk();
        Http::assertSentCount(2); // id lookup + download, once: the second view reads the stored copy

        // A lookup answering with a host that is not Meta's CDN is never followed with the token.
        $view(2)->assertNotFound();
        Http::assertNotSent(fn (Request $r) => str_contains($r->url(), 'evil.example'));
    }

    public function test_another_tenant_and_oversized_files_never_reach_meta(): void
    {
        config(['services.meta.app_secret' => self::APP_SECRET, 'conversations.ai_enabled' => false]);
        $channel = $this->channel();
        $tenant = Tenant::query()->findOrFail($channel['tenant_id']);
        Http::fake(['*/v24.0/BIG-1' => Http::response(['url' => 'https://lookaside.fbsbx.com/x', 'mime_type' => 'video/mp4', 'file_size' => 90_000_000])]);
        $this->postWebhook($this->waPayload('2002', [['from' => '5493881111111', 'id' => 'wamid.V', 'timestamp' => (string) time(), 'type' => 'document',
            'document' => ['id' => 'BIG-1', 'mime_type' => 'video/mp4', 'filename' => 'recorrida.mp4']]]))->assertOk();
        $conversation = DB::table('conversations')->where('tenant_id', $tenant->id)->value('public_id');

        ['tenant' => $other] = $this->tenantWithIntegration();
        $this->actingAs($this->user($other, RoleCode::TENANT_ADMIN))->withHeaders($this->tenantHeaders($other))
            ->get("/api/v1/admin/conversations/$conversation/media/1")->assertNotFound();
        Http::assertNothingSent();

        $view = fn () => $this->actingAs($this->user($tenant, RoleCode::TENANT_ADMIN))->withHeaders($this->tenantHeaders($tenant))->get("/api/v1/admin/conversations/$conversation/media/1");
        $view()->assertNotFound();
        $view()->assertNotFound();
        Http::assertSentCount(1); // only the size/type lookup, once: the file is never downloaded and not asked again
    }
}
