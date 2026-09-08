<?php

namespace App\Domain\Inventory\Models;

use App\Domain\Inventory\Concerns\HasPublicId;
use App\Domain\Inventory\Enums\ProjectStatus;
use App\Domain\Inventory\Enums\PropertyCategory;
use App\Domain\Inventory\Enums\PropertyOperation;
use App\Domain\Inventory\Enums\PropertyStatus;
use App\Domain\Tenancy\Concerns\BelongsToTenant;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;
use Illuminate\Support\Carbon;

/**
 * @property int $id
 * @property int $tenant_id
 * @property int|null $project_id
 * @property string $public_id
 * @property string|null $code
 * @property string $title
 * @property PropertyOperation $operation
 * @property PropertyCategory $category
 * @property PropertyStatus $status
 * @property string|null $price
 * @property string|null $currency_code
 * @property string $city
 * @property string $province
 * @property string|null $neighborhood
 * @property string|null $address
 * @property int|null $bedrooms
 * @property int|null $bathrooms
 * @property string|null $area_m2
 * @property string|null $sector_name
 * @property string|null $unit_number
 * @property string|null $description
 * @property string|null $main_image_url
 * @property array<mixed>|null $services_json
 * @property array<mixed>|null $commercial_features_json
 * @property int|null $legacy_ed_id
 * @property string|null $legacy_pis
 * @property string|null $legacy_dep
 * @property int|null $legacy_status_id
 * @property int|null $legacy_type_id
 * @property array<mixed>|null $legacy_data_json
 * @property int $version
 * @property Carbon|null $created_at
 * @property Carbon|null $updated_at
 */
class Property extends Model
{
    use BelongsToTenant;
    use HasPublicId;
    use SoftDeletes;

    protected $table = 'properties';

    protected $fillable = [
        'project_id',
        'code',
        'title',
        'operation',
        'category',
        'status',
        'price',
        'currency_code',
        'city',
        'province',
        'neighborhood',
        'address',
        'bedrooms',
        'bathrooms',
        'area_m2',
        'sector_name',
        'unit_number',
        'description',
        'main_image_url',
        'services_json',
        'commercial_features_json',
        'legacy_ed_id',
        'legacy_pis',
        'legacy_dep',
        'legacy_status_id',
        'legacy_type_id',
        'legacy_data_json',
    ];

    protected function casts(): array
    {
        return [
            'operation' => PropertyOperation::class,
            'category' => PropertyCategory::class,
            'status' => PropertyStatus::class,
            'price' => 'decimal:2',
            'bedrooms' => 'integer',
            'bathrooms' => 'integer',
            'area_m2' => 'decimal:2',
            'services_json' => 'array',
            'commercial_features_json' => 'array',
            'legacy_ed_id' => 'integer',
            'legacy_status_id' => 'integer',
            'legacy_type_id' => 'integer',
            'legacy_data_json' => 'array',
            'version' => 'integer',
        ];
    }

    /** @param Builder<Property> $query */
    public function scopePubliclyVisible(Builder $query): void
    {
        $query->where($this->qualifyColumn('status'), PropertyStatus::AVAILABLE->value)
            ->where(static function (Builder $builder): void {
                $builder->whereNull('properties.project_id')
                    ->orWhereHas('project', static fn (Builder $project): Builder => $project
                        ->whereIn('projects.status', ProjectStatus::publicValues()));
            });
    }

    /** @return BelongsTo<Project, $this> */
    public function project(): BelongsTo
    {
        return $this->belongsTo(Project::class, 'project_id');
    }

    /** @return HasMany<PropertyFeature, $this> */
    public function features(): HasMany
    {
        return $this->hasMany(PropertyFeature::class, 'property_id')
            ->orderBy('sort_order')
            ->orderBy('id');
    }

    /** @return HasMany<PropertyMedia, $this> */
    public function media(): HasMany
    {
        return $this->hasMany(PropertyMedia::class, 'property_id')
            ->orderBy('sort_order')
            ->orderBy('id');
    }

    /** @return HasMany<UserInventoryScope, $this> */
    public function inventoryScopes(): HasMany
    {
        return $this->hasMany(UserInventoryScope::class, 'property_id');
    }
}
