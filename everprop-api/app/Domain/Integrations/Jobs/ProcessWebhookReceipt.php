<?php

namespace App\Domain\Integrations\Jobs;

use Carbon\CarbonImmutable;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldBeUnique;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Support\Facades\DB;
use JsonException;
use Throwable;

final class ProcessWebhookReceipt implements ShouldBeUnique, ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable;

    public int $tries = 5;

    public int $uniqueFor = 600;

    public function __construct(public readonly int $receiptId) {}

    public function uniqueId(): string
    {
        return 'webhook-receipt:'.$this->receiptId;
    }

    /** @return list<int> */
    public function backoff(): array
    {
        return [5, 30, 120, 300];
    }

    public function handle(): void
    {
        try {
            DB::transaction(function (): void {
                $receipt = DB::table('webhook_receipts')
                    ->where('id', $this->receiptId)
                    ->lockForUpdate()
                    ->first();

                if ($receipt === null || in_array($receipt->processing_status, ['PROCESSED', 'REJECTED', 'DEAD_LETTER'], true)) {
                    return;
                }

                $now = CarbonImmutable::now('UTC');
                DB::table('webhook_receipts')
                    ->where('id', $this->receiptId)
                    ->update([
                        'processing_status' => 'PROCESSING',
                        'attempt_count' => DB::raw('attempt_count + 1'),
                        'next_attempt_at' => null,
                        'last_error_code' => null,
                        'last_error_message' => null,
                    ]);

                $payload = $this->decodePayload($receipt->raw_payload);
                $providerEventKey = $this->boundedScalar($payload['event_id'] ?? null, 191)
                    ?? 'receipt:'.$receipt->id;
                $normalizedPayload = json_encode(
                    $payload,
                    JSON_THROW_ON_ERROR | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE,
                );
                $event = DB::table('webhook_events')
                    ->where('integration_id', $receipt->integration_id)
                    ->where('provider_event_key', $providerEventKey)
                    ->lockForUpdate()
                    ->first(['id', 'normalized_payload']);

                if ($event !== null && ! $this->sameJson($event->normalized_payload, $payload)) {
                    DB::table('webhook_receipts')
                        ->where('id', $this->receiptId)
                        ->update([
                            'processing_status' => 'REJECTED',
                            'last_error_code' => 'DUPLICATE_EVENT_CONFLICT',
                            'last_error_message' => 'The provider event key conflicts with a prior payload.',
                            'processed_at' => $now->format('Y-m-d H:i:s.v'),
                        ]);

                    return;
                }

                if ($event === null) {
                    $eventId = (int) DB::table('webhook_events')->insertGetId([
                        'tenant_id' => $receipt->tenant_id,
                        'integration_id' => $receipt->integration_id,
                        'receipt_id' => $receipt->id,
                        'provider_event_key' => $providerEventKey,
                        'provider_event_id' => $this->boundedScalar($payload['event_id'] ?? null, 191),
                        'event_type' => $this->boundedScalar($payload['event_type'] ?? null, 80) ?? 'WEBHOOK_RECEIVED',
                        'actor_provider_id' => $this->boundedScalar($payload['actor_id'] ?? null, 191),
                        'object_provider_id' => $this->boundedScalar($payload['object_id'] ?? null, 191),
                        'occurred_at' => $this->occurredAt($payload, (string) $receipt->received_at),
                        'normalized_payload' => $normalizedPayload,
                        'processing_status' => 'PROCESSED',
                        'processed_at' => $now->format('Y-m-d H:i:s.v'),
                    ]);
                } else {
                    $eventId = (int) $event->id;
                }

                DB::table('domain_outbox')->insertOrIgnore([
                    'tenant_id' => $receipt->tenant_id,
                    'aggregate_type' => 'WEBHOOK_EVENT',
                    'aggregate_id' => $eventId,
                    'event_type' => 'WEBHOOK_EVENT_RECEIVED',
                    'idempotency_key' => 'webhook-event-received:'.$eventId,
                    'payload_json' => json_encode([
                        'webhook_event_id' => $eventId,
                        'integration_id' => (int) $receipt->integration_id,
                        'event_type' => $this->boundedScalar($payload['event_type'] ?? null, 80) ?? 'WEBHOOK_RECEIVED',
                    ], JSON_THROW_ON_ERROR | JSON_UNESCAPED_SLASHES),
                    'status' => 'PENDING',
                    'available_at' => $now->format('Y-m-d H:i:s.v'),
                ]);

                DB::table('webhook_receipts')
                    ->where('id', $this->receiptId)
                    ->update([
                        'processing_status' => 'PROCESSED',
                        'processed_at' => $now->format('Y-m-d H:i:s.v'),
                        'next_attempt_at' => null,
                    ]);
            }, 3);
        } catch (Throwable $exception) {
            $attempt = max(1, $this->attempts());
            DB::table('webhook_receipts')
                ->where('id', $this->receiptId)
                ->whereNotIn('processing_status', ['PROCESSED', 'REJECTED', 'DEAD_LETTER'])
                ->update([
                    'processing_status' => 'RETRY',
                    'attempt_count' => DB::raw('attempt_count + 1'),
                    'next_attempt_at' => CarbonImmutable::now('UTC')
                        ->addSeconds(min(300, 5 * (2 ** ($attempt - 1))))
                        ->format('Y-m-d H:i:s.v'),
                    'last_error_code' => 'PROCESSING_ERROR',
                    'last_error_message' => 'Webhook processing failed and will be retried.',
                ]);

            throw $exception;
        }
    }

    public function failed(?Throwable $exception): void
    {
        DB::table('webhook_receipts')
            ->where('id', $this->receiptId)
            ->whereNotIn('processing_status', ['PROCESSED', 'REJECTED'])
            ->update([
                'processing_status' => 'DEAD_LETTER',
                'next_attempt_at' => null,
                'last_error_code' => 'MAX_ATTEMPTS_EXCEEDED',
                'last_error_message' => 'Webhook processing exhausted its retry policy.',
            ]);
    }

    /** @return array<string, mixed> */
    private function decodePayload(mixed $rawPayload): array
    {
        if (is_array($rawPayload)) {
            return $rawPayload;
        }

        $payload = json_decode((string) $rawPayload, true, 512, JSON_THROW_ON_ERROR);

        if (! is_array($payload)) {
            throw new JsonException('Webhook payload must be a JSON object or array.');
        }

        return $payload;
    }

    /** @param array<string, mixed> $payload */
    private function sameJson(mixed $storedPayload, array $payload): bool
    {
        $stored = is_string($storedPayload)
            ? json_decode($storedPayload, true, 512, JSON_THROW_ON_ERROR)
            : (array) $storedPayload;

        return $this->canonicalJson((array) $stored) === $this->canonicalJson($payload);
    }

    /** @param array<mixed> $value */
    private function canonicalJson(array $value): string
    {
        $this->sortRecursively($value);

        return json_encode(
            $value,
            JSON_THROW_ON_ERROR | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_PRESERVE_ZERO_FRACTION,
        );
    }

    /** @param array<mixed> $value */
    private function sortRecursively(array &$value): void
    {
        if (! array_is_list($value)) {
            ksort($value, SORT_STRING);
        }

        foreach ($value as &$item) {
            if (is_array($item)) {
                $this->sortRecursively($item);
            }
        }
    }

    /** @param array<string, mixed> $payload */
    private function occurredAt(array $payload, string $fallback): string
    {
        try {
            return isset($payload['occurred_at'])
                ? CarbonImmutable::parse((string) $payload['occurred_at'])->utc()->format('Y-m-d H:i:s.v')
                : CarbonImmutable::parse($fallback)->utc()->format('Y-m-d H:i:s.v');
        } catch (Throwable) {
            return CarbonImmutable::parse($fallback)->utc()->format('Y-m-d H:i:s.v');
        }
    }

    private function boundedScalar(mixed $value, int $length): ?string
    {
        if (! is_string($value) && ! is_int($value)) {
            return null;
        }

        return mb_substr((string) $value, 0, $length);
    }
}
