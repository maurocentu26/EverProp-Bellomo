<?php

namespace App\Domain\Inventory\Http\Controllers;

use App\Domain\Inventory\Http\Requests\ProjectIndexRequest;
use App\Domain\Inventory\Http\Requests\PublishProjectRequest;
use App\Domain\Inventory\Http\Requests\StoreProjectRequest;
use App\Domain\Inventory\Http\Requests\UpdateProjectRequest;
use App\Domain\Inventory\Http\Resources\ProjectResource;
use App\Domain\Inventory\Models\Project;
use App\Domain\Inventory\Policies\ProjectPolicy;
use App\Domain\Inventory\Services\InventoryAccess;
use App\Domain\Inventory\Services\InventoryFilters;
use App\Domain\Tenancy\TenantContext;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Http\Response;
use Illuminate\Validation\ValidationException;

final class AdminProjectController extends InventoryController
{
    public function __construct(
        TenantContext $tenantContext,
        private readonly InventoryAccess $access,
        private readonly InventoryFilters $filters,
        private readonly ProjectPolicy $policy,
    ) {
        parent::__construct($tenantContext);
    }

    public function index(ProjectIndexRequest $request): AnonymousResourceCollection
    {
        $user = $this->user($request);
        $this->authorizeAction($this->policy->viewAny($user));

        $query = $this->access->scopeProjects(Project::query(), $user)
            ->withCount('properties');

        return ProjectResource::collection(
            $this->filters->projects($query, $request->validated())->paginate($request->perPage())
        );
    }

    public function store(StoreProjectRequest $request): JsonResponse
    {
        $this->authorizeAction($this->policy->create($this->user($request)));

        $project = Project::query()->create($request->validated());
        $project->refresh()->loadCount('properties');

        return (new ProjectResource($project))->response()->setStatusCode(201);
    }

    public function show(ProjectIndexRequest $request, string $project): ProjectResource
    {
        $model = $this->findProject($project);
        $this->authorizeAction($this->policy->view($this->user($request), $model));

        return new ProjectResource($model->loadCount('properties'));
    }

    public function update(UpdateProjectRequest $request, string $project): ProjectResource
    {
        $model = $this->findProject($project);
        $this->authorizeAction($this->policy->update($this->user($request), $model));

        $model->fill($request->validated())->save();

        return new ProjectResource($model->refresh()->loadCount('properties'));
    }

    public function publish(PublishProjectRequest $request, string $project): ProjectResource
    {
        $model = $this->findProject($project);
        $this->authorizeAction($this->policy->publish($this->user($request), $model));

        $model->update(['status' => $request->validated('status')]);

        return new ProjectResource($model->refresh()->loadCount('properties'));
    }

    public function destroy(ProjectIndexRequest $request, string $project): Response
    {
        $model = $this->findProject($project);
        $this->authorizeAction($this->policy->delete($this->user($request), $model));

        if ($model->properties()->exists()) {
            throw ValidationException::withMessages([
                'project' => ['A project with properties cannot be deleted.'],
            ]);
        }

        $model->delete();

        return response()->noContent();
    }
}
