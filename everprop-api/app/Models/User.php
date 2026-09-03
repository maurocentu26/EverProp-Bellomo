<?php

namespace App\Models;

use App\Domain\Identity\Enums\Capability;
use App\Domain\Identity\Enums\RoleCode;
use App\Domain\Identity\Enums\UserStatus;
use App\Domain\Tenancy\Models\Tenant;
use Database\Factories\UserFactory;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\SoftDeletes;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;

class User extends Authenticatable
{
    /** @use HasFactory<UserFactory> */
    use HasFactory, Notifiable, SoftDeletes;

    protected $table = 'users';

    protected $authPasswordName = 'password_hash';

    protected $rememberTokenName = null;

    protected $fillable = [
        'public_id',
        'auth_subject',
        'display_name',
        'email',
        'phone_e164',
        'role_code',
        'status',
        'max_open_leads',
        'password_hash',
    ];

    protected $hidden = [
        'auth_subject',
        'password_hash',
    ];

    /**
     * Get the attributes that should be cast.
     *
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'last_login_at' => 'immutable_datetime',
            'deleted_at' => 'immutable_datetime',
            'password_hash' => 'hashed',
            'role_code' => RoleCode::class,
            'status' => UserStatus::class,
        ];
    }

    public function getRouteKeyName(): string
    {
        return 'public_id';
    }

    /** @return BelongsTo<Tenant, $this> */
    public function tenant(): BelongsTo
    {
        return $this->belongsTo(Tenant::class, 'tenant_id');
    }

    /**
     * @param  Builder<User>  $query
     * @return Builder<User>
     */
    public function scopeForTenant(Builder $query, int $tenantId): Builder
    {
        return $query->where($this->qualifyColumn('tenant_id'), $tenantId);
    }

    /**
     * @param  Builder<User>  $query
     * @return Builder<User>
     */
    public function scopeActive(Builder $query): Builder
    {
        return $query->where('status', UserStatus::ACTIVE->value);
    }

    public function role(): RoleCode
    {
        $role = $this->getAttribute('role_code');

        return $role instanceof RoleCode
            ? $role
            : RoleCode::from((string) $role);
    }

    public function statusCode(): UserStatus
    {
        $status = $this->getAttribute('status');

        return $status instanceof UserStatus
            ? $status
            : UserStatus::from((string) $status);
    }

    public function isActive(): bool
    {
        return $this->statusCode() === UserStatus::ACTIVE
            && $this->getAttribute('deleted_at') === null;
    }

    /** @return list<Capability> */
    public function capabilities(): array
    {
        return $this->role()->capabilities();
    }

    public function hasCapability(Capability $capability): bool
    {
        return $this->role()->allows($capability);
    }
}
