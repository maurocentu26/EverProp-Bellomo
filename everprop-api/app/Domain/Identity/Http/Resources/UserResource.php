<?php

namespace App\Domain\Identity\Http\Resources;

use App\Domain\Identity\Enums\Capability;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

final class UserResource extends JsonResource
{
    /** @return array<string, mixed> */
    public function toArray(Request $request): array
    {
        /** @var User $user */
        $user = $this->resource;

        return [
            'id' => $user->public_id,
            'display_name' => $user->display_name,
            'email' => $user->email,
            'phone_e164' => $user->phone_e164,
            'role' => $user->role()->value,
            'status' => $user->statusCode()->value,
            'capabilities' => array_map(
                static fn (Capability $capability): string => $capability->value,
                $user->capabilities(),
            ),
            'tenant' => $this->whenLoaded('tenant', fn (): array => [
                'id' => $user->tenant->public_id,
                'name' => $user->tenant->name,
                'slug' => $user->tenant->slug,
                'timezone' => $user->tenant->timezone,
                'status' => $user->tenant->statusCode()->value,
            ]),
        ];
    }
}
