<?php

namespace App\Domain\Inventory\Http\Controllers;

use App\Domain\Inventory\Http\Requests\ProjectIndexRequest;
use App\Domain\Inventory\Http\Resources\ProjectResource;
use App\Domain\Inventory\Models\Project;
use App\Domain\Inventory\Services\InventoryFilters;
use App\Domain\Tenancy\TenantContext;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;

final class PublicProjectController extends InventoryController
{
    public function __construct(
        TenantContext $tenantContext,
        private readonly InventoryFilters $filters,
    ) {
        parent::__construct($tenantContext);
    }

    public function index(ProjectIndexRequest $request): AnonymousResourceCollection
    {
        $filters = $request->validated();
        unset($filters['status']);

        $query = Project::query()
            ->where('projects.tenant_id', $this->tenantContext->id())
            ->publiclyVisible()
            ->withCount([
                'properties' => static fn ($properties) => $properties->publiclyVisible(),
            ]);

        return ProjectResource::collection(
            $this->filters->projects($query, $filters)->paginate($request->perPage())
        );
    }

    public function show(string $project): ProjectResource
    {
        $model = Project::query()
            ->where('projects.tenant_id', $this->tenantContext->id())
            ->where('public_id', $project)
            ->publiclyVisible()
            ->withCount([
                'properties' => static fn ($properties) => $properties->publiclyVisible(),
            ])
            ->firstOrFail();

        return new ProjectResource($model);
    }
}
