<?php

namespace App\Domain\Conversations\Transports;

use App\Domain\Conversations\Contracts\ChannelTransport;
use InvalidArgumentException;

/** Registered as a singleton; use() lets tests and sandboxes swap a channel transport. */
final class TransportRegistry
{
    /** @var array<string, ChannelTransport> */
    private array $overrides = [];

    public function __construct(
        private readonly WebChatTransport $web,
        private readonly WhatsAppCloudTransport $whatsapp,
        private readonly MetaMessengerTransport $messenger,
    ) {}

    public function use(string $channelType, ChannelTransport $transport): void
    {
        $this->overrides[$channelType] = $transport;
    }

    public function for(string $channelType): ChannelTransport
    {
        return $this->overrides[$channelType] ?? match ($channelType) {
            'WEB_CHAT' => $this->web,
            'WHATSAPP' => $this->whatsapp,
            'INSTAGRAM_DM', 'FACEBOOK_MESSENGER' => $this->messenger,
            default => throw new InvalidArgumentException("No transport for channel {$channelType}."),
        };
    }
}
