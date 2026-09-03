<?php

namespace App\Domain\Inventory\Models;

use App\Domain\Inventory\Concerns\HasPublicId;
use App\Domain\Inventory\Enums\ProjectStatus;
use App\Domain\Inventory\Enums\ProjectType;
use App\Domain\Tenancy\Concerns\BelongsToTenant;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;
use Illuminate\Support\Carbon;

/**
 * @property int $id
 * @property int $tenant_id
 * @property string $public_id
 * @property string|null $code
 * @property string $name
 * @property ProjectType $project_type
 * @property ProjectStatus $status
 * @property int $progress
 * @property int $total_units
 * @property string $city
 * @property string $province
 * @property string|null $address
 * @property string|null $description
 * @property string|null $masterplan_image_url
 * @property Carbon|null $created_at
 * @property Carbon|null $updated_at
 */
class Project extends Model
{
    use BelongsToTenant;
    use HasPublicId;
    use SoftDeletes;

    protected $table = 'projects';

    protected $fillable = [
        'code',
        'name',
        'project_type',
        'status',
        'progress',
        'total_units',
        'city',
        'province',
        'address',
        'description',
        'masterplan_image_url',
        'legacy_id',
        'legacy_data_json',
    ];

    protected function casts(): array
    {
        return [
            'project_type' => ProjectType::class,
            'status' => ProjectStatus::class,
            'progress' => 'integer',
            'total_units' => 'integer',
            'legacy_id' => 'integer',
            'legacy_data_json' => 'array',
        ];
    }

    /** @param Builder<Project> $query */
    public function scopePubliclyVisible(Builder $query): void
    {
        $query->whereIn($this->qualifyColumn('status'), ProjectStatus::publicValues());
    }

    /** @return HasMany<Property, $this> */
    public function properties(): HasMany
    {
        return $this->hasMany(Property::class, 'project_id');
    }

    /** @return HasMany<UserInventoryScope, $this> */
    public function inventoryScopes(): HasMany
    {
        return $this->hasMany(UserInventoryScope::class, 'project_id');
    }
}
