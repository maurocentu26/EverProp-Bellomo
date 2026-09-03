<?php

namespace App\Domain\Integrations\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

final class ReceiveWebhookRequest extends FormRequest
{
    /** @var array<string, mixed>|null */
    private ?array $decoded = null;

    public function authorize(): bool
    {
        return true;
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [
            '_timestamp' => ['required', 'string', 'regex:/\A[0-9]{10}\z/'],
            '_signature' => ['required', 'string', 'regex:/\Asha256=[a-fA-F0-9]{64}\z/'],
            '_idempotency_key' => ['required', 'string', 'max:191', 'regex:/\A[A-Za-z0-9._:-]+\z/'],
            '_request_id' => ['nullable', 'string', 'max:191', 'regex:/\A[A-Za-z0-9._:-]+\z/'],
            '_body' => ['required', 'array'],
            '_body_bytes' => ['integer', 'max:'.(int) config('services.webhooks.max_payload_bytes', 1048576)],
        ];
    }

    /** @return array<string, mixed> */
    public function validationData(): array
    {
        $raw = $this->getContent();

        try {
            $decoded = json_decode($raw, true, 512, JSON_THROW_ON_ERROR);
            $this->decoded = is_array($decoded) ? $decoded : null;
        } catch (\JsonException) {
            $this->decoded = null;
        }

        return [
            '_timestamp' => $this->header('X-Everprop-Timestamp'),
            '_signature' => $this->header('X-Everprop-Signature'),
            '_idempotency_key' => $this->header('X-Webhook-Idempotency-Key'),
            '_request_id' => $this->header('X-Request-Id'),
            '_body' => $this->decoded,
            '_body_bytes' => strlen($raw),
        ];
    }

    public function timestamp(): string
    {
        return (string) $this->validated('_timestamp');
    }

    public function signature(): string
    {
        return (string) $this->validated('_signature');
    }

    public function idempotencyKey(): string
    {
        return (string) $this->validated('_idempotency_key');
    }

    public function requestId(): ?string
    {
        $requestId = $this->validated('_request_id');

        return is_string($requestId) ? $requestId : null;
    }

    /** @return array<string, mixed> */
    public function decodedPayload(): array
    {
        return $this->decoded ?? [];
    }

    /** @return array<string, string> */
    public function persistedHeaders(): array
    {
        return array_filter([
            'content-type' => $this->header('Content-Type'),
            'user-agent' => mb_substr((string) $this->userAgent(), 0, 1000),
            'x-everprop-timestamp' => $this->timestamp(),
            'x-request-id' => $this->requestId(),
        ], static fn (mixed $value): bool => is_string($value) && $value !== '');
    }
}
