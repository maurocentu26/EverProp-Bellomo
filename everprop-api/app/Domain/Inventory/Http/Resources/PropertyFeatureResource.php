<?php

namespace App\Domain\Inventory\Http\Resources;

use App\Domain\Inventory\Models\PropertyFeature;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/** @mixin PropertyFeature */
final class PropertyFeatureResource extends JsonResource
{
    /** @return array<string, mixed> */
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->when($request->user() !== null, $this->id),
            'feature_group' => $this->feature_group->value,
            'feature_code' => $this->feature_code,
            'label' => $this->label,
            'value' => $this->feature_value,
            'unit_code' => $this->unit_code,
            'is_filterable' => $this->is_filterable,
            'sort_order' => $this->sort_order,
        ];
    }
}
