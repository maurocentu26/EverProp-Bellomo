<?php

namespace App\Domain\AgentRuntime\Tools;

use Illuminate\Database\UniqueConstraintViolationException;
use Throwable;

/**
 * The only door between the model and the domain (ADR D07/D09). Closed list of tools; schema
 * validation before anything else; server context injected; errors normalized without stack,
 * SQL, secrets or foreign ids. The model never chooses tenant, contact, lead or idempotency key.
 */
final class ToolGateway
{
    public const SCHEMA_VERSION = 1;

    /** @var array<string, AgentTool> */
    private array $tools = [];

    public function __construct(
        private readonly SchemaValidator $validator,
        private readonly ToolExecutions $executions,
        private readonly PublicInventory $inventory,
        BuscarPropiedades $buscar,
        ConsultarPropiedad $consultar,
        RegistrarInteres $interes,
        SolicitarVisita $visita,
        DerivarAAsesor $derivar,
    ) {
        foreach ([$buscar, $consultar, $interes, $visita, $derivar] as $tool) {
            $this->tools[$tool->name()] = $tool;
        }
    }

    /** @return list<array{name: string, description: string, input_schema: array<string, mixed>}> */
    public function definitions(): array
    {
        return array_values(array_map(fn (AgentTool $t): array => [
            'name' => $t->name(), 'description' => $t->description(), 'input_schema' => $t->schema(),
        ], $this->tools));
    }

    /** @return array<string, mixed> envelope {ok, data, meta} | {ok:false, error} */
    public function execute(ToolContext $context, string $name, mixed $arguments): array
    {
        $tool = $this->tools[$name] ?? null;
        if ($tool === null) {
            return $this->error('VALIDATION_ERROR', 'Herramienta inexistente.', $context);
        }
        if (($violation = $this->validator->validate($tool->schema(), $arguments)) !== null) {
            return $this->error('VALIDATION_ERROR', $violation, $context);
        }
        /** @var array<string, mixed> $arguments */
        try {
            if (array_intersect_key($tool->schema()['properties'], PublicInventory::PROPERTY_REF) === PublicInventory::PROPERTY_REF) {
                $arguments = $this->propertyReference($context, $arguments);
            }
            if ($tool->mutating()) {
                $key = $this->executions->key($context, $name, $arguments);
                if (($stored = $this->executions->stored($context, $name, $key)) !== null) {
                    return $this->ok($stored, $context, persisted: true, replayed: true);
                }
                try {
                    return $this->ok($tool->execute($context, $arguments, $this->executions), $context, persisted: true, replayed: false);
                } catch (UniqueConstraintViolationException $e) {
                    // A concurrent twin committed first: same key, same effect.
                    return $this->ok($this->replay($context, $name, $key, $e), $context, persisted: true, replayed: true);
                }
            }

            return $this->ok($tool->execute($context, $arguments, $this->executions), $context, persisted: false, replayed: false);
        } catch (ToolError $e) {
            return $this->error($e->errorCode, $e->getMessage(), $context, $e->retryable);
        } catch (Throwable $e) {
            report($e);

            return $this->error('DEPENDENCY_UNAVAILABLE', 'No pude completar la operación.', $context, true);
        }
    }

    /**
     * Exactly one property reference. A unit code becomes the property id here, before the idempotency
     * key, so naming the unit by id or by code is the same request (one effect, replayable).
     *
     * @param  array<string, mixed>  $arguments
     * @return array<string, mixed>
     */
    private function propertyReference(ToolContext $context, array $arguments): array
    {
        if (isset($arguments['property_id']) === isset($arguments['unit_code'])) {
            throw new ToolError('VALIDATION_ERROR', 'Indicá property_id o unit_code, uno solo.');
        }
        if (isset($arguments['unit_code'])) {
            $arguments['property_id'] = $this->inventory->publicIdForCode($context->tenantId, (string) $arguments['unit_code'])
                ?? throw new ToolError('NOT_FOUND', 'La propiedad no está disponible.');
            unset($arguments['unit_code']);
        }

        return $arguments;
    }

    /** @return array<string, mixed> */
    private function replay(ToolContext $context, string $name, string $key, Throwable $cause): array
    {
        return $this->executions->stored($context, $name, $key) ?? throw $cause;
    }

    /** @param array<string, mixed> $data
     * @return array<string, mixed> */
    private function ok(array $data, ToolContext $context, bool $persisted, bool $replayed): array
    {
        return ['ok' => true, 'data' => $data, 'meta' => ['schema_version' => self::SCHEMA_VERSION, 'persisted' => $persisted,
            'replayed' => $replayed, 'trace_id' => $context->traceId]];
    }

    /** @return array<string, mixed> */
    private function error(string $code, string $message, ToolContext $context, bool $retryable = false): array
    {
        return ['ok' => false, 'error' => ['code' => $code, 'message' => $message, 'retryable' => $retryable], 'meta' => ['trace_id' => $context->traceId]];
    }
}
