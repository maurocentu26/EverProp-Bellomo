<?php

namespace App\Domain\Inventory\Http\Requests;

use App\Domain\Inventory\Enums\PropertyCategory;
use App\Domain\Inventory\Enums\PropertyOperation;
use App\Domain\Inventory\Enums\PropertyStatus;
use Illuminate\Database\Query\Builder;
use Illuminate\Validation\Rule;

final class UpdatePropertyRequest extends InventoryRequest
{
    /** @return array<string, mixed> */
    public function rules(): array
    {
        $routePublicId = (string) $this->route('property');

        return $this->serverOwnedRules() + [
            'version' => ['required', 'integer', 'min:1'],
            'project_id' => [
                'sometimes', 'nullable', 'integer',
                Rule::exists('projects', 'id')->where(
                    fn (Builder $query): Builder => $query
                        ->where('tenant_id', $this->tenantId())
                        ->whereNull('deleted_at')
                ),
            ],
            'code' => [
                'sometimes', 'nullable', 'string', 'max:80',
                Rule::unique('properties', 'code')->where(
                    fn (Builder $query): Builder => $query
                        ->where('tenant_id', $this->tenantId())
                        ->where('public_id', '<>', $routePublicId)
                ),
            ],
            'title' => ['sometimes', 'string', 'max:255'],
            'operation' => ['sometimes', Rule::enum(PropertyOperation::class)],
            'category' => ['sometimes', Rule::enum(PropertyCategory::class)],
            'status' => ['sometimes', Rule::enum(PropertyStatus::class)],
            'price' => ['sometimes', 'nullable', 'numeric', 'min:0'],
            'currency_code' => ['sometimes', 'nullable', Rule::in(['USD', 'ARS'])],
            'city' => ['sometimes', 'string', 'max:160'],
            'province' => ['sometimes', 'string', 'max:160'],
            'neighborhood' => ['sometimes', 'nullable', 'string', 'max:160'],
            'address' => ['sometimes', 'nullable', 'string', 'max:500'],
            'bedrooms' => ['sometimes', 'nullable', 'integer', 'min:0', 'max:65535'],
            'bathrooms' => ['sometimes', 'nullable', 'integer', 'min:0', 'max:65535'],
            'area_m2' => ['sometimes', 'nullable', 'numeric', 'gt:0'],
            'sector_name' => ['sometimes', 'nullable', 'string', 'max:160'],
            'unit_number' => ['sometimes', 'nullable', 'string', 'max:80'],
            'description' => ['sometimes', 'nullable', 'string', 'max:100000'],
            'main_image_url' => ['sometimes', 'nullable', 'url:https', 'max:2048'],
            'services_json' => ['sometimes', 'nullable', 'array'],
            'commercial_features_json' => ['sometimes', 'nullable', 'array'],
            'legacy_ed_id' => ['sometimes', 'nullable', 'integer'],
            'legacy_pis' => ['sometimes', 'nullable', 'string', 'max:40'],
            'legacy_dep' => ['sometimes', 'nullable', 'string', 'max:40'],
            'legacy_status_id' => ['sometimes', 'nullable', 'integer'],
            'legacy_type_id' => ['sometimes', 'nullable', 'integer'],
            'legacy_data_json' => ['sometimes', 'nullable', 'array'],
        ];
    }

    /** @return array<callable> */
    public function after(): array
    {
        return [function ($validator): void {
            if ($this->exists('price') && $this->exists('currency_code')
                && (($this->input('price') === null) !== ($this->input('currency_code') === null))) {
                $validator->errors()->add('price', 'price and currency_code must both be values or both be null.');
            }
        }];
    }
}
