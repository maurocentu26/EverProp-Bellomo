<?php

namespace App\Domain\Inventory\Http\Requests;

use App\Domain\Inventory\Enums\PropertyStatus;
use Illuminate\Validation\Rule;

final class PublishPropertyRequest extends InventoryRequest
{
    /** @return array<string, mixed> */
    public function rules(): array
    {
        return $this->serverOwnedRules() + [
            'version' => ['required', 'integer', 'min:1'],
            'status' => ['required', Rule::in([PropertyStatus::AVAILABLE->value])],
        ];
    }
}
