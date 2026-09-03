<?php

namespace Tests\Feature\Integrations;

use App\Domain\Integrations\Jobs\ProcessWebhookReceipt;
use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Queue;
use Illuminate\Support\Str;
use Tests\TestCase;

final class WebhookEndpointTest extends TestCase
{
    private const SECRET = 'feature-webhook-test-secret';

    private int $tenantId;

    private string $tenantPublicId;

    private string $integrationPublicId;

    protected function setUp(): void
    {
        parent::setUp();

        Queue::fake();
        config()->set('services.webhooks.secrets', ['feature-test-ref' => self::SECRET]);
        config()->set('services.webhooks.tolerance_seconds', 300);
        $this->tenantPublicId = (string) Str::uuid();
        $this->tenantId = (int) DB::table('tenants')->insertGetId([
            'public_id' => $this->tenantPublicId,
            'name' => 'Webhook endpoint test',
            'slug' => 'webhook-endpoint-'.strtolower(Str::random(12)),
            'timezone' => 'UTC',
            'status' => 'ACTIVE',
        ]);
        $this->integrationPublicId = (string) Str::uuid();
        DB::table('integration_connections')->insert([
            'tenant_id' => $this->tenantId,
            'public_id' => $this->integrationPublicId,
            'provider' => 'CUSTOM',
            'name' => 'Feature webhook',
            'status' => 'ACTIVE',
            'webhook_secret_ref' => 'feature-test-ref',
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

    public function test_signed_webhook_is_persisted_and_replay_is_idempotent(): void
    {
        $payload = ['event_id' => 'feature-event-1', 'event_type' => 'CONTACT_UPDATED'];
        $raw = json_encode($payload, JSON_THROW_ON_ERROR);
        $timestamp = (string) CarbonImmutable::now('UTC')->getTimestamp();
        $deliveryKey = 'feature-delivery-1';
        $headers = [
            'X-Everprop-Tenant' => $this->tenantPublicId,
            'X-Everprop-Timestamp' => $timestamp,
            'X-Everprop-Signature' => $this->signature($timestamp, $deliveryKey, $raw),
            'X-Webhook-Idempotency-Key' => $deliveryKey,
        ];

        $this->withHeaders($headers)
            ->postJson('/api/v1/webhooks/'.$this->integrationPublicId, $payload)
            ->assertAccepted()
            ->assertJsonPath('data.idempotent_replay', false);

        $this->withHeaders($headers)
            ->postJson('/api/v1/webhooks/'.$this->integrationPublicId, $payload)
            ->assertOk()
            ->assertJsonPath('data.idempotent_replay', true);

        self::assertSame(1, DB::table('webhook_receipts')->where('tenant_id', $this->tenantId)->count());
        Queue::assertPushed(ProcessWebhookReceipt::class, 1);
    }

    public function test_invalid_signature_and_cross_tenant_integration_are_not_accepted(): void
    {
        $payload = ['event_id' => 'feature-event-2'];
        $timestamp = (string) CarbonImmutable::now('UTC')->getTimestamp();
        $deliveryKey = 'feature-delivery-2';

        $this->withHeaders([
            'X-Everprop-Tenant' => $this->tenantPublicId,
            'X-Everprop-Timestamp' => $timestamp,
            'X-Everprop-Signature' => 'sha256='.str_repeat('0', 64),
            'X-Webhook-Idempotency-Key' => $deliveryKey,
        ])->postJson('/api/v1/webhooks/'.$this->integrationPublicId, $payload)
            ->assertUnauthorized();

        $otherTenantPublicId = (string) Str::uuid();
        $otherTenantId = (int) DB::table('tenants')->insertGetId([
            'public_id' => $otherTenantPublicId,
            'name' => 'Other webhook tenant',
            'slug' => 'other-webhook-'.strtolower(Str::random(12)),
            'timezone' => 'UTC',
            'status' => 'ACTIVE',
        ]);

        try {
            $raw = json_encode($payload, JSON_THROW_ON_ERROR);
            $this->withHeaders([
                'X-Everprop-Tenant' => $otherTenantPublicId,
                'X-Everprop-Timestamp' => $timestamp,
                'X-Everprop-Signature' => $this->signature($timestamp, $deliveryKey, $raw),
                'X-Webhook-Idempotency-Key' => $deliveryKey,
            ])->postJson('/api/v1/webhooks/'.$this->integrationPublicId, $payload)
                ->assertNotFound();
        } finally {
            DB::table('tenants')->where('id', $otherTenantId)->delete();
        }
    }

    private function signature(string $timestamp, string $deliveryKey, string $rawPayload): string
    {
        return 'sha256='.hash_hmac('sha256', $timestamp.'.'.$deliveryKey.'.'.$rawPayload, self::SECRET);
    }
}
