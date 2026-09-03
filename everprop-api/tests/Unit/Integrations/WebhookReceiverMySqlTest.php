<?php

namespace Tests\Unit\Integrations;

use App\Domain\Integrations\Exceptions\WebhookRejected;
use App\Domain\Integrations\Jobs\ProcessWebhookReceipt;
use App\Domain\Integrations\Services\WebhookReceiver;
use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Queue;
use Illuminate\Support\Str;
use PHPUnit\Framework\Attributes\Group;
use Tests\TestCase;

#[Group('mysql')]
final class WebhookReceiverMySqlTest extends TestCase
{
    private const SECRET = 'webhook-receiver-integration-test-secret';

    private int $tenantId;

    private string $integrationPublicId;

    protected function setUp(): void
    {
        parent::setUp();

        Queue::fake();
        config()->set('services.webhooks.secrets', ['test-webhook-ref' => self::SECRET]);
        config()->set('services.webhooks.tolerance_seconds', 300);

        $this->tenantId = (int) DB::table('tenants')->insertGetId([
            'public_id' => (string) Str::uuid(),
            'name' => 'Webhook integration test',
            'slug' => 'webhook-test-'.strtolower(Str::random(12)),
            'timezone' => 'UTC',
            'status' => 'ACTIVE',
        ]);
        $this->integrationPublicId = (string) Str::uuid();

        DB::table('integration_connections')->insert([
            'tenant_id' => $this->tenantId,
            'public_id' => $this->integrationPublicId,
            'provider' => 'CUSTOM',
            'name' => 'Test webhook',
            'status' => 'ACTIVE',
            'webhook_secret_ref' => 'test-webhook-ref',
        ]);
    }

    protected function tearDown(): void
    {
        if (isset($this->tenantId)) {
            foreach (['domain_outbox', 'webhook_events', 'webhook_receipts', 'integration_connections'] as $table) {
                DB::table($table)->where('tenant_id', $this->tenantId)->delete();
            }

            DB::table('tenants')->where('id', $this->tenantId)->delete();
        }

        parent::tearDown();
    }

    public function test_signed_receipt_is_persisted_before_processing_and_event_effects_are_deduplicated(): void
    {
        $payload = [
            'event_id' => 'provider-event-1',
            'event_type' => 'CONTACT_UPDATED',
            'occurred_at' => '2026-08-07T12:00:00+00:00',
            'object' => 'contact',
            'object_id' => 'provider-contact-1',
            'data' => ['status' => 'active'],
        ];
        $raw = json_encode($payload, JSON_THROW_ON_ERROR | JSON_UNESCAPED_SLASHES);
        $timestamp = (string) CarbonImmutable::now('UTC')->getTimestamp();
        $deliveryKey = 'provider-delivery-1';
        $receiver = $this->app->make(WebhookReceiver::class);

        $first = $receiver->receive(
            tenantId: $this->tenantId,
            integrationPublicId: $this->integrationPublicId,
            rawPayload: $raw,
            payload: $payload,
            timestamp: $timestamp,
            signature: $this->signature($timestamp, $deliveryKey, $raw),
            idempotencyKey: $deliveryKey,
            requestId: 'request-1',
            headers: ['content-type' => 'application/json'],
            remoteIp: '127.0.0.1',
        );

        self::assertFalse($first->replayed);
        self::assertSame('VERIFIED', $first->status);
        self::assertSame(1, DB::table('webhook_receipts')->where('tenant_id', $this->tenantId)->count());
        self::assertSame(0, DB::table('webhook_events')->where('tenant_id', $this->tenantId)->count());
        Queue::assertPushed(ProcessWebhookReceipt::class, 1);

        (new ProcessWebhookReceipt($first->receiptId))->handle();
        (new ProcessWebhookReceipt($first->receiptId))->handle();

        self::assertSame('PROCESSED', DB::table('webhook_receipts')->where('id', $first->receiptId)->value('processing_status'));
        self::assertSame(1, DB::table('webhook_events')->where('tenant_id', $this->tenantId)->count());
        self::assertSame(1, DB::table('domain_outbox')
            ->where('tenant_id', $this->tenantId)
            ->where('event_type', 'WEBHOOK_EVENT_RECEIVED')
            ->count());

        $replay = $receiver->receive(
            tenantId: $this->tenantId,
            integrationPublicId: $this->integrationPublicId,
            rawPayload: $raw,
            payload: $payload,
            timestamp: $timestamp,
            signature: $this->signature($timestamp, $deliveryKey, $raw),
            idempotencyKey: $deliveryKey,
            requestId: 'request-1',
            headers: ['content-type' => 'application/json'],
            remoteIp: '127.0.0.1',
        );

        self::assertTrue($replay->replayed);
        self::assertSame('PROCESSED', $replay->status);
        self::assertSame(1, DB::table('webhook_receipts')->where('tenant_id', $this->tenantId)->count());
        Queue::assertPushed(ProcessWebhookReceipt::class, 1);
    }

    public function test_same_delivery_key_with_different_signed_payload_is_rejected(): void
    {
        $receiver = $this->app->make(WebhookReceiver::class);
        $timestamp = (string) CarbonImmutable::now('UTC')->getTimestamp();
        $deliveryKey = 'provider-delivery-conflict';
        $firstPayload = ['event_id' => 'provider-event-2', 'value' => 1];
        $firstRaw = json_encode($firstPayload, JSON_THROW_ON_ERROR);

        $receiver->receive(
            $this->tenantId,
            $this->integrationPublicId,
            $firstRaw,
            $firstPayload,
            $timestamp,
            $this->signature($timestamp, $deliveryKey, $firstRaw),
            $deliveryKey,
            null,
            [],
            null,
        );

        $changedPayload = ['event_id' => 'provider-event-2', 'value' => 2];
        $changedRaw = json_encode($changedPayload, JSON_THROW_ON_ERROR);

        try {
            $receiver->receive(
                $this->tenantId,
                $this->integrationPublicId,
                $changedRaw,
                $changedPayload,
                $timestamp,
                $this->signature($timestamp, $deliveryKey, $changedRaw),
                $deliveryKey,
                null,
                [],
                null,
            );
            self::fail('A webhook idempotency conflict was expected.');
        } catch (WebhookRejected $exception) {
            self::assertSame('WEBHOOK_IDEMPOTENCY_CONFLICT', $exception->publicCode);
            self::assertSame(409, $exception->httpStatus);
            self::assertSame(1, DB::table('webhook_receipts')->where('tenant_id', $this->tenantId)->count());
        }
    }

    private function signature(string $timestamp, string $deliveryKey, string $rawPayload): string
    {
        return 'sha256='.hash_hmac(
            'sha256',
            $timestamp.'.'.$deliveryKey.'.'.$rawPayload,
            self::SECRET,
        );
    }
}
