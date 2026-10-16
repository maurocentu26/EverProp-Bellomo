<?php

namespace App\Domain\AgentRuntime\Llm;

use Illuminate\Http\Client\ConnectionException;
use Illuminate\Support\Facades\Http;

/**
 * Anthropic Messages API adapter (POST /v1/messages). Only active when AGENT_LLM_PROVIDER=anthropic,
 * a key and a model are configured. Prompt/response bodies are never logged.
 */
final class AnthropicMessagesClient implements LlmClient
{
    public function __construct(
        private readonly string $apiKey,
        private readonly string $modelName,
        private readonly string $baseUrl,
        private readonly string $apiVersion,
        private readonly int $timeoutSeconds,
    ) {}

    public function complete(string $system, array $messages, array $tools, int $maxOutputTokens, bool $allowTools): LlmResponse
    {
        $payload = ['model' => $this->modelName, 'max_tokens' => $maxOutputTokens, 'system' => $system, 'messages' => $messages];
        if ($tools !== []) {
            $payload['tools'] = $tools;
            $payload['tool_choice'] = ['type' => $allowTools ? 'auto' : 'none'];
        }

        try {
            $response = Http::withHeaders(['x-api-key' => $this->apiKey, 'anthropic-version' => $this->apiVersion])
                ->acceptJson()->timeout($this->timeoutSeconds)->connectTimeout(5)
                ->post(rtrim($this->baseUrl, '/').'/v1/messages', $payload);
        } catch (ConnectionException) {
            throw new LlmFailure('TIMEOUT', retryable: true, billable: true);
        }

        if ($response->status() === 429 || $response->status() === 529) {
            throw new LlmFailure('RATE_LIMITED', retryable: true, billable: false);
        }
        if ($response->serverError()) {
            throw new LlmFailure('PROVIDER_ERROR', retryable: true, billable: true);
        }
        if (! $response->successful()) {
            throw new LlmFailure('PROVIDER_REJECTED', retryable: false, billable: false);
        }

        $body = $response->json();

        return new LlmResponse(
            content: array_values(array_filter((array) ($body['content'] ?? []), 'is_array')),
            inputTokens: (int) ($body['usage']['input_tokens'] ?? 0) + (int) ($body['usage']['cache_creation_input_tokens'] ?? 0) + (int) ($body['usage']['cache_read_input_tokens'] ?? 0),
            outputTokens: (int) ($body['usage']['output_tokens'] ?? 0),
            stopReason: (string) ($body['stop_reason'] ?? 'unknown'),
        );
    }

    public function provider(): string
    {
        return 'anthropic';
    }

    public function model(): string
    {
        return $this->modelName;
    }
}
