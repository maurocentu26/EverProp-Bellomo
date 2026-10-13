<?php

namespace App\Domain\AgentRuntime\Llm;

use Illuminate\Http\Client\ConnectionException;
use Illuminate\Support\Facades\Http;
use JsonException;

/** Local copilot adapter. Never logs credentials or provider response bodies. */
final class OpenAiChatClient implements LlmClient
{
    public function __construct(private readonly string $apiKey, private readonly string $modelName, private readonly int $timeoutSeconds) {}

    public function complete(string $system, array $messages, array $tools, int $maxOutputTokens, bool $allowTools): LlmResponse
    {
        if (! app()->environment('local') || config('conversations.ai_enabled')) {
            throw new LlmFailure('LOCAL_COPILOT_ONLY', retryable: false, billable: false);
        }
        $translated = [['role' => 'system', 'content' => $system]];
        foreach ($messages as $message) {
            if (is_string($message['content'])) {
                $translated[] = $message;

                continue;
            }
            $text = [];
            $calls = [];
            foreach ($message['content'] as $block) {
                if ($block['type'] === 'text') {
                    $text[] = $block['text'];
                } elseif ($block['type'] === 'tool_use') {
                    $calls[] = ['id' => $block['id'], 'type' => 'function', 'function' => [
                        'name' => $block['name'], 'arguments' => json_encode($block['input'] ?: (object) [], JSON_THROW_ON_ERROR),
                    ]];
                } elseif ($block['type'] === 'tool_result') {
                    $translated[] = ['role' => 'tool', 'tool_call_id' => $block['tool_use_id'], 'content' => $block['content']];
                }
            }
            if ($text !== [] || $calls !== []) {
                $item = ['role' => $message['role'], 'content' => implode("\n", $text)];
                if ($calls !== []) {
                    $item['tool_calls'] = $calls;
                }
                $translated[] = $item;
            }
        }
        $payload = ['model' => $this->modelName, 'messages' => $translated, 'max_completion_tokens' => $maxOutputTokens,
            'store' => false];
        if ($tools !== []) {
            $payload['tool_choice'] = $allowTools ? 'auto' : 'none';
            // Existing schemas allow optional fields; validation remains authoritative in ToolGateway.
            $payload['tools'] = array_map(fn (array $t): array => ['type' => 'function', 'function' => [
                'name' => $t['name'], 'description' => $t['description'], 'parameters' => $t['input_schema'], 'strict' => false,
            ]], $tools);
        }
        try {
            $response = Http::withToken($this->apiKey)->acceptJson()->timeout($this->timeoutSeconds)->connectTimeout(5)
                ->withOptions(['allow_redirects' => false])->post('https://api.openai.com/v1/chat/completions', $payload);
        } catch (ConnectionException) {
            throw new LlmFailure('TIMEOUT', retryable: true, billable: true);
        }
        if ($response->status() === 429) {
            throw new LlmFailure('RATE_LIMITED', retryable: true, billable: false);
        }
        if ($response->serverError()) {
            throw new LlmFailure('PROVIDER_ERROR', retryable: true, billable: true);
        }
        if (! $response->successful()) {
            throw new LlmFailure('PROVIDER_REJECTED', retryable: false, billable: false);
        }
        $body = $response->json();
        $choice = $body['choices'][0] ?? null;
        if (! is_array($choice) || ! is_array($choice['message'] ?? null) || ! isset($body['usage']['prompt_tokens'], $body['usage']['completion_tokens'])) {
            throw new LlmFailure('INVALID_RESPONSE', retryable: false, billable: true);
        }
        foreach (['prompt_tokens', 'completion_tokens'] as $field) {
            if (! is_int($body['usage'][$field]) || $body['usage'][$field] < 0) {
                throw new LlmFailure('INVALID_RESPONSE', retryable: false, billable: true);
            }
        }
        $reason = $choice['finish_reason'] ?? '';
        if (! in_array($reason, ['stop', 'tool_calls'], true)) {
            // Never execute truncated arguments or present partial output as a completed draft.
            throw new LlmFailure('INCOMPLETE_RESPONSE', retryable: false, billable: true);
        }
        $content = [];
        if (is_string($choice['message']['content'] ?? null) && $choice['message']['content'] !== '') {
            $content[] = ['type' => 'text', 'text' => $choice['message']['content']];
        }
        foreach ($choice['message']['tool_calls'] ?? [] as $call) {
            if (! $allowTools || ! is_string($call['id'] ?? null) || ! is_string($call['function']['name'] ?? null)
                || ! is_string($call['function']['arguments'] ?? null)) {
                throw new LlmFailure('INVALID_RESPONSE', retryable: false, billable: true);
            }
            try {
                $input = json_decode($call['function']['arguments'], true, 512, JSON_THROW_ON_ERROR);
            } catch (JsonException) {
                throw new LlmFailure('INVALID_RESPONSE', retryable: false, billable: true);
            }
            if (! is_array($input) || ! str_starts_with(ltrim($call['function']['arguments']), '{')) {
                throw new LlmFailure('INVALID_RESPONSE', retryable: false, billable: true);
            }
            $content[] = ['type' => 'tool_use', 'id' => $call['id'], 'name' => $call['function']['name'], 'input' => $input];
        }

        return new LlmResponse($content, (int) $body['usage']['prompt_tokens'], (int) $body['usage']['completion_tokens'], $reason === 'tool_calls' ? 'tool_use' : 'end_turn');
    }

    public function provider(): string
    {
        return 'openai';
    }

    public function model(): string
    {
        return $this->modelName;
    }
}
