<?php

namespace App\Domain\Inventory\Http\Requests;

use App\Domain\Inventory\Enums\ProjectStatus;
use App\Domain\Inventory\Enums\ProjectType;
use Illuminate\Database\Query\Builder;
use Illuminate\Validation\Rule;

final class UpdateProjectRequest extends InventoryRequest
{
    /** @return array<string, mixed> */
    public function rules(): array
    {
        $routePublicId = (string) $this->route('project');

        return $this->serverOwnedRules() + [
            'code' => [
                'sometimes', 'nullable', 'string', 'max:80',
                Rule::unique('projects', 'code')->where(
                    fn (Builder $query): Builder => $query
                        ->where('tenant_id', $this->tenantId())
                        ->where('public_id', '<>', $routePublicId)
                ),
            ],
            'name' => ['sometimes', 'string', 'max:200'],
            'project_type' => ['sometimes', Rule::enum(ProjectType::class)],
            'status' => ['sometimes', Rule::enum(ProjectStatus::class)],
            'progress' => ['sometimes', 'integer', 'min:0', 'max:100'],
            'total_units' => ['sometimes', 'integer', 'min:0'],
            'city' => ['sometimes', 'string', 'max:160'],
            'province' => ['sometimes', 'string', 'max:160'],
            'address' => ['sometimes', 'nullable', 'string', 'max:500'],
            'description' => ['sometimes', 'nullable', 'string', 'max:100000'],
            'masterplan_image_url' => ['sometimes', 'nullable', 'url:https', 'max:2048'],
        ];
    }
}
