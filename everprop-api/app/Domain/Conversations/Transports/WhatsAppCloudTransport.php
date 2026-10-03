<?php

namespace App\Domain\Conversations\Transports;

use App\Domain\Conversations\Contracts\ChannelTransport;
use App\Domain\Conversations\Data\SendResult;
use App\Domain\Conversations\Exceptions\DeliveryAmbiguous;
use App\Domain\Integrations\Services\IntegrationTokens;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Support\Facades\Http;

/**
 * WhatsApp Cloud API text send. Disabled unless META_SEND_ENABLED=true (gate X04: no real sends
 * without explicit authorization). The 24h service-window / template rules are enforced by
 * ChannelPolicy before a job is created (S06 follow-up), not here.
 *
 * Endpoint shape: POST {graph}/{version}/{phone_number_id}/messages with a Bearer token of the
 * tenant's integration. Unverified here against a live account; covered only with Http::fake().
 */
final class WhatsAppCloudTransport implements ChannelTransport
{
    public function __construct(private readonly IntegrationTokens $tokens) {}

    public function send(array $channel, string $recipientProviderId, string $text, string $dispatchNonce): SendResult
    {
        if (! config('services.meta.send_enabled')) {
            return SendResult::rejected('CHANNEL_SEND_DISABLED', false);
        }

        // A paused or disconnected number never sends, even if its integration is still ACTIVE.
        if (($channel['status'] ?? null) !== 'ACTIVE') {
            return SendResult::rejected('CHANNEL_INACTIVE', false);
        }

        $token = $this->tokens->forSending((int) $channel['tenant_id'], (int) $channel['integration_id']);
        if ($token === null) {
            return SendResult::rejected('CHANNEL_NOT_CONFIGURED', false);
        }

        $url = sprintf('https://graph.facebook.com/%s/%s/messages', config('services.meta.graph_version'), rawurlencode((string) $channel['provider_account_id']));

        try {
            $response = Http::withToken($token)->timeout((int) config('services.meta.send_timeout_seconds', 10))->post($url, [
                'messaging_product' => 'whatsapp',
                'recipient_type' => 'individual',
                'to' => $recipientProviderId,
                'type' => 'text',
                'text' => ['preview_url' => false, 'body' => $text],
            ]);
        } catch (ConnectionException $e) {
            // The request may have reached Meta before the connection dropped.
            throw new DeliveryAmbiguous('WhatsApp send outcome unknown.', 0, $e);
        }

        if ($response->successful()) {
            return SendResult::accepted($response->json('messages.0.id'));
        }
        if ($response->status() >= 500) {
            throw new DeliveryAmbiguous('WhatsApp returned '.$response->status().'.');
        }

        // 4xx: rejected before acceptance. 429 is retryable; auth errors are not.
        return SendResult::rejected('META_HTTP_'.$response->status(), $response->status() === 429);
    }
}
