<?php

namespace App\Domain\Inventory\Http\Controllers;

use App\Domain\Inventory\Enums\PropertyMediaType;
use App\Domain\Inventory\Http\Requests\PropertyIndexRequest;
use App\Domain\Inventory\Http\Requests\StorePropertyMediaRequest;
use App\Domain\Inventory\Http\Requests\UpdatePropertyMediaRequest;
use App\Domain\Inventory\Http\Resources\PropertyMediaResource;
use App\Domain\Inventory\Models\PropertyMedia;
use App\Domain\Inventory\Policies\PropertyMediaPolicy;
use App\Domain\Inventory\Services\TenantMediaService;
use App\Domain\Tenancy\TenantContext;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Http\Response;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;
use Throwable;

final class AdminPropertyMediaController extends InventoryController
{
    public function __construct(
        TenantContext $tenantContext,
        private readonly PropertyMediaPolicy $policy,
        private readonly TenantMediaService $mediaService,
    ) {
        parent::__construct($tenantContext);
    }

    public function index(PropertyIndexRequest $request, string $property): AnonymousResourceCollection
    {
        $model = $this->findProperty($property);
        $this->authorizeAction($this->policy->viewAny($this->user($request), $model));

        return PropertyMediaResource::collection($model->media()->get());
    }

    public function store(StorePropertyMediaRequest $request, string $property): JsonResponse
    {
        $parent = $this->findProperty($property);
        $this->authorizeAction($this->policy->create($this->user($request), $parent));
        $payload = $request->validated();
        $stored = null;

        try {
            if ($request->hasFile('file')) {
                $stored = $this->mediaService->store(
                    $parent,
                    $request->file('file'),
                    PropertyMediaType::from($payload['media_type']),
                );
                $payload = array_replace($payload, $stored);
            }

            unset($payload['file']);

            $media = DB::transaction(function () use ($parent, $payload): PropertyMedia {
                if ($payload['is_primary'] ?? false) {
                    $this->clearPrimary($parent->getKey());
                }

                return $parent->media()->create($payload);
            }, 3);
        } catch (Throwable $exception) {
            if ($stored !== null) {
                $this->deleteStoredPayload($parent->getKey(), $stored);
            }

            throw $exception;
        }

        return (new PropertyMediaResource($media))->response()->setStatusCode(201);
    }

    public function show(PropertyIndexRequest $request, string $property, int $media): PropertyMediaResource
    {
        $parent = $this->findProperty($property);
        $model = $this->findMedia($parent, $media);
        $model->setRelation('property', $parent);
        $this->authorizeAction($this->policy->view($this->user($request), $model));

        return new PropertyMediaResource($model);
    }

    public function update(UpdatePropertyMediaRequest $request, string $property, int $media): PropertyMediaResource
    {
        $parent = $this->findProperty($property);
        $model = $this->findMedia($parent, $media);
        $model->setRelation('property', $parent);
        $this->authorizeAction($this->policy->update($this->user($request), $model));
        $payload = $request->validated();
        $type = PropertyMediaType::from($payload['media_type'] ?? (string) $model->getRawOriginal('media_type'));
        $stored = null;

        $finalUrl = $payload['url'] ?? $model->url;

        if (is_string($finalUrl) && str_starts_with(strtolower($finalUrl), 'https://')
            && ! in_array($type, [PropertyMediaType::VIDEO, PropertyMediaType::VIRTUAL_TOUR], true)) {
            throw ValidationException::withMessages([
                'url' => ['External URLs are allowed only for videos and virtual tours.'],
            ]);
        }

        try {
            if ($request->hasFile('file')) {
                $stored = $this->mediaService->store($parent, $request->file('file'), $type);
                $payload = array_replace($payload, $stored);
            } elseif (isset($payload['url'])) {
                $payload['metadata_json'] = null;
            }

            unset($payload['file']);
            $oldMedia = clone $model;
            $replacedFile = $stored !== null || isset($payload['url']);

            DB::transaction(function () use ($model, $parent, $payload, $replacedFile, $oldMedia): void {
                if ($payload['is_primary'] ?? false) {
                    $this->clearPrimary($parent->getKey());
                }

                $model->fill($payload)->save();

                if ($replacedFile) {
                    DB::afterCommit(fn () => $this->mediaService->delete($oldMedia));
                }
            }, 3);
        } catch (Throwable $exception) {
            if ($stored !== null) {
                $this->deleteStoredPayload($parent->getKey(), $stored);
            }

            throw $exception;
        }

        return new PropertyMediaResource($model->refresh());
    }

    public function destroy(PropertyIndexRequest $request, string $property, int $media): Response
    {
        $parent = $this->findProperty($property);
        $model = $this->findMedia($parent, $media);
        $model->setRelation('property', $parent);
        $this->authorizeAction($this->policy->delete($this->user($request), $model));
        $storedMedia = clone $model;

        DB::transaction(function () use ($model, $storedMedia): void {
            $model->delete();
            DB::afterCommit(fn () => $this->mediaService->delete($storedMedia));
        }, 3);

        return response()->noContent();
    }

    private function clearPrimary(int $propertyId): void
    {
        PropertyMedia::query()
            ->where('tenant_id', $this->tenantContext->id())
            ->where('property_id', $propertyId)
            ->where('is_primary', true)
            ->lockForUpdate()
            ->update(['is_primary' => false]);
    }

    /** @param array{url: string, metadata_json: array<string, mixed>} $stored */
    private function deleteStoredPayload(int $propertyId, array $stored): void
    {
        $media = new PropertyMedia;
        $media->forceFill([
            'tenant_id' => $this->tenantContext->id(),
            'property_id' => $propertyId,
            'url' => $stored['url'],
            'metadata_json' => $stored['metadata_json'],
        ]);
        $this->mediaService->delete($media);
    }
}
