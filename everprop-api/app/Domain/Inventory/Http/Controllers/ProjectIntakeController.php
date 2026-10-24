<?php

namespace App\Domain\Inventory\Http\Controllers;

use App\Domain\Inventory\Http\Requests\StoreProjectRequest;
use App\Domain\Inventory\Http\Requests\StorePropertyRequest;
use App\Domain\Inventory\Http\Resources\ProjectResource;
use App\Domain\Inventory\Http\Resources\PropertyResource;
use App\Domain\Inventory\Models\Project;
use App\Domain\Inventory\Models\Property;
use App\Domain\Inventory\Policies\ProjectPolicy;
use App\Domain\Inventory\Policies\PropertyPolicy;
use App\Domain\Inventory\Services\InventoryAccess;
use App\Domain\Inventory\Services\ProjectLanding;
use App\Domain\Tenancy\TenantContext;
use Carbon\CarbonImmutable;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Validator;
use Illuminate\Validation\ValidationException;

final class ProjectIntakeController extends InventoryController
{
    public function __construct(TenantContext $tenantContext, private readonly ProjectPolicy $policy,
        private readonly InventoryAccess $access, private readonly ProjectLanding $landing)
    {
        parent::__construct($tenantContext);
    }

    public function index(Request $request): JsonResponse
    {
        $user = $this->user($request);
        $this->authorizeAction($this->policy->viewAny($user));
        $projects = $this->access->scopeProjects(Project::query(), $user)
            ->whereExists(fn ($intake) => $intake->selectRaw('1')->from('project_intakes')
                ->where('project_intakes.tenant_id', $this->tenantContext->id())
                ->whereColumn('project_intakes.project_id', 'projects.id'))
            ->leftJoin('project_landing as landing', fn ($join) => $join->on('landing.project_id', '=', 'projects.id')
                ->on('landing.tenant_id', '=', 'projects.tenant_id'))
            ->select('projects.*', 'landing.is_visible as web_visible', 'landing.updated_at as web_updated_at')
            ->orderByRaw('GREATEST(projects.updated_at, COALESCE(landing.updated_at, projects.updated_at)) DESC')
            ->orderBy('projects.id')->limit(1001)->get();
        abort_if($projects->count() > 1000, 503, 'El listado supera los 1000 ingresos; requiere paginación.');

        return response()->json(['data' => $projects->map(fn (Project $project): array => [
            'public_id' => $project->public_id, 'name' => $project->name, 'status' => $project->status->value,
            'is_visible' => (bool) $project->getAttribute('web_visible'),
            'updated_at' => max($project->updated_at?->toISOString() ?? '',
                CarbonImmutable::parse($project->getAttribute('web_updated_at') ?? $project->updated_at, 'UTC')->toISOString()),
            'can_edit' => $this->policy->update($user, $project), 'can_publish' => $this->policy->publish($user, $project),
        ]), 'can_create' => $this->policy->create($user)])->header('Cache-Control', 'private, no-store');
    }

    public function show(Request $request, string $project): JsonResponse
    {
        $model = $this->findProject($project);
        $this->authorizeAction($this->policy->view($this->user($request), $model));
        abort_unless(DB::table('project_intakes')->where('tenant_id', $this->tenantContext->id())
            ->where('project_id', $model->id)->exists(), 404);

        return $this->response($request, $model);
    }

    public function store(Request $request): JsonResponse
    {
        $this->authorizeAction($this->policy->create($this->user($request)));
        $key = $request->validate(['request_key' => ['required', 'uuid']])['request_key'];
        $payload = $request->except('request_key');
        ksort($payload);
        $hash = hash('sha256', json_encode($payload, JSON_THROW_ON_ERROR));
        try {
            [$model, $created] = DB::transaction(function () use ($request, $key, $payload, $hash): array {
                $identity = ['tenant_id' => $this->tenantContext->id(), 'request_key' => strtolower($key)];
                // The unique key also serializes concurrent retries before a project exists.
                $created = DB::table('project_intakes')->insertOrIgnore($identity + ['payload_hash' => $hash]) === 1;
                $intake = DB::table('project_intakes')->where($identity)->lockForUpdate()->first();
                abort_if($intake === null, 500, 'No se pudo registrar el ingreso.');
                abort_unless(hash_equals($intake->payload_hash, $hash), 409, 'La clave de ingreso ya fue usada con otros datos.');
                if (! $created) {
                    $project = Project::query()->where('tenant_id', $this->tenantContext->id())->whereKey($intake->project_id)->firstOrFail();
                    $this->authorizeAction($this->policy->view($this->user($request), $project));

                    return [$project, false];
                }
                $rules = StoreProjectRequest::createFrom($request)->rules();
                $rules['progress'] = ['sometimes', 'nullable', 'integer', 'min:0', 'max:100'];
                $data = Validator::make($payload, $rules)->validate();
                $data['status'] ??= 'UNKNOWN';
                $project = Project::query()->create($data)->refresh();
                $content = $this->landing->configuration($project);
                unset($content['public_id'], $content['slug'], $content['is_visible'], $content['sort_order'], $content['updated_at']);
                DB::table('project_landing')->insert([
                    'tenant_id' => $this->tenantContext->id(), 'project_id' => $project->id,
                    'is_visible' => false, 'sort_order' => 0, 'content' => json_encode($content, JSON_THROW_ON_ERROR),
                ]);
                DB::table('project_intakes')->where($identity)->update(['project_id' => $project->id]);

                return [$project, true];
            }, 3);
        } catch (UniqueConstraintViolationException) {
            throw ValidationException::withMessages(['code' => 'Este código ya pertenece a otro proyecto.']);
        }

        return $this->response($request, $model, $created ? 201 : 200);
    }

