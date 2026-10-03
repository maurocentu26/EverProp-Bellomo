<?php

namespace App\Domain\AgentRuntime\Tools;

use Illuminate\Support\Facades\DB;

/**
 * Hands the conversation to a human. The tool only records the decision on the context; the
 * coordinator applies it (ConversationControl::requestHuman) AFTER queueing the final text, so
 * the goodbye message and the handoff are atomic with respect to the epoch.
 */
final class DerivarAAsesor implements AgentTool
{
    public const REASONS = ['USER_REQUEST', 'NO_EVIDENCE', 'TOOL_FAILURE', 'COMMERCIAL_EXCEPTION'];

    public function name(): string
    {
        return 'derivar_a_asesor';
    }

    public function description(): string
    {
        return 'Pasa la conversación a un asesor humano. Usala si el visitante lo pide, si no tenés datos verificados para responder, '
            .'si una herramienta falla o si pide una excepción comercial (descuentos, financiación especial). No garantiza un asesor en línea.';
    }

    public function schema(): array
    {
        return [
            'type' => 'object', 'additionalProperties' => false, 'required' => ['reason', 'summary'],
            'properties' => [
                'reason' => ['type' => 'string', 'enum' => self::REASONS],
                'summary' => ['type' => 'string', 'maxLength' => 1500, 'minLength' => 3],
            ],
        ];
    }

    public function mutating(): bool
    {
        return false; // applied by the coordinator under the epoch fence (requestHuman)
    }

    public function execute(ToolContext $context, array $arguments, ToolExecutions $executions): array
    {
        $state = DB::table('conversations')->where('tenant_id', $context->tenantId)->where('id', $context->conversationId)->value('control_epoch');
        if ((int) $state !== $context->epoch) {
            throw new ToolError('STALE_CONTROL', 'La conversación ya no está a cargo del asistente.');
        }
        $context->handoff = ['reason' => $arguments['reason'], 'summary' => $arguments['summary']];

        return ['state' => 'WAITING_HUMAN', 'note' => 'Despedite brevemente: un asesor va a continuar la conversación.'];
    }
}
