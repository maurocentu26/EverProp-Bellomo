<?php

namespace App\Domain\AgentRuntime\Tools;

interface AgentTool
{
    public function name(): string;

    /** Plain-language description shown to the model (no internal details). */
    public function description(): string;

    /** @return array<string, mixed> closed JSON schema: the only surface the model sees */
    public function schema(): array;

    /** Mutating tools are idempotent through tool_executions and fenced by the control epoch. */
    public function mutating(): bool;

    /**
     * @param  array<string, mixed>  $arguments  already validated against schema()
     * @return array<string, mixed>
     */
    public function execute(ToolContext $context, array $arguments, ToolExecutions $executions): array;
}
