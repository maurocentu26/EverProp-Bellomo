<?php

namespace App\Domain\AgentRuntime\Llm;

/** Default binding: no provider approved/configured (X03). Every run derives to a human. */
final class DisabledLlmClient implements LlmClient
{
    public function complete(string $system, array $messages, array $tools, int $maxOutputTokens, bool $allowTools): LlmResponse
    {
        throw new LlmFailure('PROVIDER_DISABLED', retryable: false, billable: false);
    }

    public function provider(): string
    {
        return 'disabled';
    }

    public function model(): string
    {
        return 'none';
    }
}
