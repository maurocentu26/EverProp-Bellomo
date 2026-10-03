<?php

namespace App\Domain\AgentRuntime\Tools;

use App\Domain\CRM\Services\CreateOrGetOpenLeadProcedure;
use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\DB;

/**
 * S12. Links the conversation's contact to a visible property through its open lead. The contact
 * and lead come from the conversation, never from the model. Visitor-declared name/phone/email
 * only fill empty contact fields and are flagged as unverified; they never overwrite CRM data.
 */
final class RegistrarInteres implements AgentTool
{
    private const LEVELS = ['LOW' => 1, 'MEDIUM' => 2, 'HIGH' => 3, 'HOT' => 4];

    public function __construct(
        private readonly PublicInventory $inventory,
        private readonly CreateOrGetOpenLeadProcedure $leads,
        private readonly ContactDetails $contacts,
    ) {}

    public function name(): string
    {
        return 'registrar_interes';
    }

    public function description(): string
    {
        return 'Registra el interés del visitante en una propiedad para que un asesor lo contacte. En el chat web pedí antes un teléfono o email '
            .'y pasalo en contact_phone o contact_email. No inventes datos de contacto.';
    }

    public function schema(): array
    {
        return [
            'type' => 'object', 'additionalProperties' => false, 'required' => ['property_id', 'interest_level'],
            'properties' => [
                'property_id' => ['type' => 'string', 'format' => 'uuid'],
                'interest_level' => ['type' => 'string', 'enum' => ['LOW', 'MEDIUM', 'HIGH']],
                'notes' => ['type' => 'string', 'maxLength' => 1000],
            ] + ContactDetails::SCHEMA,
        ];
    }

    public function mutating(): bool
    {
        return true;
    }

    public function execute(ToolContext $context, array $arguments, ToolExecutions $executions): array
    {
        $propertyId = $this->inventory->idOrFail($context->tenantId, $arguments['property_id']);
        $this->contacts->assertReachable($context, $arguments);
        // Cheap fence before creating a lead; the authoritative check runs again under lock.
        $state = DB::table('conversations')->where('tenant_id', $context->tenantId)->where('id', $context->conversationId)->first(['control_epoch']);
        if ((int) $state->control_epoch !== $context->epoch) {
            throw new ToolError('STALE_CONTROL', 'La conversación ya no está a cargo del asistente.');
        }

        // Stored procedure: idempotent get-or-create of the contact's open lead; must run outside a transaction.
        $lead = $this->leads->execute($context->tenantId, $context->contactId, $context->channelType, 'CHATBOT', 'Consulta por asistente', 'NORMAL', CarbonImmutable::now('UTC'));

        $key = $executions->key($context, $this->name(), $arguments);

        return $executions->once($context, $this->name(), $arguments, function () use ($context, $arguments, $propertyId, $lead, $key): array {
            $now = CarbonImmutable::now('UTC')->format('Y-m-d H:i:s.v');
            $this->contacts->fill($context, $arguments, $now);
            $existing = DB::table('lead_properties')->where('tenant_id', $context->tenantId)->where('lead_id', $lead['lead_id'])
                ->where('property_id', $propertyId)->lockForUpdate()->first(['interest_level']);
            if ($existing === null) {
                DB::table('lead_properties')->insert([
                    'tenant_id' => $context->tenantId, 'lead_id' => $lead['lead_id'], 'property_id' => $propertyId,
                    'interest_level' => $arguments['interest_level'], 'status' => 'ACTIVE', 'linked_at' => $now, 'last_activity_at' => $now,
                    'notes' => isset($arguments['notes']) ? '[Asistente, dicho por el visitante] '.$arguments['notes'] : null,
                    'metadata_json' => json_encode(['source' => 'agent', 'conversation_id' => $context->conversationId], JSON_THROW_ON_ERROR),
                ]);
            } else {
                // Never downgrade what an advisor set (e.g. HOT).
                $level = self::LEVELS[$arguments['interest_level']] > self::LEVELS[$existing->interest_level] ? $arguments['interest_level'] : $existing->interest_level;
                DB::table('lead_properties')->where('tenant_id', $context->tenantId)->where('lead_id', $lead['lead_id'])
                    ->where('property_id', $propertyId)->update(['interest_level' => $level, 'last_activity_at' => $now]);
            }
            DB::table('chatbot_sessions')->where('tenant_id', $context->tenantId)->where('conversation_id', $context->conversationId)
                ->where('status', 'ACTIVE')->whereNull('lead_id')->update(['lead_id' => $lead['lead_id']]);
            DB::table('domain_outbox')->insert([
                'tenant_id' => $context->tenantId, 'aggregate_type' => 'LEAD', 'aggregate_id' => $lead['lead_id'],
                'event_type' => 'LEAD_INTEREST_REGISTERED', 'idempotency_key' => 'agent-interest:'.$key,
                'payload_json' => json_encode(['schema_version' => 1, 'lead_id' => $lead['lead_id'], 'property_id' => $propertyId,
                    'conversation_id' => $context->conversationId, 'lead_created' => $lead['created']], JSON_THROW_ON_ERROR),
                'status' => 'PENDING', 'available_at' => $now,
            ]);
            $leadPublicId = (string) DB::table('leads')->where('tenant_id', $context->tenantId)->where('id', $lead['lead_id'])->value('public_id');

            return ['interest_id' => $leadPublicId.':'.$arguments['property_id'], 'lead_id' => $leadPublicId, 'status' => 'PERSISTED'];
        });
    }
}
