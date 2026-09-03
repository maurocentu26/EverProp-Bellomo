<?php

namespace App\Domain\Tenancy\Database\Scopes;

use App\Domain\Tenancy\Exceptions\TenantContextMissing;
use App\Domain\Tenancy\TenantContext;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Scope;

/** @implements Scope<Model> */
final class TenantScope implements Scope
{
    public function apply(Builder $builder, Model $model): void
    {
        if (! app()->bound(TenantContext::class)) {
            throw TenantContextMissing::forTenantOperation();
        }

        $context = app(TenantContext::class);

        if ($context->isPlatform()) {
            return;
        }

        $builder->where($model->qualifyColumn('tenant_id'), $context->id());
    }
}
