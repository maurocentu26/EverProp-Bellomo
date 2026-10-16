<?php

namespace App\Domain\Conversations\Data;

use Carbon\CarbonImmutable;

/** Channel-agnostic inbound message. Built only by adapters after the channel was verified. */
final readonly class InboundMessage
{
    /**
     * @param  array<string, mixed>  $metadata
     * @param  array<string, string>|null  $media
     */
    public function __construct(
        public int $tenantId,
        public int $channelAccountId,
        public string $identityChannelType,
        public string $senderProviderId,
        public string $threadId,
        public ?string $providerMessageId,
        public string $type,
        public ?string $text,
        public CarbonImmutable $occurredAt,
        public ?string $senderDisplayName = null,
        public ?string $senderPhoneE164 = null,
        public array $metadata = [],
        /** Provider-side attachment reference (WhatsApp media id, MIME, file name); the bytes are fetched on first view. */
        public ?array $media = null,
    ) {}
}
