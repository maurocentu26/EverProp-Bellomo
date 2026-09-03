<?php

namespace App\Domain\Inventory\Models;

use App\Domain\Inventory\Enums\PropertyFeatureGroup;
use App\Domain\Tenancy\Concerns\BelongsToTenant;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * @property int $id
 * @property int $tenant_id
 * @property int $property_id
 * @property PropertyFeatureGroup $feature_group
 * @property string $feature_code
 * @property string $label
 * @property mixed $feature_value
 * @property string|null $unit_code
 * @property bool $is_filterable
 * @property int $sort_order
 */
class PropertyFeature extends Model
{
    use BelongsToTenant;

    protected $table = 'property_features';

    protected $fillable = [
        'property_id',
        'feature_group',
        'feature_code',
        'label',
        'feature_value',
        'unit_code',
        'is_filterable',
        'sort_order',
    ];

    protected function casts(): array
    {
        return [
            'feature_group' => PropertyFeatureGroup::class,
            'feature_value' => 'json',
            'is_filterable' => 'boolean',
            'sort_order' => 'integer',
        ];
    }

    /** @return BelongsTo<Property, $this> */
    public function property(): BelongsTo
    {
        return $this->belongsTo(Property::class, 'property_id');
    }
}
