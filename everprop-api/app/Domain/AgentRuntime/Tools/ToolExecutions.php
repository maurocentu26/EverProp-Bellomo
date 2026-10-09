<?php

namespace App\Domain\AgentRuntime\Tools;

use App\Domain\Conversations\Services\ConversationControl;
use Illuminate\Support\Facades\DB;

/**
 * Idempotency + epoch fence for mutating tools (tool-contract §4). The key is deterministic:
 * conversation + inbound sequence the run answers + tool + canonical arguments. A retried run or a
 * duplicated tool call returns the stored result instead of repeating the effect.
 */
final class ToolExecutions
{
    /** @param array<string, mixed> $arguments */
    public function key(ToolContext $context, string $tool, array $arguments): string
    {
        return hash('sha256', implode('|', [$context->conversationId, $context->inputSequence, $tool, $this->canonical($arguments)]));
    }

    /** @return array<string, mixed>|null */
    public function stored(ToolContext $context, string $tool, string $key): ?array
    {
        $row = DB::table('tool_executions')->where('tenant_id', $context->tenantId)->where('tool_name', $tool)
            ->where('idempotency_key', $key)->first(['result_json']);

        return $row === null ? null : json_decode((string) $row->result_json, true, 512, JSON_THROW_ON_ERROR);
    }

    /**
     * Runs $effect in one transaction with the conversation row locked, after checking the run still
     * holds bot control, and records the result under the idempotency key in the same transaction.
     *
     * @param  array<string, mixed>  $arguments
     * @param  callable(): array<string, mixed>  $effect
     * @return array<string, mixed>
     */
    public function once(ToolContext $context, string $tool, array $arguments, callable $effect): array
    {
        $key = $this->key($context, $tool, $arguments);

        return DB::transaction(function () use ($context, $tool, $arguments, $key, $effect): array {
            $conversation = DB::table('conversations')->where('tenant_id', $context->tenantId)->where('id', $context->conversationId)
                ->lockForUpdate()->first(['control_epoch', 'control_state']);
            if ($conversation === null || (int) $conversation->control_epoch !== $context->epoch
                || ! in_array($conversation->control_state, ConversationControl::BOT_STATES, true)) {
                throw new ToolError('STALE_CONTROL', 'La conversación ya no está a cargo del asistente.');
            }
            $result = $effect();
            DB::table('tool_executions')->insert([
                'tenant_id' => $context->tenantId, 'conversation_id' => $context->conversationId, 'run_id' => $context->runId,
                'tool_name' => $tool, 'idempotency_key' => $key, 'arguments_sha256' => hash('sha256', $this->canonical($arguments), true),
                'status' => 'SUCCEEDED', 'result_json' => json_encode($result, JSON_THROW_ON_ERROR | JSON_UNESCAPED_UNICODE),
            ]);

            return $result;
        }, 3);
    }

    public function canonical(mixed $value): string
    {
        $sort = function (mixed $v) use (&$sort): mixed {
            if (! is_array($v)) {
                return $v;
            }
            if (! array_is_list($v)) {
                ksort($v);
            }

            return array_map($sort, $v);
        };

        return json_encode($sort($value), JSON_THROW_ON_ERROR | JSON_UNESCAPED_UNICODE);
    }
}
