<?php

namespace App\Domain\AgentRuntime\Llm;

final class LlmResponse
{
    /** @param list<array<string, mixed>> $content text / tool_use blocks */
    public function __construct(
        public readonly array $content,
        public readonly int $inputTokens,
        public readonly int $outputTokens,
        public readonly string $stopReason,
    ) {}

    public function text(): string
    {
        return trim(implode("\n", array_map(fn (array $b): string => (string) $b['text'], array_values(array_filter($this->content, fn (array $b): bool => ($b['type'] ?? '') === 'text')))));
    }

    /** @return list<array{id: string, name: string, input: mixed}> */
    public function toolUses(): array
    {
        return array_values(array_map(fn (array $b): array => ['id' => (string) $b['id'], 'name' => (string) $b['name'], 'input' => $b['input'] ?? []],
            array_filter($this->content, fn (array $b): bool => ($b['type'] ?? '') === 'tool_use')));
    }
}
