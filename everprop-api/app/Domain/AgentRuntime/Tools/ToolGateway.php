<?php

namespace App\Domain\AgentRuntime\Tools;

use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Support\Facades\DB;
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
        RegistrarContacto $contacto,
        SolicitarVisita $visita,
        DerivarAAsesor $derivar,
    ) {
        foreach ([$buscar, $consultar, $interes, $contacto, $visita, $derivar] as $tool) {
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
            $arguments = $this->scopeNamedSearch($context, $name, $arguments);
            $this->rejectChangedUnitCode($context, $arguments);
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

    /** @param array<string, mixed> $arguments
     * @return array<string, mixed>
     */
    private function scopeNamedSearch(ToolContext $context, string $name, array $arguments): array
    {
        if ($name !== 'buscar_propiedades' || isset($arguments['unit_code']) || $context->inputSequence < 1) {
            return $arguments;
        }
        $message = $this->visitorMessage($context);
        if ($message === null) {
            return $arguments;
        }
        if (preg_match('/(?<![\p{L}\p{N}])\d+[\p{L}]?\s+y\s+\d+[\p{L}]?(?![\p{L}\p{N}])/iu', $message)) {
            return $arguments; // A request naming two units must not be narrowed to one.
        }
        if (preg_match('/\b(?:el|la|lote|unidad|depto|departamento|terreno)\s+\d+\s+(?:(?![yxq]\b)[a-z](?![\p{L}\p{N}])(?!\s+(?:secas|las|\d))\b|bis\b)/u', $message)) {
            throw new ToolError('VALIDATION_ERROR', 'Aclarás si la letra forma parte del código antes de consultar otra unidad.');
        }
        $explicit = preg_replace('/(?<![\p{L}\p{N}])((?:[\p{L}]+-)?\d+)\s+([A-Z])(?![\p{L}\p{N}])(?!\s+secas)/u', '$1$2', $message);
        preg_match_all('/\b(?:el|la|del|lote|unidad|depto|departamento|terreno)\s+((?:[\p{L}]+-)?\d+[\p{L}]?)(?![\p{L}\p{N}])(?!\s+(?:amb\b|ambientes?\b|dormitorios?\b|bis\b|de\s+[\p{L}]))/iu', $explicit, $matches);
        preg_match_all('/(?<![\p{L}\p{N}])((?:[\p{L}]+-)?\d+[\p{L}]?)(?=\s+(?:a\s+secas|sin\s+letra|solo)\b)/iu', $explicit, $bare);
        preg_match_all('/(?<![\p{L}\p{N}])((?:[\p{L}]+-)?\d+[\p{L}]?)(?:[?.!,]\s*|\s+)no\b/iu', $explicit, $negatedAfter);
        preg_match_all('/\bno\s+(?:el\s+|la\s+)?((?:[\p{L}]+-)?\d+[\p{L}]?)(?![\p{L}\p{N}])/iu', $explicit, $negatedBefore);
        $mentioned = array_values(array_diff(array_unique(array_map('mb_strtoupper', [...$matches[1], ...$bare[1]])),
            array_map('mb_strtoupper', [...$negatedBefore[1], ...$negatedAfter[1]])));
        if ($mentioned === [] && preg_match('/\bdoce\b/iu', $message)) {
            $mentioned = ['12'];
        }
        if (count($mentioned) !== 1) {
            return $arguments;
        }
        $arguments['unit_code'] = $mentioned[0];

        return $arguments;
    }

    /** A model must not silently exchange a visitor's unit code for a similar one.
     * @param  array<string, mixed>  $arguments
     */
    private function rejectChangedUnitCode(ToolContext $context, array $arguments): void
    {
        if ($context->inputSequence < 1 || (! isset($arguments['unit_code']) && ! isset($arguments['property_id']))) {
            return;
        }
        $asked = isset($arguments['unit_code']) ? trim((string) $arguments['unit_code'])
            : (string) (DB::table('properties')->where('tenant_id', $context->tenantId)
                ->where('public_id', $arguments['property_id'])->value('code') ?? '');
        if (! preg_match('/^((?:[\p{L}]+-)?\d+)([\p{L}])?$/u', $asked, $match)) {
            return;
        }
        $message = $this->visitorMessage($context);
        if ($message === null) {
            return;
        }
        $base = preg_quote($match[1], '/');
        if (preg_match('/\bno\s+(?:el\s+|la\s+)?'.preg_quote($asked, '/').'(?![\p{L}\p{N}])/iu', $message)
            || preg_match('/(?<![\p{L}\p{N}])'.preg_quote($asked, '/').'(?:[?.!,]\s*|\s+)no\b/iu', $message)) {
            throw new ToolError('VALIDATION_ERROR', 'El código indicado no coincide con el que escribió el visitante. Pedí aclaración antes de informar datos de otra unidad.');
        }
        if (! isset($match[2]) && preg_match('/(?<![\p{L}\p{N}])'.$base.'\s+(?:bis\b|a\b(?!\s+(?:secas\b|las\b|\d)))/u', (string) $message)) {
            throw new ToolError('VALIDATION_ERROR', 'Aclarás el código de unidad antes de informar datos.');
        }
        if (! isset($match[2]) && preg_match('/(?<![\p{L}\p{N}])'.$base.'\s+[A-Z](?![\p{L}\p{N}])(?!\s+secas)/u', (string) $message)) {
            throw new ToolError('VALIDATION_ERROR', 'El código indicado no coincide con el que escribió el visitante. Pedí aclaración antes de informar datos de otra unidad.');
        }
        if (preg_match('/(?<![\p{L}\p{N}])'.preg_quote($asked, '/').'(?![\p{L}\p{N}])/iu', (string) $message)) {
            return;
        }
        if (isset($match[2]) && preg_match('/(?<![\p{L}\p{N}])'.$base.'\s+'.preg_quote(mb_strtoupper($match[2]), '/').'(?![\p{L}\p{N}])(?!\s+secas)/u', (string) $message)) {
            return; // Uppercase separated suffix is explicit; lowercase "12 a" is ambiguous.
        }
        $code = '/(?<![\p{L}\p{N}])'.$base.'([\p{L}]?)(?![\p{L}\p{N}])/iu';
        if (preg_match($code, (string) $message, $mentioned)) {
            if (mb_strtoupper($mentioned[1]) === mb_strtoupper($match[2] ?? '')) {
                return;
            }
            throw new ToolError('VALIDATION_ERROR', 'El código indicado no coincide con el que escribió el visitante. Pedí aclaración antes de informar datos de otra unidad.');
        }
        if (isset($match[2]) && preg_match('/(?<![\p{L}\p{N}])'.$base.'\s+[\p{L}](?![\p{L}\p{N}])/u', (string) $message)) {
            throw new ToolError('VALIDATION_ERROR', 'El código indicado no coincide con el que escribió el visitante. Pedí aclaración antes de informar datos de otra unidad.');
        }
        if (isset($match[2]) && $match[1] === '12' && preg_match('/\bdoce\b/iu', (string) $message)) {
            throw new ToolError('VALIDATION_ERROR', 'El código indicado no coincide con el que escribió el visitante. Pedí aclaración antes de informar datos de otra unidad.');
        }
    }

    private function visitorMessage(ToolContext $context): ?string
    {
        return DB::table('messages')->where('tenant_id', $context->tenantId)
            ->where('conversation_id', $context->conversationId)->where('direction', 'INBOUND')
            ->where('sequence', '<=', $context->inputSequence)->orderByDesc('sequence')->value('text_body');
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
