<?php

namespace App\Domain\AgentRuntime\Tools;

use App\Domain\Conversations\Services\ConversationControl;
use App\Domain\Conversations\Services\InboundMessageService;
use App\Domain\CRM\Services\CreateOrGetOpenLeadProcedure;
use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\DB;

/**
 * Hands the conversation to a human. The tool only records the decision on the context; the
 * coordinator applies it (ConversationControl::requestHuman) AFTER queueing the final text, so
 * the goodbye message and the handoff are atomic with respect to the epoch.
 */
final class DerivarAAsesor implements AgentTool
{
    public const REASONS = ['USER_REQUEST', 'NO_EVIDENCE', 'TOOL_FAILURE', 'COMMERCIAL_EXCEPTION'];

    public function __construct(
        private readonly ContactDetails $contacts,
        private readonly CreateOrGetOpenLeadProcedure $leads,
        private readonly ConversationControl $control,
    ) {}

    public function name(): string
    {
        return 'derivar_a_asesor';
    }

    public function description(): string
    {
        return 'Pasa la conversación a un asesor humano. Usala si el visitante lo pide, si no tenés datos verificados para responder, '
            .'si una herramienta falla o si pide una excepción comercial (descuentos, financiación especial). '
            .'Incluí contact_name, contact_phone y/o contact_email si el visitante los proporcionó. No garantiza un asesor en línea.';
    }

    public function schema(): array
    {
        return [
            'type' => 'object', 'additionalProperties' => false, 'required' => ['reason', 'summary'],
            'properties' => [
                'reason' => ['type' => 'string', 'enum' => self::REASONS],
                'summary' => ['type' => 'string', 'maxLength' => 1500, 'minLength' => 3],
            ] + ContactDetails::SCHEMA,
        ];
    }

    public function mutating(): bool
    {
        return false; // applied by the coordinator under the epoch fence (requestHuman)
    }

    public function execute(ToolContext $context, array $arguments, ToolExecutions $executions): array
    {
        if (! InboundMessageService::aiEnabled($context->tenantId)) {
            throw new ToolError('STALE_CONTROL', 'El asistente fue desactivado para esta organización.');
        }

        $now = CarbonImmutable::now('UTC');
        DB::transaction(function () use ($context, $arguments, $now): void {
            $conversation = DB::table('conversations')
                ->where('tenant_id', $context->tenantId)
                ->where('id', $context->conversationId)
                ->lockForUpdate()
                ->first(['control_state', 'control_epoch']);
            if ($conversation === null
                || ! in_array($conversation->control_state, ConversationControl::BOT_STATES, true)
                || (int) $conversation->control_epoch !== $context->epoch) {
                throw new ToolError('STALE_CONTROL', 'La conversación ya no está a cargo del asistente.');
            }

            if (isset($arguments['contact_name']) || isset($arguments['contact_phone']) || isset($arguments['contact_email'])) {
                $this->contacts->fill($context, $arguments, $now->format('Y-m-d H:i:s.v'));
            }
        }, 3);

        $this->assignAdvisorFromContactIfPossible($context, $now);

        $context->handoff = ['reason' => $arguments['reason'], 'summary' => $arguments['summary']];

        return ['state' => 'WAITING_HUMAN', 'note' => 'Despedite brevemente: un asesor va a continuar la conversación.'];
    }

    private function assignAdvisorFromContactIfPossible(ToolContext $context, CarbonImmutable $now): void
    {
        if (DB::connection()->transactionLevel() !== 0) {
            return;
        }

        $contact = DB::table('contacts')
            ->where('tenant_id', $context->tenantId)
            ->where('id', $context->contactId)
            ->first(['phone_e164', 'email', 'profile_json']);

        if ($contact === null) {
            return;
        }

        $profile = is_string($contact->profile_json ?? null) ? (json_decode($contact->profile_json, true) ?: []) : [];
        $hasDeclaredPhone = is_string($profile['declared_phone'] ?? null) && trim($profile['declared_phone']) !== '';
        $hasReachableData = $contact->phone_e164 !== null || $contact->email !== null || $hasDeclaredPhone;

        if (! $hasReachableData) {
            return;
        }

        $hasOpenStage = DB::table('pipeline_stages')
            ->where('tenant_id', $context->tenantId)
            ->where('category', 'OPEN')
            ->where('is_active', 1)
            ->where('code', 'NEW')
            ->exists();

        if (! $hasOpenStage) {
            return;
        }

        $lead = $this->leads->execute(
            $context->tenantId,
            $context->contactId,
            $context->channelType,
            'CHATBOT',
            'Consulta derivada por asistente',
            'NORMAL',
            $now,
        );

        $this->control->assignLead($context->tenantId, $context->conversationId, $lead, notify: false, expectedEpoch: $context->epoch);

        DB::table('chatbot_sessions')
            ->where('tenant_id', $context->tenantId)
            ->where('conversation_id', $context->conversationId)
            ->where('status', 'ACTIVE')
            ->whereNull('lead_id')
            ->update(['lead_id' => $lead['lead_id'], 'last_activity_at' => $now->format('Y-m-d H:i:s.v')]);
    }
}
