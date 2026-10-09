<?php

namespace Tests\Feature\AgentRuntime;

use App\Domain\AgentRuntime\Llm\LlmClient;
use App\Domain\AgentRuntime\Llm\LlmFailure;
use App\Domain\AgentRuntime\Llm\LlmResponse;
use Closure;

/**
 * Deterministic model for tests: each step is a closure receiving what the coordinator sent
 * (so tests can use ids returned by earlier tool calls) and returning a response or a failure.
 */
final class ScriptedLlm implements LlmClient
{
    /** @var list<array{system: string, messages: list<array<string, mixed>>, allow_tools: bool}> */
    public array $calls = [];

    /** @param list<Closure(array<string, mixed>): (LlmResponse|LlmFailure)> $steps */
    public function __construct(private array $steps) {}

    public function complete(string $system, array $messages, array $tools, int $maxOutputTokens, bool $allowTools): LlmResponse
    {
        $this->calls[] = ['system' => $system, 'messages' => $messages, 'allow_tools' => $allowTools];
        $step = array_shift($this->steps) ?? throw new \LogicException('Unexpected LLM call');
        $result = $step(['system' => $system, 'messages' => $messages, 'allow_tools' => $allowTools]);
        if ($result instanceof LlmFailure) {
            throw $result;
        }

        return $result;
    }

    public function provider(): string
    {
        return 'scripted';
    }

    public function model(): string
    {
        return 'scripted-1';
    }

    public static function text(string $text): Closure
    {
        return fn (): LlmResponse => new LlmResponse([['type' => 'text', 'text' => $text]], 1200, 80, 'end_turn');
    }

    /** @param array<string, mixed>|Closure(array<string, mixed>): array<string, mixed> $input */
    public static function tool(string $name, array|Closure $input, string $text = ''): Closure
    {
        return fn (array $request): LlmResponse => new LlmResponse(array_values(array_filter([
            $text === '' ? null : ['type' => 'text', 'text' => $text],
            ['type' => 'tool_use', 'id' => 'toolu_'.bin2hex(random_bytes(4)), 'name' => $name, 'input' => $input instanceof Closure ? $input($request) : $input],
        ])), 1500, 60, 'tool_use');
    }

    /**
     * Last tool_result content sent to the model, decoded.
     *
     * @param  array<string, mixed>  $request
     * @return array<string, mixed>
     */
    public static function lastToolResult(array $request): array
    {
        $last = end($request['messages']);

        return json_decode($last['content'][0]['content'], true);
    }
}
