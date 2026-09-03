<?php

namespace Tests\Unit\Integrations;

use App\Domain\Integrations\Exceptions\WebhookRejected;
use App\Domain\Integrations\Security\WebhookSignatureVerifier;
use Carbon\CarbonImmutable;
use PHPUnit\Framework\TestCase;

final class WebhookSignatureVerifierTest extends TestCase
{
    private const NOW = 1_800_000_000;

    private const SECRET = 'unit-test-secret-not-used-outside-this-test';

    public function test_valid_signature_is_accepted(): void
    {
        self::expectNotToPerformAssertions();

        $payload = '{"event_id":"evt-1"}';
        $delivery = 'delivery-123';
        $timestamp = (string) self::NOW;

        (new WebhookSignatureVerifier)->verify(
            rawPayload: $payload,
            timestamp: $timestamp,
            idempotencyKey: $delivery,
            providedSignature: $this->signature($timestamp, $delivery, $payload),
            secret: self::SECRET,
            toleranceSeconds: 300,
            now: CarbonImmutable::createFromTimestampUTC(self::NOW),
        );

    }

    public function test_payload_tampering_is_rejected(): void
    {
        $timestamp = (string) self::NOW;
        $signature = $this->signature($timestamp, 'delivery-123', '{"value":1}');

        $this->expectException(WebhookRejected::class);

        (new WebhookSignatureVerifier)->verify(
            rawPayload: '{"value":2}',
            timestamp: $timestamp,
            idempotencyKey: 'delivery-123',
            providedSignature: $signature,
            secret: self::SECRET,
            toleranceSeconds: 300,
            now: CarbonImmutable::createFromTimestampUTC(self::NOW),
        );
    }

    public function test_delivery_key_is_covered_by_the_signature(): void
    {
        $timestamp = (string) self::NOW;
        $payload = '{"event_id":"evt-1"}';
        $signature = $this->signature($timestamp, 'delivery-original', $payload);

        $this->expectException(WebhookRejected::class);

        (new WebhookSignatureVerifier)->verify(
            rawPayload: $payload,
            timestamp: $timestamp,
            idempotencyKey: 'delivery-replayed',
            providedSignature: $signature,
            secret: self::SECRET,
            toleranceSeconds: 300,
            now: CarbonImmutable::createFromTimestampUTC(self::NOW),
        );
    }

    public function test_timestamp_outside_tolerance_is_rejected(): void
    {
        $timestamp = (string) (self::NOW - 301);
        $payload = '{}';

        $this->expectException(WebhookRejected::class);

        (new WebhookSignatureVerifier)->verify(
            rawPayload: $payload,
            timestamp: $timestamp,
            idempotencyKey: 'delivery-123',
            providedSignature: $this->signature($timestamp, 'delivery-123', $payload),
            secret: self::SECRET,
            toleranceSeconds: 300,
            now: CarbonImmutable::createFromTimestampUTC(self::NOW),
        );
    }

    private function signature(string $timestamp, string $delivery, string $payload): string
    {
        return 'sha256='.hash_hmac('sha256', $timestamp.'.'.$delivery.'.'.$payload, self::SECRET);
    }
}
