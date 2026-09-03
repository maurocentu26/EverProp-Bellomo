<?php

namespace App\Domain\Inventory\Http\Requests;

use App\Domain\Inventory\Enums\PropertyCategory;
use App\Domain\Inventory\Enums\PropertyOperation;
use App\Domain\Inventory\Enums\PropertyStatus;
use Illuminate\Validation\Rule;

final class PropertyIndexRequest extends InventoryRequest
{
    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [
            'tenant_id' => ['prohibited'],
            'status' => ['sometimes', Rule::enum(PropertyStatus::class)],
            'operation' => ['sometimes', Rule::enum(PropertyOperation::class)],
            'category' => ['sometimes', Rule::enum(PropertyCategory::class)],
            'project_id' => ['sometimes', 'integer', 'min:1'],
            'project' => ['sometimes', 'uuid'],
            'city' => ['sometimes', 'string', 'max:160'],
            'neighborhood' => ['sometimes', 'string', 'max:160'],
            'bedrooms_min' => ['sometimes', 'integer', 'min:0'],
            'bedrooms_max' => ['sometimes', 'integer', 'min:0', 'gte:bedrooms_min'],
            'price_min' => ['sometimes', 'numeric', 'min:0'],
            'price_max' => ['sometimes', 'numeric', 'min:0', 'gte:price_min'],
            'search' => ['sometimes', 'string', 'max:120'],
            'sort' => ['sometimes', Rule::in(['title', 'status', 'price', 'area_m2', 'bedrooms', 'created_at', 'updated_at'])],
            'direction' => ['sometimes', Rule::in(['asc', 'desc'])],
            'per_page' => ['sometimes', 'integer', 'min:1', 'max:100'],
            'page' => ['sometimes', 'integer', 'min:1'],
        ];
    }

    public function perPage(): int
    {
        return (int) $this->validated('per_page', 20);
    }
}
