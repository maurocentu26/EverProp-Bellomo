<?php

namespace App\Domain\Inventory\Models;

use App\Domain\Inventory\Enums\PropertyMediaType;
use App\Domain\Tenancy\Concerns\BelongsToTenant;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * @property int $id
 * @property int $tenant_id
 * @property int $property_id
 * @property PropertyMediaType $media_type
 * @property string $url
 * @property string|null $thumbnail_url
 * @property string|null $alt_text
 * @property string|null $caption
 * @property int $sort_order
 * @property bool $is_primary
 * @property array<string, mixed>|null $metadata_json
 */
class PropertyMedia extends Model
{
    use BelongsToTenant;

    protected $table = 'property_media';

    protected $fillable = [
        'property_id',
        'media_type',
        'url',
        'thumbnail_url',
        'alt_text',
        'caption',
        'sort_order',
        'is_primary',
        'metadata_json',
    ];

    protected function casts(): array
    {
        return [
            'media_type' => PropertyMediaType::class,
            'sort_order' => 'integer',
            'is_primary' => 'boolean',
            'metadata_json' => 'array',
        ];
    }

    /** @return BelongsTo<Property, $this> */
    public function property(): BelongsTo
    {
        return $this->belongsTo(Property::class, 'property_id');
    }
}
