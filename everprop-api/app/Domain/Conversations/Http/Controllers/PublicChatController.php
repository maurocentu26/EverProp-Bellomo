<?php

namespace App\Domain\Conversations\Http\Controllers;

use App\Domain\Conversations\Data\InboundMessage;
use App\Domain\Conversations\Services\ConversationAttachments;
use App\Domain\Conversations\Services\InboundMessageService;
use App\Domain\CRM\Services\ContactIdentityResolver;
use App\Domain\Tenancy\TenantContext;
use App\Http\Controllers\Controller;
use Carbon\CarbonImmutable;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Symfony\Component\HttpFoundation\StreamedResponse;

/**
 * Anonymous web chat (S05). The tenant is the one resolved by the trusted host middleware; the
 * widget id must be a WEB_CHAT channel of that tenant. The visitor gets an opaque bearer token
 * scoped to ONE conversation; only its SHA-256 is stored. A session never grants CRM rights.
 */
final class PublicChatController extends Controller
{
    // Resolved per call: controllers are cached on the route, the tenant context is per request.
    private function tenantId(): int
    {
        return app(TenantContext::class)->id();
    }

    public function start(Request $request, ContactIdentityResolver $contacts): JsonResponse
    {
        $data = $request->validate(['widget_id' => 'required|uuid']);
        $tenantId = $this->tenantId();
        $channel = DB::table('channel_accounts')->where('tenant_id', $tenantId)->where('public_id', $data['widget_id'])
            ->where('channel_type', 'WEB_CHAT')->where('status', 'ACTIVE')->first(['id', 'metadata_json']);
        abort_unless($channel !== null, 404);
        $this->assertAllowedOrigin($request, $channel->metadata_json);

        $sessionId = (string) Str::uuid();
        $token = rtrim(strtr(base64_encode(random_bytes(32)), '+/', '-_'), '=');
        $now = CarbonImmutable::now('UTC');
        $visitor = 'visitor:'.$sessionId;
        $contact = $contacts->resolve($tenantId, [], ['channel_type' => 'WEB_CHAT', 'provider_user_id' => $visitor], $now);

        DB::transaction(function () use ($tenantId, $channel, $sessionId, $token, $now, $contact, $request): void {
            $conversationId = (int) DB::table('conversations')->insertGetId([
                'tenant_id' => $tenantId, 'public_id' => (string) Str::uuid(), 'contact_id' => $contact['id'],
                'channel_account_id' => $channel->id, 'provider_thread_id' => 'web:'.$sessionId, 'status' => 'OPEN',
                'bot_mode' => InboundMessageService::aiEnabled() ? 'BOT_FIRST' : 'HUMAN_FIRST',
                'control_state' => InboundMessageService::aiEnabled() ? 'AI_ACTIVE' : 'WAITING_HUMAN',
                'last_activity_at' => $now->format('Y-m-d H:i:s.v'),
            ]);
            DB::table('public_chat_sessions')->insert([
                'tenant_id' => $tenantId, 'public_id' => $sessionId, 'channel_account_id' => $channel->id,
                'conversation_id' => $conversationId, 'token_sha256' => hash('sha256', $token, true),
                'origin' => mb_substr((string) $request->headers->get('Origin', ''), 0, 255) ?: null,
                'expires_at' => $now->addHours((int) config('conversations.web_session_ttl_hours', 24))->format('Y-m-d H:i:s.v'),
            ]);
        });

        return response()->json(['data' => ['session_id' => $sessionId, 'token' => $token]], 201);
    }

