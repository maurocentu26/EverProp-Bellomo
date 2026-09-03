<?php

namespace App\Domain\Inventory\Http\Requests;

use App\Domain\Inventory\Enums\ProjectStatus;
use App\Domain\Inventory\Enums\ProjectType;
use Illuminate\Database\Query\Builder;
use Illuminate\Validation\Rule;

final class StoreProjectRequest extends InventoryRequest
{
    /** @return array<string, mixed> */
    public function rules(): array
    {
        return $this->serverOwnedRules() + [
            'code' => [
                'nullable', 'string', 'max:80',
                Rule::unique('projects', 'code')->where(
                    fn (Builder $query): Builder => $query->where('tenant_id', $this->tenantId())
                ),
            ],
            'name' => ['required', 'string', 'max:200'],
            'project_type' => ['required', Rule::enum(ProjectType::class)],
            'status' => ['sometimes', Rule::enum(ProjectStatus::class)],
            'progress' => ['sometimes', 'integer', 'min:0', 'max:100'],
            'total_units' => ['sometimes', 'integer', 'min:0'],
            'city' => ['required', 'string', 'max:160'],
            'province' => ['required', 'string', 'max:160'],
            'address' => ['nullable', 'string', 'max:500'],
            'description' => ['nullable', 'string', 'max:100000'],
            'masterplan_image_url' => ['nullable', 'url:https', 'max:2048'],
        ];
    }
}
