<?php

namespace App\Domain\AgentRuntime\Tools;

final class ConsultarPropiedad implements AgentTool
{
    public function __construct(private readonly PublicInventory $inventory) {}

    public function name(): string
    {
        return 'consultar_propiedad';
    }

    public function description(): string
    {
        return 'Devuelve el detalle vigente de una propiedad por su id (obtenido de buscar_propiedades). Si no está disponible responde NOT_FOUND.';
    }

    public function schema(): array
    {
        return [
            'type' => 'object', 'additionalProperties' => false, 'required' => ['property_id'],
            'properties' => ['property_id' => ['type' => 'string', 'format' => 'uuid']],
        ];
    }

    public function mutating(): bool
    {
        return false;
    }

    public function execute(ToolContext $context, array $arguments, ToolExecutions $executions): array
    {
        $property = $this->inventory->find($context->tenantId, $arguments['property_id'])
            ?? throw new ToolError('NOT_FOUND', 'La propiedad no está disponible.');

        return $this->inventory->detail($property);
    }
}
