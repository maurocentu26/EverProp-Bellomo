<?php

namespace Database\Factories;

use App\Domain\Tenancy\Enums\TenantStatus;
use App\Domain\Tenancy\Models\Tenant;
use Illuminate\Database\Eloquent\Factories\Factory;
use Illuminate\Support\Str;

/** @extends Factory<Tenant> */
final class TenantFactory extends Factory
{
    protected $model = Tenant::class;

    /** @return array<string, mixed> */
    public function definition(): array
    {
        $name = fake()->unique()->company();

        return [
            'public_id' => (string) Str::uuid(),
            'name' => $name,
            'slug' => Str::slug($name).'-'.fake()->unique()->numberBetween(1000, 9999),
            'timezone' => 'America/Argentina/Salta',
            'status' => TenantStatus::ACTIVE->value,
            // Test tenants opt in to the assistant and copilot (EVP-L01), so the platform flags drive older tests.
            // Real tenants default to off; AiSettingsTest covers that with settings_json = null.
            'settings_json' => ['conversations' => ['ai_enabled' => true, 'copilot_enabled' => true]],
        ];
    }
}
