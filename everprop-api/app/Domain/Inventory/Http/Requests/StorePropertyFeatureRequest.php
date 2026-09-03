<?php

namespace App\Domain\Inventory\Http\Requests;

use App\Domain\Inventory\Enums\PropertyFeatureGroup;
use App\Domain\Inventory\Models\Property;
use Illuminate\Database\Query\Builder;
use Illuminate\Validation\Rule;

final class StorePropertyFeatureRequest extends InventoryRequest
{
    /** @return array<string, mixed> */
    public function rules(): array
    {
        $propertyId = Property::query()
            ->where('tenant_id', $this->tenantId())
            ->where('public_id', (string) $this->route('property'))
            ->value('id');

        return $this->serverOwnedRules() + [
            'property_id' => ['prohibited'],
            'feature_group' => ['required', Rule::enum(PropertyFeatureGroup::class)],
            'feature_code' => [
                'required', 'string', 'max:80', 'regex:/^[A-Z0-9_\-]+$/',
                Rule::unique('property_features', 'feature_code')->where(
                    fn (Builder $query): Builder => $query
                        ->where('tenant_id', $this->tenantId())
                        ->where('property_id', $propertyId ?? 0)
                ),
            ],
            'label' => ['required', 'string', 'max:160'],
            'feature_value' => ['present', function (string $attribute, mixed $value, $fail): void {
                if ($value === null) {
                    $fail("The {$attribute} field cannot be null.");
                }
            }],
            'unit_code' => ['nullable', 'string', 'max:24'],
            'is_filterable' => ['sometimes', 'boolean'],
            'sort_order' => ['sometimes', 'integer', 'min:0'],
        ];
    }
}
