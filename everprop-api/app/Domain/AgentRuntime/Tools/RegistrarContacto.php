<?php

namespace App\Domain\AgentRuntime\Tools;

use App\Domain\Conversations\Services\ConversationControl;
use App\Domain\CRM\Services\CreateOrGetOpenLeadProcedure;
use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\DB;

/**
 * Captures visitor contact details (name, phone, email) to create or get an open lead
 * and associate the conversation with an advisor, without requiring a specific property.
 */
final class RegistrarContacto implements AgentTool
{
    public function __construct(
        private readonly CreateOrGetOpenLeadProcedure $leads,
        private readonly ContactDetails $contacts,
        private readonly ConversationControl $control,
    ) {}

    public function name(): string
    {
        return 'registrar_contacto';
    }

    public function description(): string
    {
        return 'Registra los datos de contacto del visitante (nombre, teléfono o email) para crear un lead y que un asesor comercial pueda contactarlo. '
            .'En el chat web pedí antes un teléfono o email y pasalo en contact_phone o contact_email. No inventes datos de contacto.';
    }

    public function schema(): array
    {
        return [
            'type' => 'object',
            'additionalProperties' => false,
            'required' => [],
            'properties' => ContactDetails::SCHEMA + [
                'notes' => ['type' => 'string', 'maxLength' => 1000],
            ],
        ];
    }

    public function mutating(): bool
    {
        return true;
    }

    public function execute(ToolContext $context, array $arguments, ToolExecutions $executions): array
    {
        $this->contacts->assertReachable($context, $arguments);
        $state = DB::table('conversations')->where('tenant_id', $context->tenantId)->where('id', $context->conversationId)->first(['control_epoch']);
        if ((int) $state->control_epoch !== $context->epoch) {
            throw new ToolError('STALE_CONTROL', 'La conversación ya no está a cargo del asistente.');
        }

        $lead = $this->leads->execute(
            $context->tenantId,
            $context->contactId,
            $context->channelType,
            'CHATBOT',
            'Consulta por asistente',
            'NORMAL',
            CarbonImmutable::now('UTC')
        );

        $key = $executions->key($context, $this->name(), $arguments);

        return $executions->once($context, $this->name(), $arguments, function () use ($context, $arguments, $lead, $key): array {
            $now = CarbonImmutable::now('UTC')->format('Y-m-d H:i:s.v');
            $this->contacts->fill($context, $arguments, $now);
            $this->control->assignLead($context->tenantId, $context->conversationId, $lead);

            DB::table('chatbot_sessions')->where('tenant_id', $context->tenantId)->where('conversation_id', $context->conversationId)
                ->where('status', 'ACTIVE')->whereNull('lead_id')->update(['lead_id' => $lead['lead_id']]);

            DB::table('domain_outbox')->insert([
                'tenant_id' => $context->tenantId,
                'aggregate_type' => 'LEAD',
                'aggregate_id' => $lead['lead_id'],
                'event_type' => 'LEAD_CONTACT_CAPTURED',
                'idempotency_key' => 'agent-contact:'.$key,
                'payload_json' => json_encode([
                    'schema_version' => 1,
                    'lead_id' => $lead['lead_id'],
                    'conversation_id' => $context->conversationId,
                    'lead_created' => $lead['created'],
                    'notes' => $arguments['notes'] ?? null,
                ], JSON_THROW_ON_ERROR),
                'status' => 'PENDING',
                'available_at' => $now,
            ]);

            $leadPublicId = (string) DB::table('leads')->where('tenant_id', $context->tenantId)->where('id', $lead['lead_id'])->value('public_id');

            return ['lead_id' => $leadPublicId, 'status' => 'PERSISTED'];
        });
    }
}
