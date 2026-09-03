<?php

namespace App\Domain\Inventory\Http\Requests;

use App\Domain\Tenancy\TenantContext;
use Illuminate\Foundation\Http\FormRequest;

abstract class InventoryRequest extends FormRequest
{
    public function authorize(): bool
    {
        // Domain policies are invoked explicitly by inventory controllers.
        return true;
    }

    protected function tenantId(): int
    {
        return app(TenantContext::class)->id();
    }

    /** @return array<string, list<string>> */
    protected function serverOwnedRules(): array
    {
        return [
            'id' => ['prohibited'],
            'tenant_id' => ['prohibited'],
            'public_id' => ['prohibited'],
            'created_at' => ['prohibited'],
            'updated_at' => ['prohibited'],
            'deleted_at' => ['prohibited'],
        ];
    }
}
