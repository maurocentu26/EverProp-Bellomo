<?php

namespace App\Domain\Inventory\Http\Controllers;

use App\Domain\Inventory\Http\Requests\PropertyIndexRequest;
use App\Domain\Inventory\Http\Resources\PropertyResource;
use App\Domain\Inventory\Models\Property;
use App\Domain\Inventory\Services\InventoryFilters;
use App\Domain\Tenancy\TenantContext;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;

final class PublicPropertyController extends InventoryController
{
    public function __construct(
        TenantContext $tenantContext,
        private readonly InventoryFilters $filters,
    ) {
        parent::__construct($tenantContext);
    }

    public function index(PropertyIndexRequest $request): AnonymousResourceCollection
    {
        $filters = $request->validated();
        unset($filters['status'], $filters['project_id']);

        $query = Property::query()
            ->where('properties.tenant_id', $this->tenantContext->id())
            ->publiclyVisible()
            ->with([
                'project',
                'features' => static fn ($features) => $features->where('is_filterable', true),
                'media',
            ]);

        return PropertyResource::collection(
            $this->filters->properties($query, $filters)->paginate($request->perPage())
        );
    }

    public function show(string $property): PropertyResource
    {
        $model = Property::query()
            ->where('properties.tenant_id', $this->tenantContext->id())
            ->where('public_id', $property)
            ->publiclyVisible()
            ->with([
                'project',
                'features' => static fn ($features) => $features->where('is_filterable', true),
                'media',
            ])
            ->firstOrFail();

        return new PropertyResource($model);
    }
}
