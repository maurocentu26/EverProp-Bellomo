<?php

namespace App\Domain\Inventory\Services;

use App\Domain\Inventory\Models\Project;
use App\Domain\Inventory\Models\Property;
use Illuminate\Database\Eloquent\Builder;

final class InventoryFilters
{
    private const PROJECT_SORTS = [
        'name' => 'projects.name',
        'status' => 'projects.status',
        'progress' => 'projects.progress',
        'total_units' => 'projects.total_units',
        'created_at' => 'projects.created_at',
        'updated_at' => 'projects.updated_at',
    ];

    private const PROPERTY_SORTS = [
        'title' => 'properties.title',
        'status' => 'properties.status',
        'price' => 'properties.price',
        'area_m2' => 'properties.area_m2',
        'bedrooms' => 'properties.bedrooms',
        'created_at' => 'properties.created_at',
        'updated_at' => 'properties.updated_at',
    ];

    /** @param Builder<Project> $query
     * @param  array<string, mixed>  $filters
     * @return Builder<Project>
     */
    public function projects(Builder $query, array $filters): Builder
    {
        $query
            ->when($filters['status'] ?? null, fn (Builder $builder, mixed $value): Builder => $builder->where('projects.status', $value))
            ->when($filters['project_type'] ?? null, fn (Builder $builder, mixed $value): Builder => $builder->where('projects.project_type', $value))
            ->when($filters['city'] ?? null, fn (Builder $builder, mixed $value): Builder => $builder->where('projects.city', $value))
            ->when($filters['search'] ?? null, function (Builder $builder, mixed $value): void {
                $needle = '%'.addcslashes((string) $value, '%_\\').'%';
                $builder->where(static function (Builder $search) use ($needle): void {
                    $search->where('projects.name', 'like', $needle)
                        ->orWhere('projects.code', 'like', $needle);
                });
            });

        $sort = self::PROJECT_SORTS[(string) ($filters['sort'] ?? 'created_at')] ?? self::PROJECT_SORTS['created_at'];
        $direction = ($filters['direction'] ?? 'desc') === 'asc' ? 'asc' : 'desc';

        return $query->orderBy($sort, $direction)->orderBy('projects.id', $direction);
    }

    /** @param Builder<Property> $query
     * @param  array<string, mixed>  $filters
     * @return Builder<Property>
     */
    public function properties(Builder $query, array $filters): Builder
    {
        $query
            ->when($filters['status'] ?? null, fn (Builder $builder, mixed $value): Builder => $builder->where('properties.status', $value))
            ->when($filters['operation'] ?? null, fn (Builder $builder, mixed $value): Builder => $builder->where('properties.operation', $value))
            ->when($filters['category'] ?? null, fn (Builder $builder, mixed $value): Builder => $builder->where('properties.category', $value))
            ->when($filters['project_id'] ?? null, fn (Builder $builder, mixed $value): Builder => $builder->where('properties.project_id', $value))
            ->when($filters['project'] ?? null, fn (Builder $builder, mixed $value): Builder => $builder->whereHas(
                'project',
                fn (Builder $project): Builder => $project->where('projects.public_id', $value),
            ))
            ->when($filters['city'] ?? null, fn (Builder $builder, mixed $value): Builder => $builder->where('properties.city', $value))
            ->when($filters['neighborhood'] ?? null, fn (Builder $builder, mixed $value): Builder => $builder->where('properties.neighborhood', $value))
            ->when($filters['bedrooms_min'] ?? null, fn (Builder $builder, mixed $value): Builder => $builder->where('properties.bedrooms', '>=', $value))
            ->when($filters['bedrooms_max'] ?? null, fn (Builder $builder, mixed $value): Builder => $builder->where('properties.bedrooms', '<=', $value))
            ->when($filters['price_min'] ?? null, fn (Builder $builder, mixed $value): Builder => $builder->where('properties.price', '>=', $value))
            ->when($filters['price_max'] ?? null, fn (Builder $builder, mixed $value): Builder => $builder->where('properties.price', '<=', $value))
            ->when($filters['search'] ?? null, function (Builder $builder, mixed $value): void {
                $needle = '%'.addcslashes((string) $value, '%_\\').'%';
                $builder->where(static function (Builder $search) use ($needle): void {
                    $search->where('properties.title', 'like', $needle)
                        ->orWhere('properties.code', 'like', $needle)
                        ->orWhere('properties.sector_name', 'like', $needle)
                        ->orWhere('properties.unit_number', 'like', $needle);
                });
            });

        $sort = self::PROPERTY_SORTS[(string) ($filters['sort'] ?? 'created_at')] ?? self::PROPERTY_SORTS['created_at'];
        $direction = ($filters['direction'] ?? 'desc') === 'asc' ? 'asc' : 'desc';

        return $query->orderBy($sort, $direction)->orderBy('properties.id', $direction);
    }
}
