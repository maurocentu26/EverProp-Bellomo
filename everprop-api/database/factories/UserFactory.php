<?php

namespace Database\Factories;

use App\Domain\Identity\Enums\RoleCode;
use App\Domain\Identity\Enums\UserStatus;
use App\Domain\Tenancy\Models\Tenant;
use App\Models\User;
use Illuminate\Database\Eloquent\Factories\Factory;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;

/**
 * @extends Factory<User>
 */
class UserFactory extends Factory
{
    /**
     * The current password being used by the factory.
     */
    protected static ?string $password;

    /**
     * Define the model's default state.
     *
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        return [
            'tenant_id' => Tenant::factory(),
            'public_id' => (string) Str::uuid(),
            'display_name' => fake()->name(),
            'email' => fake()->unique()->safeEmail(),
            'phone_e164' => null,
            'role_code' => RoleCode::SALES_ADVISOR->value,
            'status' => UserStatus::ACTIVE->value,
            'max_open_leads' => null,
            'password_hash' => static::$password ??= Hash::make('password'),
        ];
    }

    public function disabled(): static
    {
        return $this->state(fn (array $attributes) => [
            'status' => UserStatus::DISABLED->value,
        ]);
    }
}
