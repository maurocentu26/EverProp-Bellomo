<?php

namespace App\Domain\Inventory\Http\Controllers;

use App\Domain\Inventory\Enums\PropertyCategory;
use App\Domain\Inventory\Enums\PropertyOperation;
use App\Domain\Inventory\Enums\PropertyStatus;
use App\Domain\Inventory\Http\Requests\PropertyIndexRequest;
use App\Domain\Inventory\Http\Requests\PublishPropertyRequest;
use App\Domain\Inventory\Http\Requests\StorePropertyRequest;
use App\Domain\Inventory\Http\Requests\UpdatePropertyRequest;
use App\Domain\Inventory\Http\Resources\PropertyResource;
use App\Domain\Inventory\Models\Project;
use App\Domain\Inventory\Models\Property;
use App\Domain\Inventory\Policies\PropertyPolicy;
use App\Domain\Inventory\Services\InventoryAccess;
use App\Domain\Inventory\Services\InventoryFilters;
use App\Domain\Tenancy\TenantContext;
use App\Models\User;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Http\Response;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;
use Symfony\Component\HttpKernel\Exception\ConflictHttpException;

final class AdminPropertyController extends InventoryController
{
    public function __construct(
        TenantContext $tenantContext,
        private readonly InventoryAccess $access,
        private readonly InventoryFilters $filters,
        private readonly PropertyPolicy $policy,
    ) {
        parent::__construct($tenantContext);
    }

    public function index(PropertyIndexRequest $request): AnonymousResourceCollection
    {
        $user = $this->user($request);
        $this->authorizeAction($this->policy->viewAny($user));
        $this->exposePriceVisibility($request, $user);

        $query = $this->access->scopeProperties(Property::query(), $user)
            ->with(['project', 'features', 'media']);

        return PropertyResource::collection(
            $this->filters->properties($query, $request->validated())->paginate($request->perPage())
        );
    }

    public function store(StorePropertyRequest $request): JsonResponse
    {
        $user = $this->user($request);
        $this->authorizeAction($this->policy->create($user));
        $this->exposePriceVisibility($request, $user);
        $payload = $request->validated();

        if (array_key_exists('price', $payload) && $payload['price'] !== null) {
            $this->authorizeAction($this->policy->setInitialPrices($user));
        }

        if (($payload['project_id'] ?? null) !== null) {
            $this->authorizeAction($this->policy->placeInProject($user, $this->findProjectById((int) $payload['project_id'])));
        }

        // Omitting status used to fall back to the DB default AVAILABLE, publishing without PUBLISH.
        $payload['status'] ??= $this->defaultNewStatus($user)->value;

        if ($payload['status'] === PropertyStatus::AVAILABLE->value) {
            $this->authorizeAction($this->policy->publishNew($user));
        }

        $property = Property::query()->create($payload);
        $property->refresh()->load(['project', 'features', 'media']);

        return (new PropertyResource($property))->response()->setStatusCode(201);
    }

