<?php

namespace App\Domain\Tenancy\Contracts;

use App\Domain\Tenancy\Models\Tenant;
use Illuminate\Http\Request;

interface TenantResolver
{
    public function resolve(Request $request): Tenant;
}
