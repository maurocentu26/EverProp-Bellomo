<?php

namespace Tests\Feature\Conversations;

use App\Domain\Conversations\Services\ConversationControl;
use App\Domain\Identity\Enums\RoleCode;
use App\Domain\Tenancy\Models\Tenant;
use App\Models\User;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Http\Response;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Illuminate\Testing\TestResponse;
use Tests\TestCase;

/** Fase 4: photos and PDFs from the advisor, private, readable only through authorized endpoints. */
final class ConversationAttachmentsTest extends TestCase
{
    use ConversationTestSupport, DatabaseTransactions;

    /** A real 1x1 PNG: the type is sniffed from the bytes, never from the name. */
    private const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

    private const PDF = "%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n";

    protected function setUp(): void
    {
        parent::setUp();
        config(['conversations.web_rate_limit_per_minute' => 10_000, 'conversations.ai_enabled' => false, 'filesystems.private' => 'local']);
        Storage::fake('local');
    }

    /** @return array{tenant: Tenant, conversation: string, id: int, token: string, advisor: User} */
    private function inControl(): array
    {
        ['tenant' => $tenant, 'integration' => $integration] = $this->tenantWithIntegration('WEB');
        $widget = $this->webChannel($tenant->id, $integration);
        $token = (string) $this->withHeaders($this->tenantHeaders($tenant))
            ->postJson('/api/v1/public/chat/sessions', ['widget_id' => $widget['public_id']])->json('data.token');
        $this->withToken($token)->postJson('/api/v1/public/chat/messages', ['client_message_id' => (string) Str::uuid(), 'text' => '¿Tienen fotos del lote?'])->assertCreated();
        $this->flushHeaders();
        $id = (int) DB::table('conversations')->where('tenant_id', $tenant->id)->value('id');
        $advisor = $this->user($tenant, RoleCode::SALES_ADVISOR);
        app(ConversationControl::class)->takeover((int) $tenant->id, $id, $advisor);

        return ['tenant' => $tenant, 'id' => $id, 'token' => $token, 'advisor' => $advisor,
            'conversation' => (string) DB::table('conversations')->where('id', $id)->value('public_id')];
    }

    private function file(string $name, string $contents): UploadedFile
    {
        return UploadedFile::fake()->createWithContent($name, $contents);
    }

    /** @return TestResponse<Response> */
    private function attach(User $user, Tenant $tenant, string $conversation, UploadedFile $file, string $key = 'attach-key-00000001', ?string $caption = null): TestResponse
    {
        return $this->actingAs($user)->withHeaders($this->tenantHeaders($tenant))->post("/api/v1/admin/conversations/$conversation/attachments",
            ['file' => $file, 'idempotency_key' => $key] + ($caption === null ? [] : ['caption' => $caption]), ['Accept' => 'application/json']);
    }

    public function test_the_advisor_sends_a_photo_and_only_the_conversation_can_read_it(): void
    {
        $f = $this->inControl();
        // Built before anyone signs in: another visitor of the same tenant, and another tenant.
        $widget = DB::table('channel_accounts')->where('tenant_id', $f['tenant']->id)->value('public_id');
        $otherVisitor = (string) $this->withHeaders($this->tenantHeaders($f['tenant']))->postJson('/api/v1/public/chat/sessions', ['widget_id' => $widget])->json('data.token');
        $this->withToken($otherVisitor)->postJson('/api/v1/public/chat/messages', ['client_message_id' => (string) Str::uuid(), 'text' => 'Hola'])->assertCreated();
        $this->withToken($otherVisitor)->postJson('/api/v1/public/chat/messages', ['client_message_id' => (string) Str::uuid(), 'text' => 'Sigo'])->assertCreated();
        $this->flushHeaders();
        ['tenant' => $otherTenant] = $this->tenantWithIntegration('WEB');
        $png = (string) base64_decode(self::PNG);

        $this->attach($f['advisor'], $f['tenant'], $f['conversation'], $this->file('lote 12A.png', $png), caption: 'Así se ve el 12A')->assertStatus(202);

        $message = DB::table('messages')->where('conversation_id', $f['id'])->where('direction', 'OUTBOUND')->sole();
        $media = json_decode((string) $message->media_json, true);
        $this->assertSame(['IMAGE', 'Así se ve el 12A', 'image/png', 'lote 12A.png', 'SENT'], [$message->message_type, $message->text_body, $media['mime'], $media['name'], $message->delivery_status]);
        $this->assertSame("tenants/{$f['tenant']->id}/conversations/{$f['id']}/".hash('sha256', $png).'.png', $media['path']);
        Storage::disk('local')->assertExists($media['path']);

        // The inbox gets an authorized URL, never the storage path.
        $url = $this->actingAs($f['advisor'])->withHeaders($this->tenantHeaders($f['tenant']))->getJson("/api/v1/admin/conversations/{$f['conversation']}/messages")
            ->assertOk()->assertJsonPath('data.1.media.kind', 'IMAGE')->assertJsonMissing(['path' => $media['path']])->json('data.1.media.url');
        $this->get($url)->assertOk()->assertHeader('Content-Type', 'image/png')->assertHeader('X-Content-Type-Options', 'nosniff');

        // The visitor sees it in their own conversation.
        $this->flushHeaders();
        $publicUrl = $this->withToken($f['token'])->getJson('/api/v1/public/chat/messages')->assertOk()->json('data.1.media.url');
        $this->assertSame('/api/v1/public/chat/media/2', $publicUrl);
        $this->withToken($f['token'])->get($publicUrl)->assertOk()->assertHeader('Content-Type', 'image/png');
        $this->assertSame($png, $this->withToken($f['token'])->get($publicUrl)->streamedContent());

        // Another visitor (their sequence 2 is their own text) and another tenant get nothing.
        $this->withToken($otherVisitor)->get('/api/v1/public/chat/media/2')->assertNotFound();
        $this->flushHeaders();
        $this->actingAs($this->user($otherTenant, RoleCode::TENANT_ADMIN))->withHeaders($this->tenantHeaders($otherTenant))
            ->get($url)->assertNotFound();
    }

