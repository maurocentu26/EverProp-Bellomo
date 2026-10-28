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

        $landingRows = DB::table('project_landing')
            ->where('tenant_id', $this->tenantContext->id())
            ->whereIn('project_id', $projects->pluck('id'))
            ->get()
            ->keyBy('project_id');

        return response()->json(['data' => $projects->map(function ($p) use ($user, $landingRows) {
            $landing = $landingRows->get($p->id);
            $content = $landing ? json_decode($landing->content, true) : null;

            return [
                'public_id' => $p->public_id,
                'name' => $content['name'] ?? $p->name,
                'can_edit' => $this->policy->update($user, $p),
                'can_publish' => $this->policy->publish($user, $p),
                'slug' => $landing->slug ?? '',
                'is_visible' => (bool) ($landing->is_visible ?? false),
                'sort_order' => (int) ($landing->sort_order ?? 0),
                'summary' => $content['summary'] ?? '',
                'description' => $content['description'] ?? ($p->description ?? ''),
                'category' => $content['category'] ?? match ($p->project_type->value) {
                    'BUILDING' => 'HUASI',
                    'LAND_DEVELOPMENT' => 'LAND_DEVELOPMENT',
                    default => 'COMMERCIAL',
                },
                'status_label' => $content['status_label'] ?? null,
                'is_featured' => (bool) ($content['is_featured'] ?? false),
                'featured_order' => (int) ($content['featured_order'] ?? 0),
                'location' => $content['location'] ?? [
                    'city' => $p->city,
                    'province' => $p->province,
                    'address' => $p->address,
                ],
                'cover' => $content['cover'] ?? null,
                'logo' => $content['logo'] ?? null,
                'gallery' => $content['gallery'] ?? [],
                'features' => $content['features'] ?? [],
            ];
        })])->header('Cache-Control', 'private, no-store');
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

    public function assets(Request $request, string $project): JsonResponse
    {
        $model = $this->findProject($project);
        $this->authorizeAction($this->policy->view($this->user($request), $model));

        return response()->json(['data' => $this->landing->assets($model)])
            ->header('Cache-Control', 'private, no-store');
    }

    public function createUploadUrl(Request $request, string $project): JsonResponse
    {
        $model = $this->findProject($project);
        $user = $this->user($request);
        $this->authorizeAction($this->policy->update($user, $model));

        $validated = $request->validate([
            'filename' => ['required', 'string', 'max:255'],
            'mime_type' => ['required', 'string', 'in:image/jpeg,image/png,image/webp,image/avif,application/pdf'],
            'file_size' => ['required', 'integer', 'min:1', 'max:15728640'],
        ]);

        $ticket = $this->landing->createUploadUrl(
            $model,
            $this->tenantContext->tenant()->public_id,
            $validated['filename'],
            $validated['mime_type'],
            (int) $validated['file_size']
        );

        return response()->json(['data' => $ticket], 201)
            ->header('Cache-Control', 'private, no-store');
    }

    public function confirmUpload(Request $request, string $project): JsonResponse
    {
        $model = $this->findProject($project);
        $user = $this->user($request);
        $this->authorizeAction($this->policy->update($user, $model));

        $validated = $request->validate([
            'upload_token' => ['required', 'string', 'max:8192'],
            'url' => ['required', 'string', 'max:2048'],
            'mime_type' => ['required', 'string', 'in:image/jpeg,image/png,image/webp,image/avif,application/pdf'],
            'title' => ['required', 'string', 'max:160', static function (string $attribute, mixed $value, \Closure $fail): void {
                if (is_string($value) && $value !== strip_tags($value)) {
                    $fail('Usá texto plano, sin HTML.');
                }
            }],
        ]);

        $asset = $this->landing->confirmAsset(
            $model,
            $validated['url'],
            $validated['mime_type'],
            $validated['title'],
            $validated['upload_token']
        );

        return response()->json(['data' => $asset], 201)
            ->header('Cache-Control', 'private, no-store');
    }

    public function deleteAsset(Request $request, string $project): JsonResponse
    {
        $model = $this->findProject($project);
        $user = $this->user($request);
        $this->authorizeAction($this->policy->update($user, $model));

        $validated = $request->validate([
            'url' => ['required', 'string', 'max:2048'],
        ]);

        $deleted = $this->landing->deleteAsset($model, $validated['url']);

        return response()->json(['deleted' => $deleted])
            ->header('Cache-Control', 'private, no-store');
    }
}
