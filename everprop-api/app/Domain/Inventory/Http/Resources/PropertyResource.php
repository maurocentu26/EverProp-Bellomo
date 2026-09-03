<?php

namespace App\Domain\Inventory\Http\Resources;

use App\Domain\Inventory\Models\Property;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/** @mixin Property */
final class PropertyResource extends JsonResource
{
    /** @return array<string, mixed> */
    public function toArray(Request $request): array
    {
        $user = $request->user();
        $canViewPrices = $request->attributes->get('inventory.can_view_prices', true) === true;

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
            'bedrooms' => $this->bedrooms,
            'bathrooms' => $this->bathrooms,
            'area_m2' => $this->area_m2,
            'sector_name' => $this->sector_name,
            'unit_number' => $this->unit_number,
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
                'data' => $this->legacy_data_json,
            ]),
            'version' => $this->when($user !== null, $this->version),
            'project' => new ProjectResource($this->whenLoaded('project')),
            'features' => PropertyFeatureResource::collection($this->whenLoaded('features')),
            'media' => PropertyMediaResource::collection($this->whenLoaded('media')),
            'created_at' => $this->created_at?->toISOString(),
            'updated_at' => $this->updated_at?->toISOString(),
        ];
    }
}
