<?php

namespace App\Domain\Conversations\Services;

use App\Domain\Integrations\Services\IntegrationTokens;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

/**
 * A photo or PDF the client sent by WhatsApp, fetched from Meta the first time an advisor opens it (Fase 4).
 * Meta answers the media id with a short-lived URL that needs the same token. The bytes go through the same
 * checks as an advisor upload (type by content, size) and are kept private; other types are never stored.
 * Unverified against a live account; covered with Http::fake().
 */
final class WhatsAppMediaFetcher
{
    public function __construct(private readonly IntegrationTokens $tokens, private readonly ConversationAttachments $attachments) {}

    /**
     * @param  array<string, mixed>  $media
     * @return array<string, mixed>|null the stored media (also saved on the message), null if it cannot be shown
     */
    public function fetch(int $tenantId, int $conversationId, int $channelAccountId, int $messageId, array $media): ?array
    {
        $integration = DB::table('channel_accounts')->where('tenant_id', $tenantId)->where('id', $channelAccountId)->where('channel_type', 'WHATSAPP')->value('integration_id');
        $token = $integration === null ? null : $this->tokens->forSending($tenantId, (int) $integration);
        if ($token === null || ! preg_match('/\A[0-9A-Za-z_-]{1,64}\z/', (string) $media['provider_media_id'])) {
            return null;
        }
        try {
            $info = Http::withToken($token)->timeout(10)->get(sprintf('https://graph.facebook.com/%s/%s', config('services.meta.graph_version'), $media['provider_media_id']));
            $url = $info->json('url');
            // Only Meta's own CDN: a tampered answer must not make us fetch an arbitrary host with the token.
            if (! $info->successful() || ! is_string($url) || ! preg_match('#\Ahttps://[a-z0-9.-]+\.(fbsbx|facebook|whatsapp)\.(com|net)/#i', $url)) {
                return null;
            }
            $file = Http::withToken($token)->timeout(30)->withOptions(['allow_redirects' => false])->get($url);
        } catch (ConnectionException) {
            return null;
        }
        if (! $file->successful() || strlen($file->body()) > ConversationAttachments::MAX_BYTES) {
            Log::warning('whatsapp.media.fetch_failed', ['status' => $file->status()]);

            return null;
        }
        $stored = $this->attachments->storeBytes($tenantId, $conversationId, $file->body(), (string) ($media['name'] ?? ($media['kind'] === 'IMAGE' ? 'foto' : 'documento')));
        if ($stored === null) {
            return null; // video, audio, sticker or a disallowed type: shown as "not available"
        }
        $stored['provider_media_id'] = $media['provider_media_id'];
        DB::table('messages')->where('tenant_id', $tenantId)->where('id', $messageId)->update(['media_json' => json_encode($stored, JSON_THROW_ON_ERROR | JSON_UNESCAPED_UNICODE)]);

        return $stored;
    }
}
