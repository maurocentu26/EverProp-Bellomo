<?php

namespace App\Domain\Inventory\Http\Resources;

use App\Domain\Inventory\Models\Property;
use App\Domain\Inventory\Services\InventoryAccess;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/** @mixin Property */
final class PropertyResource extends JsonResource
{
    /** @return array<string, mixed> */
    public function toArray(Request $request): array
    {
        $user = $request->user();
        $canViewPrices = $user === null || app(InventoryAccess::class)->mayViewPriceFields($user);

        return [
            'id' => $this->when($user !== null, $this->id),
            'public_id' => $this->public_id,
            'project_id' => $this->when($user !== null, $this->project_id),
            'code' => $this->code,
            'title' => $this->title,
            'operation' => $this->operation->value,
            'category' => $this->category->value,
            'status' => $this->status->value,
            'price' => $this->when($canViewPrices, $this->price),
            'currency_code' => $this->when($canViewPrices, $this->currency_code),
            'city' => $this->city,
            'province' => $this->province,
            'neighborhood' => $this->neighborhood,
            'address' => $this->address,
            'rooms' => $this->rooms,
            'bedrooms' => $this->bedrooms,
            'bathrooms' => $this->bathrooms,
            'area_m2' => $this->area_m2,
            'covered_area_m2' => $this->covered_area_m2,
            'uncovered_area_m2' => $this->uncovered_area_m2,
            'sector_name' => $this->sector_name,
            'unit_number' => $this->unit_number,
            'floor' => $this->floor,
            'orientation' => $this->orientation,
            'disposition' => $this->disposition,
            'parking_spaces' => $this->parking_spaces,
            'expenses' => $this->when($canViewPrices, $this->expenses),
            'expenses_currency_code' => $this->when($canViewPrices, $this->expenses_currency_code),
            'description' => $this->description,
            'main_image_url' => $this->main_image_url,
            'services' => $this->services_json,
            'commercial_features' => $this->commercial_features_json,
            'legacy' => $this->when($user !== null && $this->legacy_ed_id !== null, [
                'ed_id' => $this->legacy_ed_id,
                'pis' => $this->legacy_pis,
                'dep' => $this->legacy_dep,
                'status_id' => $this->legacy_status_id,
                'type_id' => $this->legacy_type_id,
            ] + ($canViewPrices ? ['data' => $this->legacy_data_json] : [])),
            'version' => $this->when($user !== null, $this->version),
            'project' => new ProjectResource($this->whenLoaded('project')),
            'features' => PropertyFeatureResource::collection($this->whenLoaded('features')),
            'media' => PropertyMediaResource::collection($this->whenLoaded('media')),
            'created_at' => $this->created_at?->toISOString(),
            'updated_at' => $this->updated_at?->toISOString(),
        ];
    }
}
