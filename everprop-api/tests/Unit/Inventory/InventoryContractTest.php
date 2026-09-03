<?php

namespace Tests\Unit\Inventory;

use App\Domain\Inventory\Enums\ProjectStatus;
use App\Domain\Inventory\Enums\PropertyStatus;
use App\Domain\Inventory\Http\Requests\PropertyIndexRequest;
use App\Domain\Inventory\Models\Project;
use App\Domain\Inventory\Models\Property;
use App\Domain\Inventory\Models\PropertyFeature;
use App\Domain\Inventory\Models\PropertyMedia;
use App\Domain\Inventory\Services\InventoryFilters;
use App\Domain\Tenancy\Models\Tenant;
use App\Domain\Tenancy\TenantContext;
use Illuminate\Support\Facades\Validator;
use Tests\TestCase;

final class InventoryContractTest extends TestCase
{
    protected function setUp(): void
    {
        parent::setUp();

        $tenant = new Tenant;
        $tenant->forceFill(['id' => 19]);
        $tenant->exists = true;
        $this->app->instance(TenantContext::class, TenantContext::forTenant($tenant));
    }

    public function test_tenant_id_is_not_mass_assignable_on_inventory_models(): void
    {
        foreach ([new Project, new Property, new PropertyFeature, new PropertyMedia] as $model) {
            $model->fill(['tenant_id' => 999]);
            self::assertNull($model->getAttribute('tenant_id'));
        }
    }

    public function test_publication_values_match_the_real_schema_contract(): void
    {
        self::assertSame(
            ['PRE_SALE', 'UNDER_CONSTRUCTION', 'COMPLETED'],
            ProjectStatus::publicValues(),
        );
        self::assertSame('AVAILABLE', PropertyStatus::AVAILABLE->value);
    }

    public function test_filter_service_falls_back_to_an_allowlisted_sort_column(): void
    {
        $query = (new InventoryFilters)->properties(
            Property::query()->withoutGlobalScopes(),
            ['sort' => 'tenant_id desc, id', 'direction' => 'asc'],
        );

        self::assertStringContainsString('order by `properties`.`created_at` asc', $query->toSql());
        self::assertStringNotContainsString('tenant_id desc', $query->toSql());
    }

    public function test_public_property_scope_requires_available_status(): void
    {
        $query = Property::query()->withoutGlobalScopes()->publiclyVisible();

        self::assertContains(PropertyStatus::AVAILABLE->value, $query->getBindings());
    }

    public function test_pagination_is_capped_and_tenant_input_is_rejected(): void
    {
        $rules = (new PropertyIndexRequest)->rules();

        self::assertTrue(Validator::make(['per_page' => 100], $rules)->passes());
        self::assertTrue(Validator::make(['per_page' => 101], $rules)->fails());
        self::assertTrue(Validator::make(['tenant_id' => 19], $rules)->fails());
    }
}
