<?php

namespace App\Domain\Inventory\Http\Requests;

use App\Domain\Inventory\Enums\ProjectStatus;
use App\Domain\Inventory\Enums\ProjectType;
use Illuminate\Validation\Rule;

final class ProjectIndexRequest extends InventoryRequest
{
    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [
            'tenant_id' => ['prohibited'],
            'status' => ['sometimes', Rule::enum(ProjectStatus::class)],
            'project_type' => ['sometimes', Rule::enum(ProjectType::class)],
            'city' => ['sometimes', 'string', 'max:160'],
            'search' => ['sometimes', 'string', 'max:120'],
            'sort' => ['sometimes', Rule::in(['name', 'status', 'progress', 'total_units', 'created_at', 'updated_at'])],
            'direction' => ['sometimes', Rule::in(['asc', 'desc'])],
            'per_page' => ['sometimes', 'integer', 'min:1', 'max:100'],
            'page' => ['sometimes', 'integer', 'min:1'],
        ];
    }

    public function perPage(): int
    {
        return (int) $this->validated('per_page', 20);
    }
}
