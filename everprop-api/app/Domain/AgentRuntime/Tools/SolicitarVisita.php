<?php

namespace App\Domain\AgentRuntime\Tools;

use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/**
 * S13. Records a visit REQUEST. It is never a confirmed visit: an advisor confirms it (and only
 * then a `visits` row exists). The model must say "un asesor te confirma", never "quedó agendada".
 */
final class SolicitarVisita implements AgentTool
{
    private const MIN_LEAD_MINUTES = 60;

    private const MAX_DAYS_AHEAD = 60;

    private const MAX_SLOT_HOURS = 4;

    /** Open requests per conversation in 24 h: stops a visitor (or an injected loop) from flooding advisors. */
    private const MAX_OPEN_PER_DAY = 3;

    public function __construct(private readonly PublicInventory $inventory, private readonly ContactDetails $contacts) {}

    public function name(): string
    {
        return 'solicitar_visita';
    }

    public function description(): string
    {
        return 'Registra una SOLICITUD de visita con 1 a 3 franjas preferidas. No confirma la visita: un asesor la confirma después. '
            .'Cada franja lleva inicio y fin (ISO 8601) y zona horaria IANA (por ejemplo America/Argentina/Jujuy).';
    }

    public function schema(): array
    {
        $slot = [
            'type' => 'object', 'additionalProperties' => false, 'required' => ['start', 'end', 'timezone'],
            'properties' => [
                'start' => ['type' => 'string', 'format' => 'date-time', 'maxLength' => 40],
                'end' => ['type' => 'string', 'format' => 'date-time', 'maxLength' => 40],
                'timezone' => ['type' => 'string', 'format' => 'timezone', 'maxLength' => 64],
            ],
        ];

        return [
            'type' => 'object', 'additionalProperties' => false, 'required' => ['property_id', 'preferred_slots'],
            'properties' => [
                'property_id' => ['type' => 'string', 'format' => 'uuid'],
                'preferred_slots' => ['type' => 'array', 'minItems' => 1, 'maxItems' => 3, 'items' => $slot],
                'note' => ['type' => 'string', 'maxLength' => 1000],
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
        $slots = array_map(fn (array $slot): array => $this->slot($slot), $arguments['preferred_slots']);

        return $executions->once($context, $this->name(), $arguments, function () use ($context, $arguments, $propertyId, $slots): array {
            $now = CarbonImmutable::now('UTC')->format('Y-m-d H:i:s.v');
            $open = DB::table('visit_requests')->where('tenant_id', $context->tenantId)->where('conversation_id', $context->conversationId)
                ->where('status', 'REQUESTED')->where('created_at', '>', CarbonImmutable::now('UTC')->subDay()->format('Y-m-d H:i:s.v'));
            // Same property already requested: one pending request, not a new one.
            $same = (clone $open)->where('property_id', $propertyId)->value('public_id');
            if ($same !== null) {
                return ['request_id' => (string) $same, 'status' => 'REQUESTED', 'confirmed' => false, 'already_requested' => true,
                    'next_step' => 'Ya hay una solicitud pendiente para esta propiedad; un asesor la confirma.'];
            }
            if ($open->count() >= self::MAX_OPEN_PER_DAY) {
                throw new ToolError('VALIDATION_ERROR', 'Ya hay varias solicitudes pendientes; un asesor se va a comunicar.');
            }
            $this->contacts->fill($context, $arguments, $now);
            $publicId = (string) Str::uuid();
            $id = (int) DB::table('visit_requests')->insertGetId([
                'tenant_id' => $context->tenantId, 'public_id' => $publicId, 'conversation_id' => $context->conversationId,
                'contact_id' => $context->contactId, 'property_id' => $propertyId,
                'preferred_slots_json' => json_encode($slots, JSON_THROW_ON_ERROR),
                'note' => isset($arguments['note']) ? mb_substr($arguments['note'], 0, 1000) : null, 'status' => 'REQUESTED',
            ]);
            DB::table('domain_outbox')->insert([
                'tenant_id' => $context->tenantId, 'aggregate_type' => 'VISIT_REQUEST', 'aggregate_id' => $id,
                'event_type' => 'VISIT_REQUESTED', 'idempotency_key' => 'visit-request:'.$publicId,
                'payload_json' => json_encode(['schema_version' => 1, 'visit_request_id' => $id, 'property_id' => $propertyId,
                    'conversation_id' => $context->conversationId], JSON_THROW_ON_ERROR),
                'status' => 'PENDING', 'available_at' => $now,
            ]);

            return ['request_id' => $publicId, 'status' => 'REQUESTED', 'confirmed' => false,
                'next_step' => 'Un asesor revisa disponibilidad y confirma por este medio.'];
        });
    }

    /** @param array{start: string, end: string, timezone: string} $slot
     * @return array{start_utc: string, end_utc: string, timezone: string} */
    private function slot(array $slot): array
    {
        try {
            $start = CarbonImmutable::parse($slot['start'], $slot['timezone']);
            $end = CarbonImmutable::parse($slot['end'], $slot['timezone']);
        } catch (\Throwable) {
            throw new ToolError('VALIDATION_ERROR', 'Franja horaria inválida.');
        }
        $now = CarbonImmutable::now('UTC');
        if ($start->lessThan($now->addMinutes(self::MIN_LEAD_MINUTES)) || $start->greaterThan($now->addDays(self::MAX_DAYS_AHEAD))) {
            throw new ToolError('VALIDATION_ERROR', 'La franja debe empezar al menos en una hora y dentro de los próximos '.self::MAX_DAYS_AHEAD.' días.');
        }
        if (! $end->greaterThan($start) || $start->diffInMinutes($end) > self::MAX_SLOT_HOURS * 60) {
            throw new ToolError('VALIDATION_ERROR', 'La franja debe terminar después de empezar y durar como máximo '.self::MAX_SLOT_HOURS.' horas.');
        }

        return ['start_utc' => $start->utc()->toIso8601String(), 'end_utc' => $end->utc()->toIso8601String(), 'timezone' => $slot['timezone']];
    }
}
