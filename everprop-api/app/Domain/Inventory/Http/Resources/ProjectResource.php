<?php

namespace App\Domain\Inventory\Http\Resources;

use App\Domain\Inventory\Models\Project;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/** @mixin Project */
final class ProjectResource extends JsonResource
{
    /** @return array<string, mixed> */
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->when($request->user() !== null, $this->id),
            'public_id' => $this->public_id,
            'code' => $this->code,
            'name' => $this->name,
            'project_type' => $this->project_type->value,
            'status' => $this->status->value,
            'progress' => $this->progress,
            'total_units' => $this->total_units,
            'city' => $this->city,
            'province' => $this->province,
            'address' => $this->address,
            'description' => $this->description,
            'masterplan_image_url' => $this->masterplan_image_url,
            'legacy_id' => $this->when($request->user() !== null, $this->legacy_id),
            'legacy_data' => $this->when($request->user() !== null, $this->legacy_data_json),
            'properties_count' => $this->whenCounted('properties'),
            'available_units_count' => $this->whenCounted('available_units_count'),
            'reserved_units_count' => $this->whenCounted('reserved_units_count'),
            'sold_units_count' => $this->whenCounted('sold_units_count'),
            'available_sale_units_count' => $this->whenCounted('available_sale_units_count'),
            'available_rent_units_count' => $this->whenCounted('available_rent_units_count'),
            'rented_units_count' => $this->whenCounted('rented_units_count'),
            'not_sellable_units_count' => $this->whenCounted('not_sellable_units_count'),
            'not_marketed_units_count' => $this->whenCounted('not_marketed_units_count'),
            'properties' => PropertyResource::collection($this->whenLoaded('properties')),
            'created_at' => $this->created_at?->toISOString(),
            'updated_at' => $this->updated_at?->toISOString(),
        ];
    }
}