    public function batchGenerate(Request $request): JsonResponse
    {
        $user = $this->user($request);
        $this->authorizeAction($this->policy->create($user));

        $data = $request->validate([
            'project_id' => [
                'required', 'integer',
                Rule::exists('projects', 'id')->where(
                    fn ($query) => $query->where('tenant_id', $this->tenantContext->id())->whereNull('deleted_at')
                ),
            ],
            'sector_name' => 'required|string|max:160',
            'lot_from' => 'required|integer|min:1',
            'lot_to' => 'required|integer|gte:lot_from|max:500',
            'area_m2' => 'required|numeric|gt:0',
            'frente_m' => 'nullable|numeric|gt:0',
            'fondo_m' => 'nullable|numeric|gt:0',
            'ochava_m2' => 'nullable|numeric|gte:0',
            'price' => 'nullable|numeric|min:0',
            // No implicit currency: a price without its currency is rejected, never assumed USD.
            'currency_code' => 'nullable|required_with:price,corner_price|string|in:USD,ARS',
            'corner_lots' => 'nullable|array',
            'corner_price' => 'nullable|numeric|min:0',
            'corner_area_m2' => 'nullable|numeric|gt:0',
            'services' => 'nullable|array',
            'description' => 'nullable|string',
        ]);

        $project = $this->findProjectById((int) $data['project_id']);
        $this->authorizeAction($this->policy->placeInProject($user, $project));

        if (($data['price'] ?? null) !== null || ($data['corner_price'] ?? null) !== null) {
            $this->authorizeAction($this->policy->setInitialPrices($user));
        }

        $status = $this->defaultNewStatus($user);
        if ($status === PropertyStatus::AVAILABLE) {
            $this->authorizeAction($this->policy->publishNew($user));
        }
        $cornerLots = array_map(static fn ($v): int => (int) $v, (array) ($data['corner_lots'] ?? []));
        $cleanSector = preg_replace('/[^A-Za-z0-9]/', '', $data['sector_name']) ?: 'SEC';
        // Deterministic identity: a project without code gets its own prefix instead of a shared "PRJ".
        $prefix = $project->code ?: 'P'.$project->id;
        $codes = [];
        for ($num = (int) $data['lot_from']; $num <= (int) $data['lot_to']; $num++) {
            $codes[$num] = sprintf('%s-%s-%02d', $prefix, $cleanSector, $num);
        }

        $this->rejectExistingCodes(array_values($codes));

        try {
            $createdProperties = DB::transaction(function () use ($data, $project, $cornerLots, $codes, $status): array {
                $items = [];
                $services = $data['services'] ?? [];

                foreach ($codes as $num => $code) {
                    $isCorner = in_array($num, $cornerLots, true);
                    $lotNumStr = (string) $num;
                    $area = $isCorner && ($data['corner_area_m2'] ?? null) !== null ? (float) $data['corner_area_m2'] : (float) $data['area_m2'];
                    $price = $isCorner && ($data['corner_price'] ?? null) !== null ? $data['corner_price'] : ($data['price'] ?? null);
                    $currency = $price !== null ? $data['currency_code'] : null;

                    $property = Property::query()->create([
                        'project_id' => $project->id,
                        'code' => $code,
                        'title' => "Lote {$lotNumStr} - {$data['sector_name']} - {$project->name}",
                        'operation' => PropertyOperation::SALE,
                        'category' => PropertyCategory::LOT,
                        'status' => $status,
                        'price' => $price,
                        'currency_code' => $currency,
                        'city' => $project->city ?? 'San Salvador de Jujuy',
                        'province' => $project->province ?? 'Jujuy',
                        'neighborhood' => $project->name,
                        'address' => $project->address,
                        'area_m2' => $area,
                        'sector_name' => $data['sector_name'],
                        'unit_number' => $lotNumStr,
                        'description' => $data['description'] ?? "Lote {$lotNumStr} en {$data['sector_name']}, desarrollo {$project->name}.",
                        'services_json' => $services,
                        'legacy_ed_id' => $project->legacy_id,
                        'legacy_pis' => $data['sector_name'],
                        'legacy_dep' => $lotNumStr,
                        'legacy_type_id' => 9,
                        'legacy_status_id' => 2,
                        'legacy_data_json' => [
                            'frente_m' => $data['frente_m'] ?? null,
                            'fondo_m' => $data['fondo_m'] ?? null,
                            'ochava_m2' => $isCorner ? ($data['ochava_m2'] ?? null) : null,
                            'is_corner' => $isCorner,
                        ],
                    ]);

                    $items[] = (new PropertyResource($property->load(['project'])))->resolve();
                }

                return $items;
            });
        } catch (UniqueConstraintViolationException) {
            // A concurrent batch created one of the codes between the pre-check and the insert.
            $this->rejectExistingCodes(array_values($codes));
            throw new ConflictHttpException('Otro proceso generó los mismos códigos. Revisá el inventario antes de reintentar.');
        }

        return response()->json([
            'data' => $createdProperties,
            'message' => count($createdProperties).' lotes generados exitosamente.',
        ], 201);
    }

    public function show(PropertyIndexRequest $request, string $property): PropertyResource
    {
        $model = $this->findProperty($property);
        $user = $this->user($request);
        $this->authorizeAction($this->policy->view($user, $model));
        $this->exposePriceVisibility($request, $user);

        return new PropertyResource($model->load(['project', 'features', 'media']));
    }

    public function update(UpdatePropertyRequest $request, string $property): PropertyResource
    {
        $model = $this->findProperty($property);
        $user = $this->user($request);
        $this->authorizeAction($this->policy->update($user, $model));
        $this->exposePriceVisibility($request, $user);

        $payload = $request->validated();
        $expectedVersion = (int) $payload['version'];
        unset($payload['version']);

        $model = $this->updateLocked($model, $user, $payload, $expectedVersion);

        return new PropertyResource($model->load(['project', 'features', 'media']));
    }

