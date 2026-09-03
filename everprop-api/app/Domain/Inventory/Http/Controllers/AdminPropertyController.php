<?php

namespace App\Domain\Inventory\Http\Controllers;

use App\Domain\Inventory\Http\Requests\PropertyIndexRequest;
use App\Domain\Inventory\Http\Requests\PublishPropertyRequest;
use App\Domain\Inventory\Http\Requests\StorePropertyRequest;
use App\Domain\Inventory\Http\Requests\UpdatePropertyRequest;
use App\Domain\Inventory\Http\Resources\PropertyResource;
use App\Domain\Inventory\Enums\PropertyCategory;
use App\Domain\Inventory\Enums\PropertyOperation;
use App\Domain\Inventory\Enums\PropertyStatus;
use App\Domain\Inventory\Models\Project;
use App\Domain\Inventory\Models\Property;
use App\Domain\Inventory\Policies\PropertyPolicy;
use App\Domain\Inventory\Services\InventoryAccess;
use App\Domain\Inventory\Services\InventoryFilters;
use App\Domain\Tenancy\TenantContext;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Http\Response;
use Illuminate\Support\Facades\DB;
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

        $property = Property::query()->create($payload);
        $property->refresh()->load(['project', 'features', 'media']);

        return (new PropertyResource($property))->response()->setStatusCode(201);
    }

    public function batchGenerate(Request $request): JsonResponse
    {
        $user = $this->user($request);
        $this->authorizeAction($this->policy->create($user));
        
        $data = $request->validate([
            'project_id' => 'required|integer|exists:projects,id',
            'sector_name' => 'required|string|max:160',
            'lot_from' => 'required|integer|min:1',
            'lot_to' => 'required|integer|gte:lot_from|max:500',
            'area_m2' => 'required|numeric|gt:0',
            'frente_m' => 'nullable|numeric|gt:0',
            'fondo_m' => 'nullable|numeric|gt:0',
            'ochava_m2' => 'nullable|numeric|gte:0',
            'price' => 'nullable|numeric|min:0',
            'currency_code' => 'nullable|string|in:USD,ARS',
            'corner_lots' => 'nullable|array',
            'corner_price' => 'nullable|numeric|min:0',
            'corner_area_m2' => 'nullable|numeric|gt:0',
            'services' => 'nullable|array',
            'description' => 'nullable|string',
        ]);

        $project = Project::query()
            ->where('tenant_id', $this->tenantContext->id())
            ->findOrFail($data['project_id']);

        $cornerLots = collect($data['corner_lots'] ?? [])->map(fn($v) => (int)$v)->all();

        $createdProperties = DB::transaction(function () use ($data, $project, $cornerLots): array {
            $items = [];
            $services = $data['services'] ?? [];

            for ($num = (int)$data['lot_from']; $num <= (int)$data['lot_to']; $num++) {
                $isCorner = in_array($num, $cornerLots, true);
                $lotNumStr = (string)$num;
                $area = $isCorner && !empty($data['corner_area_m2']) ? (float)$data['corner_area_m2'] : (float)$data['area_m2'];
                $price = $isCorner && !empty($data['corner_price']) ? (float)$data['corner_price'] : ($data['price'] ?? null);
                $currency = $price !== null ? ($data['currency_code'] ?? 'USD') : null;

                $cleanSector = preg_replace('/[^A-Za-z0-9]/', '', $data['sector_name']);
                $code = sprintf('%s-%s-%02d', $project->code ?? 'PRJ', $cleanSector ?: 'SEC', $num);

                $existing = Property::query()
                    ->where('tenant_id', $this->tenantContext->id())
                    ->where('code', $code)
                    ->exists();
                if ($existing) {
                    $code .= '-' . substr(bin2hex(random_bytes(2)), 0, 4);
                }

                $property = Property::query()->create([
                    'project_id' => $project->id,
                    'code' => $code,
                    'title' => "Lote {$lotNumStr} - {$data['sector_name']} - {$project->name}",
                    'operation' => PropertyOperation::SALE,
                    'category' => PropertyCategory::LOT,
                    'status' => PropertyStatus::AVAILABLE,
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

        return response()->json([
            'data' => $createdProperties,
            'message' => count($createdProperties) . ' lotes generados exitosamente.',
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

            $locked->fill($payload);
            $locked->version = $expectedVersion + 1;
            $locked->save();

            return $locked->refresh();
        }, 3);
    }

    private function exposePriceVisibility(PropertyIndexRequest|StorePropertyRequest|UpdatePropertyRequest|PublishPropertyRequest $request, User $user): void
    {
        $request->attributes->set('inventory.can_view_prices', $this->access->mayViewPriceFields($user));
    }
}
