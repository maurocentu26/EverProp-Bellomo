<?php

namespace App\Domain\Inventory\Models;

use App\Domain\Tenancy\Concerns\BelongsToTenant;
use App\Models\User;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * @property int $tenant_id
 * @property int $user_id
 * @property string $workspace_mode
 * @property string $visibility_mode
 * @property bool $can_view_prices
 * @property bool $can_manage_inventory
 * @property bool $can_manage_prices
 * @property array<string, mixed>|null $settings_json
 */
class UserInventorySetting extends Model
{
    use BelongsToTenant;

    protected $table = 'user_inventory_settings';

    protected $primaryKey = 'user_id';

    public $incrementing = false;

    protected $fillable = [
        'user_id',
        'workspace_mode',
        'visibility_mode',
        'can_view_prices',
        'can_manage_inventory',
        'can_manage_prices',
        'settings_json',
    ];

    protected function casts(): array
    {
        return [
            'can_view_prices' => 'boolean',
            'can_manage_inventory' => 'boolean',
            'can_manage_prices' => 'boolean',
            'settings_json' => 'array',
        ];
    }

    /** @return BelongsTo<User, $this> */
    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class, 'user_id');
    }
}
