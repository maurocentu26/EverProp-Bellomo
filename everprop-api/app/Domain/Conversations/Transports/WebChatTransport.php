<?php

namespace App\Domain\Conversations\Transports;

use App\Domain\Conversations\Contracts\ChannelTransport;
use App\Domain\Conversations\Data\SendResult;

/** The widget reads persisted messages (polling/SSE), so "sending" is making the message visible. */
final class WebChatTransport implements ChannelTransport
{
    public function send(array $channel, string $recipientProviderId, string $text, string $dispatchNonce, ?array $media = null): SendResult
    {
        return SendResult::accepted(null);
    }
}
