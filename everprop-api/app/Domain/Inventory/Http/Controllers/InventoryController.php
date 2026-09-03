<?php

namespace App\Domain\Inventory\Http\Controllers;

use App\Domain\Inventory\Models\Project;
use App\Domain\Inventory\Models\Property;
use App\Domain\Inventory\Models\PropertyFeature;
use App\Domain\Inventory\Models\PropertyMedia;
use App\Domain\Tenancy\TenantContext;
use App\Http\Controllers\Controller;
use App\Models\User;
use Illuminate\Auth\Access\AuthorizationException;
use Illuminate\Auth\AuthenticationException;
use Illuminate\Http\Request;

abstract class InventoryController extends Controller
{
    public function __construct(protected readonly TenantContext $tenantContext) {}

    protected function user(Request $request): User
    {
        $user = $request->user();

        if (! $user instanceof User) {
            throw new AuthenticationException;
        }

        return $user;
    }

    protected function authorizeAction(bool $allowed): void
    {
        if (! $allowed) {
            throw new AuthorizationException;
        }
    }

    protected function findProject(string $publicId): Project
    {
        return Project::query()
            ->where('tenant_id', $this->tenantContext->id())
            ->where('public_id', $publicId)
            ->firstOrFail();
    }

    protected function findProperty(string $publicId): Property
    {
        return Property::query()
            ->where('tenant_id', $this->tenantContext->id())
            ->where('public_id', $publicId)
            ->firstOrFail();
    }

    protected function findFeature(Property $property, int $featureId): PropertyFeature
    {
        return PropertyFeature::query()
            ->where('tenant_id', $this->tenantContext->id())
            ->where('property_id', $property->getKey())
            ->whereKey($featureId)
            ->firstOrFail();
    }

    protected function findMedia(Property $property, int $mediaId): PropertyMedia
    {
        return PropertyMedia::query()
            ->where('tenant_id', $this->tenantContext->id())
            ->where('property_id', $property->getKey())
            ->whereKey($mediaId)
            ->firstOrFail();
    }
}
