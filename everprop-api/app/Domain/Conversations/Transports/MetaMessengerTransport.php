<?php

namespace App\Domain\Conversations\Transports;

use App\Domain\Conversations\Contracts\ChannelTransport;
use App\Domain\Conversations\Data\SendResult;
use App\Domain\Conversations\Exceptions\DeliveryAmbiguous;
use App\Domain\Integrations\Services\IntegrationTokens;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Support\Facades\Http;

/**
 * Meta Messenger Platform text send for both Facebook Messenger (FACEBOOK_MESSENGER) and
 * Instagram Direct (INSTAGRAM_DM). Uses POST {graph}/{version}/me/messages with the integration's
 * Page access token. Disabled unless META_SEND_ENABLED=true (or META_SEND_FAKE=true outside prod).
 */
final class MetaMessengerTransport implements ChannelTransport
{
    public function __construct(private readonly IntegrationTokens $tokens) {}

    public function send(array $channel, string $recipientProviderId, string $text, string $dispatchNonce, ?array $media = null, ?array $template = null): SendResult
    {
        if (($channel['status'] ?? null) !== 'ACTIVE') {
            return SendResult::rejected('CHANNEL_INACTIVE', false);
        }

        if ($media !== null) {
            return SendResult::rejected('MEDIA_UNSUPPORTED', false);
        }

        if ($template !== null) {
            return SendResult::rejected('TEMPLATE_NOT_APPROVED', false);
        }

        if (! app()->isProduction() && (bool) config('services.meta.send_fake')) {
            return SendResult::accepted('fake:'.$dispatchNonce);
        }

        if (! config('services.meta.send_enabled')) {
            return SendResult::rejected('CHANNEL_SEND_DISABLED', false);
        }

        $token = $this->tokens->forSending((int) $channel['tenant_id'], (int) $channel['integration_id']);
        if ($token === null) {
            return SendResult::rejected('CHANNEL_NOT_CONFIGURED', false);
        }

        $url = sprintf('https://graph.facebook.com/%s/me/messages', config('services.meta.graph_version'));

        try {
            $response = Http::withToken($token)
                ->timeout((int) config('services.meta.send_timeout_seconds', 10))
                ->post($url, [
                    'recipient' => ['id' => $recipientProviderId],
                    'messaging_type' => 'RESPONSE',
                    'message' => ['text' => $text],
                ]);
        } catch (ConnectionException $e) {
            throw new DeliveryAmbiguous('Meta Messenger send outcome unknown.', 0, $e);
        }

        if ($response->successful()) {
            $messageId = $response->json('message_id');

            return SendResult::accepted(is_string($messageId) && $messageId !== '' ? $messageId : null);
        }
        if ($response->status() >= 500) {
            throw new DeliveryAmbiguous('Meta Messenger returned '.$response->status().'.');
        }

        if ((int) $response->json('error.code') === 190) {
            $this->tokens->revoke((int) $channel['tenant_id'], (int) $channel['integration_id'], $token, 'META_TOKEN_REJECTED');

            return SendResult::rejected('META_TOKEN_REVOKED', false);
        }

        return SendResult::rejected('META_HTTP_'.$response->status(), $response->status() === 429);
    }
}
