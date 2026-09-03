<?php

namespace App\Domain\Inventory\Http\Requests;

use App\Domain\Inventory\Enums\PropertyCategory;
use App\Domain\Inventory\Enums\PropertyOperation;
use App\Domain\Inventory\Enums\PropertyStatus;
use Illuminate\Database\Query\Builder;
use Illuminate\Validation\Rule;

final class StorePropertyRequest extends InventoryRequest
{
    /** @return array<string, mixed> */
    public function rules(): array
    {
        return $this->serverOwnedRules() + [
            'version' => ['prohibited'],
            'project_id' => [
                'nullable', 'integer',
                Rule::exists('projects', 'id')->where(
                    fn (Builder $query): Builder => $query
                        ->where('tenant_id', $this->tenantId())
                        ->whereNull('deleted_at')
                ),
            ],
            'code' => [
                'nullable', 'string', 'max:80',
                Rule::unique('properties', 'code')->where(
                    fn (Builder $query): Builder => $query->where('tenant_id', $this->tenantId())
                ),
            ],
            'title' => ['required', 'string', 'max:255'],
            'operation' => ['required', Rule::enum(PropertyOperation::class)],
            'category' => ['required', Rule::enum(PropertyCategory::class)],
            'status' => ['sometimes', Rule::enum(PropertyStatus::class)],
            'price' => ['nullable', 'numeric', 'min:0'],
            'currency_code' => ['nullable', Rule::in(['USD', 'ARS'])],
            'city' => ['required', 'string', 'max:160'],
            'province' => ['required', 'string', 'max:160'],
            'neighborhood' => ['nullable', 'string', 'max:160'],
            'address' => ['nullable', 'string', 'max:500'],
            'bedrooms' => ['nullable', 'integer', 'min:0', 'max:65535'],
            'bathrooms' => ['nullable', 'integer', 'min:0', 'max:65535'],
            'area_m2' => ['nullable', 'numeric', 'gt:0'],
            'sector_name' => ['nullable', 'string', 'max:160'],
            'unit_number' => ['nullable', 'string', 'max:80'],
            'description' => ['nullable', 'string', 'max:100000'],
            'main_image_url' => ['nullable', 'url:https', 'max:2048'],
            'services_json' => ['nullable', 'array'],
            'commercial_features_json' => ['nullable', 'array'],
            'legacy_ed_id' => ['nullable', 'integer'],
            'legacy_pis' => ['nullable', 'string', 'max:40'],
            'legacy_dep' => ['nullable', 'string', 'max:40'],
            'legacy_status_id' => ['nullable', 'integer'],
            'legacy_type_id' => ['nullable', 'integer'],
            'legacy_data_json' => ['nullable', 'array'],
        ];
    }

    /** @return array<callable> */
    public function after(): array
    {
        return [function ($validator): void {
            if (($this->input('price') === null) !== ($this->input('currency_code') === null)) {
                $validator->errors()->add('price', 'price and currency_code must both be present or both be null.');
            }
        }];
    }
}
