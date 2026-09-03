<?php

namespace App\Domain\Inventory\Http\Requests;

use App\Domain\Inventory\Enums\ProjectStatus;
use Illuminate\Validation\Rule;

final class PublishProjectRequest extends InventoryRequest
{
    /** @return array<string, mixed> */
    public function rules(): array
    {
        return $this->serverOwnedRules() + [
            'status' => ['required', Rule::in(ProjectStatus::publicValues())],
        ];
    }
}
