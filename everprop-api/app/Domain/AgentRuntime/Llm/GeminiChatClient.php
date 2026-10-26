<?php

namespace App\Domain\AgentRuntime\Llm;

use Illuminate\Http\Client\ConnectionException;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Str;

/** Gemini adapter for local and explicitly enabled Railway staging. Never logs credentials or response bodies. */
final class GeminiChatClient implements LlmClient
{
    public function __construct(
        private readonly string $apiKey,
        private readonly string $modelName,
        private readonly int $timeoutSeconds
    ) {}

    public static function environmentAllowed(): bool
    {
        $railwayEnvironment = config('services.gemini.railway_environment');

        // Railway staging retains Laravel's production hardening; deployment identity controls this exception.
        return filled($railwayEnvironment)
            ? $railwayEnvironment === 'staging' && config('services.gemini.staging_enabled') === true
            : app()->environment('local');
    }

    public function complete(string $system, array $messages, array $tools, int $maxOutputTokens, bool $allowTools): LlmResponse
    {
        if (! self::environmentAllowed()) {
            throw new LlmFailure('LOCAL_COPILOT_ONLY', retryable: false, billable: false);
        }

        $toolNamesById = [];
        $contents = [];

        foreach ($messages as $message) {
            $role = ($message['role'] === 'assistant') ? 'model' : 'user';

            if (is_string($message['content'])) {
                $contents[] = [
                    'role' => $role,
                    'parts' => [['text' => $message['content']]],
                ];

                continue;
            }

            $parts = [];
            foreach ($message['content'] as $block) {
                if ($block['type'] === 'text') {
                    $parts[] = ['text' => $block['text']];
                } elseif ($block['type'] === 'tool_use') {
                    $toolNamesById[$block['id']] = $block['name'];
                    $functionCall = [
                        'name' => $block['name'],
                        'args' => (object) ($block['input'] ?? []),
                    ];
                    if (isset($block['call_id'])) {
                        $functionCall['id'] = $block['call_id'];
                    }
                    $part = ['functionCall' => $functionCall];
                    if (isset($block['thoughtSignature'])) {
                        $part['thoughtSignature'] = $block['thoughtSignature'];
                    }
                    $parts[] = $part;
                } elseif ($block['type'] === 'tool_result') {
                    $toolName = $toolNamesById[$block['tool_use_id']] ?? 'tool';
                    $decoded = json_decode((string) $block['content'], true);
                    $result = is_array($decoded) ? $decoded : ['output' => $block['content']];

                    $parts[] = [
                        'functionResponse' => [
                            'name' => $toolName,
                            'response' => $result,
                        ],
                    ];
                }
            }

            if ($parts !== []) {
                $contents[] = [
                    'role' => $role,
                    'parts' => $parts,
                ];
            }
        }

        $payload = [
            'contents' => $contents,
            'generationConfig' => [
                'maxOutputTokens' => $maxOutputTokens,
            ],
        ];

        if ($system !== '') {
            $payload['systemInstruction'] = [
                'parts' => [['text' => $system]],
            ];
        }

        if ($tools !== []) {
            $functionDeclarations = array_map(function (array $t): array {
                $parameters = $this->cleanSchema($t['input_schema'] ?? ['type' => 'object']);

                return [
                    'name' => $t['name'],
                    'description' => $t['description'],
                    'parameters' => $parameters,
                ];
            }, $tools);

            $payload['tools'] = [['functionDeclarations' => $functionDeclarations]];
            $payload['toolConfig'] = [
                'functionCallingConfig' => [
                    'mode' => $allowTools ? 'AUTO' : 'NONE',
                ],
            ];
        }

        try {
            $response = Http::withHeaders(['x-goog-api-key' => $this->apiKey])
                ->acceptJson()
                ->timeout($this->timeoutSeconds)
                ->connectTimeout(5)
                ->withOptions(['allow_redirects' => false])
                ->post("https://generativelanguage.googleapis.com/v1beta/models/{$this->modelName}:generateContent", $payload);
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
        $candidate = $body['candidates'][0] ?? null;

        if (! is_array($candidate) || ! is_array($candidate['content'] ?? null)) {
            throw new LlmFailure('INVALID_RESPONSE', retryable: false, billable: true);
        }

        $finishReason = (string) ($candidate['finishReason'] ?? '');
        if (! in_array($finishReason, ['STOP', ''], true)) {
            throw new LlmFailure('INCOMPLETE_RESPONSE', retryable: false, billable: true);
        }

        $content = [];
        $hasToolCalls = false;

        foreach ($candidate['content']['parts'] ?? [] as $part) {
            if (isset($part['text']) && is_string($part['text']) && $part['text'] !== '') {
                $content[] = ['type' => 'text', 'text' => $part['text']];
            } elseif (isset($part['functionCall']) && is_array($part['functionCall'])) {
                if (! $allowTools || ! is_string($part['functionCall']['name'] ?? null)) {
                    throw new LlmFailure('INVALID_RESPONSE', retryable: false, billable: true);
                }

                $item = [
                    'type' => 'tool_use',
                    'id' => (string) Str::uuid(),
                    'name' => $part['functionCall']['name'],
                    'input' => (array) ($part['functionCall']['args'] ?? []),
                ];
                if (isset($part['thoughtSignature'])) {
                    $item['thoughtSignature'] = $part['thoughtSignature'];
                }
                if (isset($part['functionCall']['id'])) {
                    $item['call_id'] = $part['functionCall']['id'];
                }
                $content[] = $item;
                $hasToolCalls = true;
            }
        }

        $usage = $body['usageMetadata'] ?? [];
        $inputTokens = (int) ($usage['promptTokenCount'] ?? 0);
        $outputTokens = (int) ($usage['candidatesTokenCount'] ?? 0);

        return new LlmResponse(
            $content,
            $inputTokens,
            $outputTokens,
            $hasToolCalls ? 'tool_use' : 'end_turn'
        );
    }

    public function provider(): string
    {
        return 'gemini';
    }

    public function model(): string
    {
        return $this->modelName;
    }

    /** Recursively removes schema keywords unsupported by Google Gemini function declarations. */
    private function cleanSchema(mixed $schema): mixed
    {
        if (! is_array($schema)) {
            return $schema;
        }

        unset($schema['additionalProperties']);

        foreach ($schema as $key => $value) {
            $schema[$key] = $this->cleanSchema($value);
        }

        return $schema;
    }
}