    public function publish(PublishPropertyRequest $request, string $property): PropertyResource
    {
        $model = $this->findProperty($property);
        $user = $this->user($request);
        $this->authorizeAction($this->policy->publish($user, $model));
        $this->exposePriceVisibility($request, $user);
        $payload = $request->validated();

        $model = $this->updateLocked(
            $model,
            $user,
            ['status' => $payload['status']],
            (int) $payload['version'],
        );

        return new PropertyResource($model->load(['project', 'features', 'media']));
    }

    public function destroy(PropertyIndexRequest $request, string $property): Response
    {
        $model = $this->findProperty($property);
        $this->authorizeAction($this->policy->delete($this->user($request), $model));
        $model->delete();

        return response()->noContent();
    }

    /** @param array<string, mixed> $payload */
    private function updateLocked(Property $property, User $user, array $payload, int $expectedVersion): Property
    {
        return DB::transaction(function () use ($expectedVersion, $payload, $property, $user): Property {
            $locked = Property::query()
                ->where('tenant_id', $this->tenantContext->id())
                ->whereKey($property->getKey())
                ->lockForUpdate()
                ->firstOrFail();

            if ((int) $locked->version !== $expectedVersion) {
                throw new ConflictHttpException('The property was modified by another request.');
            }

            $price = array_key_exists('price', $payload) ? $payload['price'] : $locked->price;
            $currency = array_key_exists('currency_code', $payload) ? $payload['currency_code'] : $locked->currency_code;

            if (($price === null) !== ($currency === null)) {
                throw ValidationException::withMessages([
                    'price' => ['price and currency_code must both be values or both be null.'],
                ]);
            }

            if (array_key_exists('price', $payload) || array_key_exists('currency_code', $payload)) {
                $this->authorizeAction($this->policy->managePrices($user, $locked));
            }

            // First exposure (never-marketed -> AVAILABLE) is publishing, whichever endpoint is used.
            // Returning a RESERVED/SOLD/RENTED unit to AVAILABLE stays an editor action.
            $targetStatus = $payload['status'] ?? $locked->status->value;
            if ($targetStatus === PropertyStatus::AVAILABLE->value && in_array($locked->status, [
                PropertyStatus::NOT_MARKETED, PropertyStatus::NOT_SELLABLE, PropertyStatus::UNKNOWN,
            ], true)) {
                $this->authorizeAction($this->policy->publish($user, $locked));
            }

            if (array_key_exists('project_id', $payload) && (int) $payload['project_id'] !== (int) $locked->project_id) {
                if ($payload['project_id'] !== null) {
                    $this->authorizeAction($this->policy->placeInProject($user, $this->findProjectById((int) $payload['project_id'])));
                }
                // Moving an AVAILABLE unit changes its public visibility (project status gates it).
                if ($targetStatus === PropertyStatus::AVAILABLE->value) {
                    $this->authorizeAction($this->policy->publish($user, $locked));
                }
            }

            $locked->fill($payload);
            $locked->version = $expectedVersion + 1;
            $locked->save();

            return $locked->refresh();
        }, 3);
    }

    /** Publishers create AVAILABLE units; everyone else creates NOT_MARKETED ones (needs schema 2026-09-15.001). */
    private function defaultNewStatus(User $user): PropertyStatus
    {
        if ($this->policy->publishNew($user)) {
            return PropertyStatus::AVAILABLE;
        }

        // Without the extended status catalog there is no non-public status to fall back to: require PUBLISH.
        return DB::table('schema_versions')->where('version', '2026-09-15.001')->exists()
            ? PropertyStatus::NOT_MARKETED
            : PropertyStatus::AVAILABLE;
    }

    private function findProjectById(int $id): Project
    {
        return Project::query()
            ->where('tenant_id', $this->tenantContext->id())
            ->findOrFail($id);
    }

    /** @param list<string> $codes */
    private function rejectExistingCodes(array $codes): void
    {
        $taken = Property::withTrashed()
            ->where('tenant_id', $this->tenantContext->id())
            ->whereIn('code', $codes)
            ->orderBy('code')
            ->pluck('code')
            ->all();

        if ($taken !== []) {
            throw ValidationException::withMessages([
                'lot_from' => ['Ya existen propiedades con estos códigos: '.implode(', ', $taken).'.'],
            ])->status(409);
        }
    }

    private function exposePriceVisibility(PropertyIndexRequest|StorePropertyRequest|UpdatePropertyRequest|PublishPropertyRequest $request, User $user): void
    {
        $request->attributes->set('inventory.can_view_prices', $this->access->mayViewPriceFields($user));
    }
}