    public function storeUnit(Request $request, string $project): JsonResponse
    {
        $model = $this->findProject($project);
        $user = $this->user($request);
        $this->authorizeAction($this->policy->update($user, $model));
        $propertyPolicy = app(PropertyPolicy::class);
        $this->authorizeAction($propertyPolicy->create($user) && $propertyPolicy->placeInProject($user, $model));
        abort_unless(DB::table('project_intakes')->where('tenant_id', $this->tenantContext->id())->where('project_id', $model->id)->exists(), 404);
        $key = $request->validate(['request_key' => ['required', 'uuid'], 'project_id' => ['prohibited']])['request_key'];
        $payload = $request->except('request_key');
        ksort($payload);
        $hash = hash('sha256', json_encode($payload, JSON_THROW_ON_ERROR));
        try {
            [$property, $created] = DB::transaction(function () use ($request, $model, $key, $hash): array {
                $identity = ['tenant_id' => $this->tenantContext->id(), 'request_key' => strtolower($key)];
                $created = DB::table('project_intake_units')->insertOrIgnore($identity + ['project_id' => $model->id, 'payload_hash' => $hash]) === 1;
                $row = DB::table('project_intake_units')->where($identity)->lockForUpdate()->first();
                abort_if($row === null, 500, 'No se pudo registrar la unidad.');
                abort_unless((int) $row->project_id === $model->id && hash_equals($row->payload_hash, $hash), 409,
                    'La clave de unidad ya fue usada con otros datos o proyecto.');
                if (! $created) {
                    $property = Property::query()->where('tenant_id', $this->tenantContext->id())
                        ->where('project_id', $model->id)->whereKey($row->property_id)->firstOrFail();
                    $this->authorizeAction(app(PropertyPolicy::class)->view($this->user($request), $property));

                    return [$property, false];
                }
                $store = StorePropertyRequest::createFrom($request);
                $store->merge(['project_id' => $model->id, 'status' => $request->input('status', 'UNKNOWN')]);
                $store->setContainer(app())->setRedirector(app('redirect'));
                $store->validateResolved();
                $response = app(AdminPropertyController::class)->store($store);
                $publicId = $response->getData(true)['data']['public_id'];
                $property = Property::query()->where('tenant_id', $this->tenantContext->id())
                    ->where('project_id', $model->id)->where('public_id', $publicId)->firstOrFail();
                DB::table('project_intake_units')->where($identity)->update(['property_id' => $property->id]);

                return [$property, true];
            }, 3);
        } catch (UniqueConstraintViolationException) {
            throw ValidationException::withMessages(['code' => 'Este código ya pertenece a otra unidad.']);
        }

        return (new PropertyResource($property->load(['project', 'features', 'media'])))->response()
            ->setStatusCode($created ? 201 : 200)->header('Cache-Control', 'private, no-store');
    }

    private function response(Request $request, Project $project, int $status = 200): JsonResponse
    {
        $user = $this->user($request);

        return response()->json(['data' => [
            'project' => (new ProjectResource($project->loadCount('properties')))->resolve($request),
            'landing' => $this->landing->configuration($project), 'assets' => $this->landing->assets($project),
            'can_edit' => $this->policy->update($user, $project), 'can_publish' => $this->policy->publish($user, $project),
        ]], $status)->header('Cache-Control', 'private, no-store');
    }
}
