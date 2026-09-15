<?php

namespace App\Domain\Inventory\Http\Requests;

use App\Domain\Inventory\Enums\ProjectStatus;
use App\Domain\Tenancy\TenantContext;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;
use Illuminate\Validation\Rules\In;

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

    /** @param class-string<\BackedEnum> $enum */
    protected function sourceEnum(string $field, string $enum): In
    {
        $values = array_map(fn (\BackedEnum $case) => $case->value, $enum::cases());
        $extended = ['NOT_SELLABLE', 'NOT_MARKETED', 'UNKNOWN', 'LEASING'];
        if ($enum === ProjectStatus::class) {
            $extended[] = 'AVAILABLE';
        }
        if (in_array($this->input($field), $extended, true)
            && ! DB::table('schema_versions')->where('version', '2026-09-15.001')->exists()) {
            $values = array_values(array_diff($values, $extended));
        }

        return Rule::in($values);
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
