<?php

namespace App\Domain\Inventory\Http\Controllers;

use App\Domain\Inventory\Http\Requests\PropertyIndexRequest;
use App\Domain\Inventory\Http\Requests\StorePropertyFeatureRequest;
use App\Domain\Inventory\Http\Requests\UpdatePropertyFeatureRequest;
use App\Domain\Inventory\Http\Resources\PropertyFeatureResource;
use App\Domain\Inventory\Policies\PropertyFeaturePolicy;
use App\Domain\Tenancy\TenantContext;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Http\Response;

final class AdminPropertyFeatureController extends InventoryController
{
    public function __construct(
        TenantContext $tenantContext,
        private readonly PropertyFeaturePolicy $policy,
    ) {
        parent::__construct($tenantContext);
    }

    public function index(PropertyIndexRequest $request, string $property): AnonymousResourceCollection
    {
        $model = $this->findProperty($property);
        $this->authorizeAction($this->policy->viewAny($this->user($request), $model));

        return PropertyFeatureResource::collection($model->features()->get());
    }

    public function store(StorePropertyFeatureRequest $request, string $property): JsonResponse
    {
        $model = $this->findProperty($property);
        $this->authorizeAction($this->policy->create($this->user($request), $model));

        $feature = $model->features()->create($request->validated());

        return (new PropertyFeatureResource($feature))->response()->setStatusCode(201);
    }

    public function show(PropertyIndexRequest $request, string $property, int $feature): PropertyFeatureResource
    {
        $parent = $this->findProperty($property);
        $model = $this->findFeature($parent, $feature);
        $model->setRelation('property', $parent);
        $this->authorizeAction($this->policy->view($this->user($request), $model));

        return new PropertyFeatureResource($model);
    }

    public function update(UpdatePropertyFeatureRequest $request, string $property, int $feature): PropertyFeatureResource
    {
        $parent = $this->findProperty($property);
        $model = $this->findFeature($parent, $feature);
        $model->setRelation('property', $parent);
        $this->authorizeAction($this->policy->update($this->user($request), $model));
        $model->fill($request->validated())->save();

        return new PropertyFeatureResource($model->refresh());
    }

    public function destroy(PropertyIndexRequest $request, string $property, int $feature): Response
    {
        $parent = $this->findProperty($property);
        $model = $this->findFeature($parent, $feature);
        $model->setRelation('property', $parent);
        $this->authorizeAction($this->policy->delete($this->user($request), $model));
        $model->delete();

        return response()->noContent();
    }
}
