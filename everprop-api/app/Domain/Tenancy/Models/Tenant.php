<?php

namespace App\Domain\Tenancy\Models;

use App\Domain\Tenancy\Enums\TenantStatus;
use App\Models\User;
use Database\Factories\TenantFactory;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Tenant extends Model
{
    /** @use HasFactory<TenantFactory> */
    use HasFactory;

    protected $table = 'tenants';

    protected $guarded = ['id'];

    protected function casts(): array
    {
        return [
            'settings_json' => 'array',
            'status' => TenantStatus::class,
        ];
    }

    public function getRouteKeyName(): string
    {
        return 'public_id';
    }

    /** @return HasMany<User, $this> */
    public function users(): HasMany
    {
        return $this->hasMany(User::class, 'tenant_id');
    }

    /**
     * @param  Builder<Tenant>  $query
     * @return Builder<Tenant>
     */
    public function scopeActive(Builder $query): Builder
    {
        return $query->where('status', TenantStatus::ACTIVE->value);
    }

    public function isActive(): bool
    {
        return $this->statusCode() === TenantStatus::ACTIVE;
    }

    public function statusCode(): TenantStatus
    {
        $status = $this->getAttribute('status');

        return $status instanceof TenantStatus
            ? $status
            : TenantStatus::from((string) $status);
    }

    protected static function newFactory(): TenantFactory
    {
        return TenantFactory::new();
    }
}
