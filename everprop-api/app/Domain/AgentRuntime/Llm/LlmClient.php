<?php

namespace App\Domain\AgentRuntime\Llm;

/**
 * Provider-neutral chat completion with tools. Messages and tool blocks use the Anthropic Messages
 * shape internally; another provider adapter translates. Implementations must enforce the timeout
 * and max output tokens they are given and must not log prompt contents.
 */
interface LlmClient
{
    /**
     * @param  list<array<string, mixed>>  $messages
     * @param  list<array<string, mixed>>  $tools
     *
     * @throws LlmFailure
     */
    public function complete(string $system, array $messages, array $tools, int $maxOutputTokens, bool $allowTools): LlmResponse;

    public function provider(): string;

    public function model(): string;
}
