<?php

namespace App\Domain\Integrations\Services;

use App\Domain\Integrations\Data\WebhookReceiptAcceptance;
use App\Domain\Integrations\Exceptions\WebhookRejected;
use App\Domain\Integrations\Jobs\ProcessWebhookReceipt;
use App\Domain\Integrations\Security\WebhookSignatureVerifier;
use Carbon\CarbonImmutable;
use Illuminate\Database\QueryException;
use Illuminate\Support\Facades\DB;
use JsonException;

final readonly class WebhookReceiver
{
    public function __construct(
        private ConfigWebhookSecretResolver $secrets,
        private WebhookSignatureVerifier $signatures,
    ) {}

    /**
     * @param  array<string, mixed>  $payload
     * @param  array<string, string>  $headers
     *
     * @throws JsonException
     */
    public function receive(
        int $tenantId,
        string $integrationPublicId,
        string $rawPayload,
        array $payload,
        string $timestamp,
        string $signature,
        string $idempotencyKey,
        ?string $requestId,
        array $headers,
        ?string $remoteIp,
    ): WebhookReceiptAcceptance {
        $integration = DB::table('integration_connections')
            ->where('tenant_id', $tenantId)
            ->where('public_id', $integrationPublicId)
            ->where('status', 'ACTIVE')
            ->first(['id', 'tenant_id', 'provider', 'webhook_secret_ref']);

        if ($integration === null) {
            throw new WebhookRejected('WEBHOOK_NOT_FOUND', 404, 'The webhook endpoint was not found.');
        }

        $secretReference = (string) ($integration->webhook_secret_ref ?? '');
        $secret = $this->secrets->resolve($secretReference);

        if ($secret === null) {
            throw new WebhookRejected('WEBHOOK_UNAVAILABLE', 503, 'The webhook endpoint is not configured.');
        }

        $this->signatures->verify(
            rawPayload: $rawPayload,
            timestamp: $timestamp,
            idempotencyKey: $idempotencyKey,
            providedSignature: $signature,
            secret: $secret,
            toleranceSeconds: (int) config('services.webhooks.tolerance_seconds', 300),
        );

        $payloadHash = hash('sha256', $rawPayload, true);
        $existing = $this->findReceipt((int) $integration->id, $idempotencyKey);

        if ($existing !== null) {
            return $this->acceptExisting($existing, $payloadHash);
        }

        $receivedAt = CarbonImmutable::now('UTC');

        try {
            $receiptId = (int) DB::table('webhook_receipts')->insertGetId([
                'tenant_id' => $tenantId,
                'integration_id' => $integration->id,
                'request_id' => $requestId,
                'idempotency_key' => $idempotencyKey,
                'provider' => $integration->provider,
                'provider_object' => $this->boundedScalar($payload['object'] ?? null, 80),
                'provider_object_id' => $this->boundedScalar($payload['object_id'] ?? null, 191),
                'signature_algorithm' => 'HMAC-SHA256',
                'signature_valid' => 1,
                'payload_sha256' => $payloadHash,
                'remote_ip' => $this->packedIp($remoteIp),
                'headers_json' => json_encode($headers, JSON_THROW_ON_ERROR | JSON_UNESCAPED_SLASHES),
                'raw_payload' => $rawPayload,
                'processing_status' => 'VERIFIED',
                'received_at' => $receivedAt->format('Y-m-d H:i:s.v'),
                'expires_at' => $receivedAt
                    ->addDays(max(1, (int) config('services.webhooks.retention_days', 30)))
                    ->format('Y-m-d H:i:s.v'),
            ]);
        } catch (QueryException $exception) {
            if (! $this->isDuplicateKey($exception)) {
                throw $exception;
            }

            $existing = $this->findReceipt((int) $integration->id, $idempotencyKey);

            if ($existing === null) {
                throw $exception;
            }

            return $this->acceptExisting($existing, $payloadHash);
        }

        // The durable receipt exists before queue dispatch. If dispatch fails,
        // the provider can safely retry the same signed delivery.
        $this->dispatchReceipt($receiptId);

        return new WebhookReceiptAcceptance($receiptId, 'VERIFIED', false);
    }

    private function findReceipt(int $integrationId, string $idempotencyKey): ?object
    {
        return DB::table('webhook_receipts')
            ->where('integration_id', $integrationId)
            ->where('idempotency_key', $idempotencyKey)
            ->first(['id', 'payload_sha256', 'processing_status']);
    }

    private function acceptExisting(object $receipt, string $payloadHash): WebhookReceiptAcceptance
    {
        if (! is_string($receipt->payload_sha256) || ! hash_equals($receipt->payload_sha256, $payloadHash)) {
            throw new WebhookRejected(
                'WEBHOOK_IDEMPOTENCY_CONFLICT',
                409,
                'The delivery key was already used with a different payload.',
            );
        }

        $status = (string) $receipt->processing_status;

        if (in_array($status, ['RECEIVED', 'VERIFIED', 'RETRY'], true)) {
            $this->dispatchReceipt((int) $receipt->id);
        }

        return new WebhookReceiptAcceptance((int) $receipt->id, $status, true);
    }

    private function dispatchReceipt(int $receiptId): void
    {
        ProcessWebhookReceipt::dispatch($receiptId)
            ->onQueue((string) config('services.webhooks.queue', 'default'));
    }

    private function packedIp(?string $ip): ?string
    {
        if ($ip === null) {
            return null;
        }

        $packed = @inet_pton($ip);

        return $packed === false ? null : $packed;
    }

    private function boundedScalar(mixed $value, int $length): ?string
    {
        if (! is_string($value) && ! is_int($value)) {
            return null;
        }

        return mb_substr((string) $value, 0, $length);
    }

    private function isDuplicateKey(QueryException $exception): bool
    {
        return ($exception->errorInfo[0] ?? null) === '23000'
            && (int) ($exception->errorInfo[1] ?? 0) === 1062;
    }
}
