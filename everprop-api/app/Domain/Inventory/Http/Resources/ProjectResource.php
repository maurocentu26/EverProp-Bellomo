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
            'properties' => PropertyResource::collection($this->whenLoaded('properties')),
            'created_at' => $this->created_at?->toISOString(),
            'updated_at' => $this->updated_at?->toISOString(),
        ];
    }
}
