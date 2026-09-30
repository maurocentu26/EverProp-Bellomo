<?php

namespace App\Domain\AgentRuntime\Tools;

final class BuscarPropiedades implements AgentTool
{
    public function __construct(private readonly PublicInventory $inventory) {}

    public function name(): string
    {
        return 'buscar_propiedades';
    }

    public function description(): string
    {
        return 'Busca propiedades publicadas y disponibles del inventario actual. Usala antes de mencionar cualquier propiedad, precio o disponibilidad. '
            .'Para filtrar por presupuesto hace falta la moneda; no convierte monedas. unit_code busca un código exacto.';
    }

    public function schema(): array
    {
        return [
            'type' => 'object', 'additionalProperties' => false, 'required' => [],
            'properties' => [
                'operation' => ['type' => 'string', 'enum' => ['SALE', 'RENT']],
                'category' => ['type' => 'string', 'enum' => ['LOT', 'GARAGE', 'LOCAL', 'TRADITIONAL', 'APARTMENT', 'HOUSE']],
                'city' => ['type' => 'string', 'maxLength' => 160, 'minLength' => 2],
                'project_id' => ['type' => 'string', 'format' => 'uuid'],
                'unit_code' => ['type' => 'string', 'maxLength' => 80, 'minLength' => 1],
                'budget' => [
                    'type' => 'object', 'additionalProperties' => false, 'required' => ['amount', 'currency'],
                    'properties' => [
                        'amount' => ['type' => 'string', 'format' => 'decimal'],
                        'currency' => ['type' => 'string', 'enum' => ['ARS', 'USD']],
                    ],
                ],
                'limit' => ['type' => 'integer', 'minimum' => 1, 'maximum' => PublicInventory::PAGE_MAX],
            ],
        ];
    }

    public function mutating(): bool
    {
        return false;
    }

    public function execute(ToolContext $context, array $arguments, ToolExecutions $executions): array
    {
        $query = $this->inventory->query($context->tenantId)
            ->when(isset($arguments['operation']), fn ($q) => $q->where('p.operation', $arguments['operation']))
            ->when(isset($arguments['category']), fn ($q) => $q->where('p.category', $arguments['category']))
            ->when(isset($arguments['city']), fn ($q) => $q->where('p.city', 'like', '%'.addcslashes(trim($arguments['city']), '%_\\').'%'))
            ->when(isset($arguments['project_id']), fn ($q) => $q->where('pr.public_id', $arguments['project_id']))
            ->when(isset($arguments['unit_code']), fn ($q) => $q->where('p.code', trim($arguments['unit_code'])))
            // Budget: same currency only, priced units only. No FX conversion is ever implied.
            ->when(isset($arguments['budget']), fn ($q) => $q->where('p.currency_code', $arguments['budget']['currency'])
                ->whereNotNull('p.price')->where('p.price', '<=', $arguments['budget']['amount']));

        $limit = $arguments['limit'] ?? 5;
        $rows = $query->orderByDesc('p.updated_at')->orderBy('p.id')->limit($limit + 1)->get($this->inventory->columns());

        return [
            'items' => $rows->take($limit)->map(fn ($p) => $this->inventory->summary($p))->values()->all(),
            'more_available' => $rows->count() > $limit,
        ];
    }
}