    public function send(Request $request, InboundMessageService $inbound): JsonResponse
    {
        $session = $this->session($request);
        $this->assertAllowedOrigin($request, DB::table('channel_accounts')->where('tenant_id', $session->tenant_id)
            ->where('id', $session->channel_account_id)->value('metadata_json'));
        $data = $request->validate([
            'client_message_id' => 'required|uuid',
            'text' => 'required|string|max:'.(int) config('conversations.web_message_max_chars', 2000),
        ]);

        $result = $inbound->accept(new InboundMessage(
            tenantId: (int) $session->tenant_id,
            channelAccountId: (int) $session->channel_account_id,
            identityChannelType: 'WEB_CHAT',
            senderProviderId: 'visitor:'.$session->public_id,
            threadId: 'web:'.$session->public_id,
            providerMessageId: 'web:'.$session->public_id.':'.$data['client_message_id'],
            type: 'TEXT',
            text: $data['text'],
            occurredAt: CarbonImmutable::now('UTC'),
        ));

        return response()->json(['data' => ['sequence' => $result['sequence'], 'replayed' => $result['replayed']]], $result['replayed'] ? 200 : 201);
    }

    public function messages(Request $request): JsonResponse
    {
        $session = $this->session($request);
        $after = max(0, (int) $request->query('after', 0));

        $rows = DB::table('messages')->where('tenant_id', $session->tenant_id)->where('conversation_id', $session->conversation_id)
            ->where('sequence', '>', $after)
            ->where(fn ($q) => $q->where('direction', 'INBOUND')
                ->orWhere(fn ($o) => $o->where('direction', 'OUTBOUND')->whereIn('delivery_status', ['SENT', 'DELIVERED', 'READ'])))
            ->orderBy('sequence')->limit(100)->get(['sequence', 'direction', 'sender_type', 'text_body', 'occurred_at', 'media_json']);

        // Hold the cursor behind the first reply that may still become visible (queued / in flight),
        // otherwise a later visitor message would move the cursor past it and it would never show.
        $pending = DB::table('messages')->where('tenant_id', $session->tenant_id)->where('conversation_id', $session->conversation_id)
            ->where('sequence', '>', $after)->where('direction', 'OUTBOUND')->whereIn('delivery_status', ['QUEUED', 'UNKNOWN'])
            ->min('sequence');
        $nextAfter = $pending !== null ? (int) $pending - 1 : max($after, (int) ($rows->last()->sequence ?? 0));

        return response()->json(['next_after' => $nextAfter, 'data' => $rows->map(fn ($m) => [
            'sequence' => (int) $m->sequence,
            'from' => $m->direction === 'INBOUND' ? 'visitor' : ($m->sender_type === 'USER' ? 'advisor' : 'assistant'),
            'text' => $m->text_body,
            'at' => CarbonImmutable::parse($m->occurred_at, 'UTC')->toISOString(),
            'media' => ConversationAttachments::present($m->media_json, '/api/v1/public/chat/media/'.$m->sequence),
        ])->all()]);
    }

    /** A file the visitor was sent in their own conversation (the bearer token decides which one). */
    public function media(Request $request, int $sequence, ConversationAttachments $attachments): StreamedResponse
    {
        $session = $this->session($request);
        $media = DB::table('messages')->where('tenant_id', $session->tenant_id)->where('conversation_id', $session->conversation_id)
            ->where('sequence', $sequence)->where('direction', 'OUTBOUND')->whereIn('delivery_status', ['SENT', 'DELIVERED', 'READ'])->value('media_json');
        abort_if($media === null, 404);

        return $attachments->stream((int) $session->tenant_id, (int) $session->conversation_id, (array) json_decode((string) $media, true));
    }

    /** Widgets only work from origins the tenant configured (channel metadata allowed_origins). */
    private function assertAllowedOrigin(Request $request, ?string $metadataJson): void
    {
        $allowed = json_decode((string) $metadataJson, true)['allowed_origins'] ?? [];
        abort_unless(is_array($allowed) && in_array($request->headers->get('Origin'), $allowed, true), 403);
    }

    private function session(Request $request): object
    {
        $token = (string) $request->bearerToken();
        $session = $token === '' ? null : DB::table('public_chat_sessions')
            ->where('token_sha256', hash('sha256', $token, true))
            ->where('tenant_id', $this->tenantId())
            ->whereNull('revoked_at')->where('expires_at', '>', now())
            ->first(['tenant_id', 'public_id', 'channel_account_id', 'conversation_id']);
        abort_unless($session !== null, 401);

        return $session;
    }
}
