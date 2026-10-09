<?php

namespace App\Domain\Conversations\Contracts;

use App\Domain\Conversations\Data\SendResult;

interface ChannelTransport
{
    /**
     * Deliver one outbound text. Must throw DeliveryAmbiguous when the provider may have accepted
     * the message but the outcome is unknown (timeout, connection reset after write): the
     * dispatcher then marks UNKNOWN and never retries blindly.
     *
     * @param  array<string, mixed>  $channel  channel_accounts row (provider ids, metadata)
     */
    public function send(array $channel, string $recipientProviderId, string $text, string $dispatchNonce): SendResult;
}
