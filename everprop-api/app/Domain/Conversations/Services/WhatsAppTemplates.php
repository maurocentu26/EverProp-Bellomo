<?php

namespace App\Domain\Conversations\Services;

use App\Domain\Integrations\Services\IntegrationTokens;
use Carbon\CarbonImmutable;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;

/**
 * Approved WhatsApp templates of a number (Fase 4): the only way to write to a client after the 24 h service
 * window. Created and approved in WhatsApp Manager; here they are synced from Meta into the channel metadata
 * (`approved_templates` is what ChannelPolicy enforces) and rendered for the inbox. Only templates whose
 * variables are all in the body are offered: header media or button variables would need more inputs.
 * Unverified against a live account; covered with Http::fake().
 */
final class WhatsAppTemplates
{
    private const STALE_MINUTES = 60;

    public function __construct(private readonly IntegrationTokens $tokens) {}

    /**
     * Templates of the channel, refreshed from Meta when stale; the cached list if Meta cannot be reached.
     *
     * @return list<array{name: string, language: string, category: string, body: string, params: int}>
     */
    public function forChannel(int $tenantId, int $channelId): array
    {
        $channel = DB::table('channel_accounts')->where('tenant_id', $tenantId)->where('id', $channelId)->where('channel_type', 'WHATSAPP')->first();
        if ($channel === null) {
            return [];
        }
        $metadata = json_decode((string) $channel->metadata_json, true) ?: [];
        $synced = isset($metadata['templates_synced_at']) ? CarbonImmutable::parse($metadata['templates_synced_at']) : null;
        if ($synced === null || $synced->lessThan(now()->subMinutes(self::STALE_MINUTES))) {
            $metadata = $this->sync($tenantId, (array) $channel, $metadata) ?? $metadata;
        }

        return array_values(array_filter((array) ($metadata['templates'] ?? []), 'is_array'));
    }

    /**
     * @param  array<string, mixed>  $channel
     * @param  array<string, mixed>  $metadata
     * @return array<string, mixed>|null the new metadata, null if Meta did not answer
     */
    private function sync(int $tenantId, array $channel, array $metadata): ?array
    {
        $token = $this->tokens->forSending($tenantId, (int) $channel['integration_id']);
        $waba = (string) ($metadata['waba_id'] ?? '');
        if ($token === null || preg_match('/\A[0-9]{1,30}\z/', $waba) !== 1) {
            return null;
        }
        try {
            $response = Http::withToken($token)->timeout(10)->get(sprintf('https://graph.facebook.com/%s/%s/message_templates', config('services.meta.graph_version'), $waba),
                ['status' => 'APPROVED', 'fields' => 'name,language,status,category,components', 'limit' => 100]);
        } catch (ConnectionException) {
            return null;
        }
        if (! $response->successful()) {
            return null;
        }
        $templates = [];
        foreach ((array) $response->json('data', []) as $t) {
            if (! is_array($t) || ($t['status'] ?? null) !== 'APPROVED' || ! is_string($t['name'] ?? null) || ! is_string($t['language'] ?? null)) {
                continue;
            }
            $body = null;
            $extraVariables = false;
            foreach ((array) ($t['components'] ?? []) as $c) {
                $type = strtoupper((string) ($c['type'] ?? ''));
                if ($type === 'BODY') {
                    $body = (string) ($c['text'] ?? '');
                } elseif (($type === 'HEADER' && ($c['format'] ?? 'TEXT') !== 'TEXT') || str_contains(json_encode($c) ?: '', '{{')) {
                    $extraVariables = true;
                }
            }
            if ($body === null || $body === '' || $extraVariables) {
                continue;
            }
            preg_match_all('/\{\{(\d+)\}\}/', $body, $m);
            $templates[] = ['name' => mb_substr($t['name'], 0, 512), 'language' => mb_substr($t['language'], 0, 15),
                'category' => (string) ($t['category'] ?? ''), 'body' => mb_substr($body, 0, 1024), 'params' => $m[1] === [] ? 0 : max(array_map('intval', $m[1]))];
        }
        $metadata['templates'] = $templates;
        $metadata['approved_templates'] = array_values(array_unique(array_column($templates, 'name')));
        $metadata['templates_synced_at'] = now()->toIso8601String();
        DB::table('channel_accounts')->where('tenant_id', $tenantId)->where('id', $channel['id'])
            ->update(['metadata_json' => json_encode($metadata, JSON_THROW_ON_ERROR | JSON_UNESCAPED_UNICODE)]);

        return $metadata;
    }

    /** @param list<string> $params */
    public static function render(string $body, array $params): string
    {
        return (string) preg_replace_callback('/\{\{(\d+)\}\}/', fn (array $m): string => $params[(int) $m[1] - 1] ?? $m[0], $body);
    }
}
