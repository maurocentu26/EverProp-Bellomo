<?php

namespace App\Domain\Inventory\Http\Controllers;

use App\Domain\Inventory\Models\Project;
use App\Domain\Inventory\Policies\ProjectPolicy;
use App\Domain\Inventory\Services\InventoryAccess;
use App\Domain\Inventory\Services\ProjectLanding;
use App\Domain\Tenancy\TenantContext;
use Carbon\CarbonImmutable;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

final class ProjectLandingController extends InventoryController
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
        $projects = $this->access->scopeProjects(Project::query(), $user)->orderBy('name')->limit(1001)->get();
        abort_if($projects->count() > 1000, 503, 'El catálogo supera el límite del contrato 1.0.');

        return response()->json(['data' => $projects->map(fn ($p) => [
            'public_id' => $p->public_id, 'name' => $p->name,
            'can_edit' => $this->policy->update($user, $p), 'can_publish' => $this->policy->publish($user, $p),
        ])])->header('Cache-Control', 'private, no-store');
    }

    public function show(Request $request, string $project): JsonResponse
    {
        $model = $this->findProject($project);
        $this->authorizeAction($this->policy->view($this->user($request), $model));

        return response()->json(['data' => $this->landing->configuration($model), 'assets' => $this->landing->assets($model)])
            ->header('Cache-Control', 'private, no-store');
    }

    public function update(Request $request, string $project): JsonResponse
    {
        $model = $this->findProject($project);
        $user = $this->user($request);
        $this->authorizeAction($this->policy->update($user, $model));
        try {
            $data = DB::transaction(function () use ($model, $user, $request): array {
                // Lock the parent too: the first save has no presentation row to lock yet.
                Project::query()->where('tenant_id', $model->tenant_id)->whereKey($model->id)->lockForUpdate()->firstOrFail();
                $row = DB::table('project_landing')->where('tenant_id', $model->tenant_id)->where('project_id', $model->id)->first();
                $data = $this->landing->validate($model, $request->all(), $row);
                if ($row === null || $data['is_visible'] || (bool) $row->is_visible) {
                    $this->authorizeAction($this->policy->publish($user, $model));
                }
                $slug = $data['slug'] ?: null;
                $visible = $data['is_visible'];
                $order = $data['sort_order'];
                unset($data['slug'], $data['is_visible'], $data['sort_order']);
                DB::table('project_landing')->updateOrInsert(['tenant_id' => $model->tenant_id, 'project_id' => $model->id], [
                    'slug' => $slug, 'is_visible' => $visible, 'sort_order' => $order,
                    'content' => json_encode($data, JSON_THROW_ON_ERROR), 'updated_at' => now(),
                    'first_published_at' => $row->first_published_at ?? ($visible ? now() : null),
                ]);

                return $this->landing->configuration($model);
            });
        } catch (UniqueConstraintViolationException) {
            throw ValidationException::withMessages(['slug' => 'Esta URL ya pertenece a otro proyecto.']);
        }

        return response()->json(['data' => $data])->header('Cache-Control', 'private, no-store');
    }

    public function snapshot(): JsonResponse
    {
        $rows = DB::table('project_landing as l')->join('projects as p', function ($join): void {
            $join->on('p.id', '=', 'l.project_id')->on('p.tenant_id', '=', 'l.tenant_id');
        })->where('l.tenant_id', $this->tenantContext->id())->where('l.is_visible', true)
            ->whereNull('p.deleted_at')->orderBy('l.sort_order')->orderBy('p.public_id')->limit(1001)
            ->get(['l.*', 'p.public_id']);
        abort_if($rows->count() > 1000, 503, 'El catálogo supera el límite del contrato 1.0.');
        $data = $rows->map(static function ($row): array {
            return array_merge(json_decode($row->content, true, flags: JSON_THROW_ON_ERROR), [
                'public_id' => $row->public_id, 'slug' => $row->slug, 'sort_order' => (int) $row->sort_order,
                'updated_at' => CarbonImmutable::parse($row->updated_at, 'UTC')->toISOString(),
            ]);
        });

        return response()->json(['schema_version' => '1.0', 'data' => $data])->header('Cache-Control', 'no-store');
    }
}
