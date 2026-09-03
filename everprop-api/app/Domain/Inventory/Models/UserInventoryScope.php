<?php

namespace App\Domain\Inventory\Models;

use App\Domain\Tenancy\Concerns\BelongsToTenant;
use Illuminate\Database\Eloquent\Model;

class UserInventoryScope extends Model
{
    use BelongsToTenant;

    protected $table = 'user_inventory_scopes';

    protected $guarded = ['id', 'tenant_id', 'scope_key'];

    protected function casts(): array
    {
        return [
            'can_view' => 'boolean',
            'can_edit' => 'boolean',
            'can_manage_prices' => 'boolean',
        ];
    }
}
