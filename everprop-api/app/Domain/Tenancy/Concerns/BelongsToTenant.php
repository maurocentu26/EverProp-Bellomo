<?php

namespace App\Domain\Tenancy\Concerns;

use App\Domain\Tenancy\Database\Scopes\TenantScope;
use App\Domain\Tenancy\Exceptions\CrossTenantOperation;
use App\Domain\Tenancy\TenantContext;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;

trait BelongsToTenant
{
    public function initializeBelongsToTenant(): void
    {
        $this->guarded = array_values(array_unique([...$this->guarded, 'tenant_id']));
    }

    public static function bootBelongsToTenant(): void
    {
        static::addGlobalScope(new TenantScope);

        static::creating(function (Model $model): void {
            $context = app(TenantContext::class);

            if ($context->isPlatform()) {
                if ($model->getAttribute('tenant_id') === null) {
                    throw CrossTenantOperation::detected();
                }

                return;
            }

            $tenantId = $context->id();
            $providedTenantId = $model->getAttribute('tenant_id');

            if ($providedTenantId !== null && (int) $providedTenantId !== $tenantId) {
                throw CrossTenantOperation::detected();
            }

            $model->setAttribute('tenant_id', $tenantId);
        });

        static::updating(function (Model $model): void {
            $context = app(TenantContext::class);

            if (! $context->isPlatform() && (int) $model->getAttribute('tenant_id') !== $context->id()) {
                throw CrossTenantOperation::detected();
            }

            if ($model->isDirty('tenant_id')) {
                throw CrossTenantOperation::detected();
            }
        });
    }

    /**
     * @param  Builder<static>  $query
     * @return Builder<static>
     */
    public function scopeForCurrentTenant(Builder $query): Builder
    {
        $context = app(TenantContext::class);

        if ($context->isPlatform()) {
            return $query;
        }

        return $query->where($this->qualifyColumn('tenant_id'), $context->id());
    }

    public function tenantId(): int
    {
        return (int) $this->getAttribute('tenant_id');
    }

    public function resolveRouteBindingQuery($query, $value, $field = null)
    {
        $context = app(TenantContext::class);
        $query = $query->where($field ?? $this->getRouteKeyName(), $value);

        if ($context->isPlatform()) {
            return $query;
        }

        return $query->where($this->qualifyColumn('tenant_id'), $context->id());
    }
}