    public function test_a_pdf_downloads_and_retries_are_idempotent(): void
    {
        $f = $this->inControl();
        $pdf = $this->file('Plano 12A.pdf', self::PDF);

        $this->attach($f['advisor'], $f['tenant'], $f['conversation'], $pdf)->assertStatus(202);
        $this->attach($f['advisor'], $f['tenant'], $f['conversation'], $this->file('Plano 12A.pdf', self::PDF))->assertOk()->assertJsonPath('data.replayed', true);
        $this->attach($f['advisor'], $f['tenant'], $f['conversation'], $this->file('otro.pdf', self::PDF."%otro\n"))->assertStatus(409)->assertJsonPath('error.code', 'IDEMPOTENCY_CONFLICT');

        $this->assertSame(1, DB::table('messages')->where('conversation_id', $f['id'])->where('message_type', 'DOCUMENT')->count());
        $this->assertCount(1, Storage::disk('local')->allFiles(), 'the refused upload leaves no orphan file');
        $this->actingAs($f['advisor'])->withHeaders($this->tenantHeaders($f['tenant']))->get("/api/v1/admin/conversations/{$f['conversation']}/media/2")
            ->assertOk()->assertHeader('Content-Type', 'application/pdf')->assertHeader('Content-Disposition', 'attachment; filename="Plano 12A.pdf"');
    }

    public function test_only_allowed_files_from_the_advisor_in_control_on_web_chat_are_stored(): void
    {
        $f = $this->inControl();
        $png = (string) base64_decode(self::PNG);

        $this->attach($f['advisor'], $f['tenant'], $f['conversation'], $this->file('foto.png', 'MZ not really an image'))->assertStatus(422)->assertJsonPath('error.code', 'MEDIA_NOT_ALLOWED');
        $this->attach($f['advisor'], $f['tenant'], $f['conversation'], $this->file('logo.svg', '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'))->assertStatus(422);
        $this->attach($this->user($f['tenant'], RoleCode::SALES_MANAGER), $f['tenant'], $f['conversation'], $this->file('foto.png', $png))
            ->assertStatus(409)->assertJsonPath('error.code', 'NOT_IN_CONTROL');
        $this->attach($this->user($f['tenant'], RoleCode::READ_ONLY), $f['tenant'], $f['conversation'], $this->file('foto.png', $png))->assertForbidden();
        DB::table('channel_accounts')->where('tenant_id', $f['tenant']->id)->update(['status' => 'PAUSED']);
        $this->attach($f['advisor'], $f['tenant'], $f['conversation'], $this->file('foto.png', $png))->assertStatus(409)->assertJsonPath('error.code', 'CHANNEL_INACTIVE'); // a paused channel keeps no file

        $this->assertSame([], Storage::disk('local')->allFiles(), 'nothing is stored for a send that cannot happen');
        $this->assertSame(0, DB::table('messages')->where('conversation_id', $f['id'])->where('direction', 'OUTBOUND')->count());
    }

    public function test_names_sizes_and_stored_paths_cannot_be_abused(): void
    {
        $f = $this->inControl();
        $png = (string) base64_decode(self::PNG);

        // The shown name always ends in the detected type, even with a fake extension or no ASCII at all.
        $this->attach($f['advisor'], $f['tenant'], $f['conversation'], $this->file('Plano.html', self::PDF))->assertStatus(202);
        $this->attach($f['advisor'], $f['tenant'], $f['conversation'], $this->file('📷', $png), 'attach-key-00000002')->assertStatus(202);
        $names = DB::table('messages')->where('conversation_id', $f['id'])->where('direction', 'OUTBOUND')->orderBy('sequence')
            ->pluck('media_json')->map(fn ($m) => json_decode((string) $m, true)['name'])->all();
        $this->assertSame(['Plano.pdf', '📷.png'], $names);
        $as = fn () => $this->actingAs($f['advisor'])->withHeaders($this->tenantHeaders($f['tenant']));
        $as()->get("/api/v1/admin/conversations/{$f['conversation']}/media/3")->assertOk()->assertHeader('Content-Type', 'image/png'); // no ASCII in the name: still a valid download

        // Over 10 MB is refused before anything is stored.
        $this->attach($f['advisor'], $f['tenant'], $f['conversation'], UploadedFile::fake()->create('grande.pdf', 10 * 1024 + 1, 'application/pdf'), 'attach-key-00000003')
            ->assertStatus(422);

        // A path pointing outside this conversation is never served, even if it were in the database.
        DB::table('messages')->where('conversation_id', $f['id'])->where('sequence', 2)
            ->update(['media_json' => DB::raw("JSON_SET(media_json, '$.path', 'tenants/{$f['tenant']->id}/conversations/999999/x.pdf')")]);
        $as()->get("/api/v1/admin/conversations/{$f['conversation']}/media/2")->assertNotFound();
        $as()->get("/api/v1/admin/conversations/{$f['conversation']}/media/1")->assertNotFound(); // the client's text: no file
    }
}
