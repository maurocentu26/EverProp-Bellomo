<?php

namespace App\Domain\AgentRuntime\Tools;

use App\Domain\Inventory\Enums\ProjectStatus;
use Carbon\CarbonImmutable;
use Illuminate\Database\Query\Builder;
use Illuminate\Support\Facades\DB;

/**
 * Live inventory as the anonymous visitor sees it: same rule as the public catalogue
 * (Property::publiclyVisible — AVAILABLE, not deleted, loose or inside a public project), always
 * filtered by the run's tenant. Read at call time, never from an index copy (ADR D05).
 * Price is only shown when amount AND currency exist; otherwise null = "no confirmado".
 */
final class PublicInventory
{
    public const PAGE_MAX = 10;

    /**
     * How property tools name a property: the id from buscar_propiedades or the exact code the visitor
     * said. The gateway resolves the code (one tool round per turn leaves the model without ids).
     */
    public const PROPERTY_REF = [
        'property_id' => ['type' => 'string', 'format' => 'uuid'],
        'unit_code' => ['type' => 'string', 'minLength' => 1, 'maxLength' => 80],
    ];

    public const PROPERTY_REF_HINT = ' Identificá la propiedad con property_id (de buscar_propiedades) o con unit_code, el código exacto '
        .'que dijo el visitante (por ejemplo 12A); uno solo, nunca los dos.';

    public function query(int $tenantId): Builder
    {
        return DB::table('properties as p')
            ->leftJoin('projects as pr', fn ($j) => $j->on('pr.id', '=', 'p.project_id')->on('pr.tenant_id', '=', 'p.tenant_id'))
            ->where('p.tenant_id', $tenantId)
            ->whereNull('p.deleted_at')
            ->where('p.status', 'AVAILABLE')
            ->where(fn ($q) => $q->whereNull('p.project_id')
                ->orWhere(fn ($o) => $o->whereNull('pr.deleted_at')->whereIn('pr.status', ProjectStatus::publicValues())));
    }

    public function find(int $tenantId, string $publicId): ?object
    {
        return $this->query($tenantId)->where('p.public_id', $publicId)->first($this->columns());
    }

    /**
     * Public id of the tenant's property with this unit code (unique per tenant, same collation), visible or not:
     * it only names the request, so a replay still finds its stored result after the unit is sold. Visibility is
     * enforced by the tool (find / idOrFail) with the same NOT_FOUND, so nothing tells sold from unknown.
     */
    public function publicIdForCode(int $tenantId, string $code): ?string
    {
        $id = DB::table('properties')->where('tenant_id', $tenantId)->where('code', trim($code))->value('public_id');

        return $id === null ? null : (string) $id;
    }

    /** Internal id of a visible property, or NOT_FOUND (deleted, withdrawn, other tenant, unknown). */
    public function idOrFail(int $tenantId, string $publicId): int
    {
        $id = $this->query($tenantId)->where('p.public_id', $publicId)->value('p.id');

        return $id === null ? throw new ToolError('NOT_FOUND', 'La propiedad no está disponible.') : (int) $id;
    }

    /** @return list<string> */
    public function columns(): array
    {
        return ['p.id', 'p.public_id', 'p.code', 'p.title', 'p.operation', 'p.category', 'p.status', 'p.price', 'p.currency_code',
            'p.city', 'p.province', 'p.neighborhood', 'p.bedrooms', 'p.bathrooms', 'p.area_m2', 'p.description', 'p.version',
            'p.updated_at', 'pr.public_id as project_public_id', 'pr.name as project_name'];
    }

    /** @return array<string, mixed> */
    public function summary(object $p): array
    {
        return [
            'id' => $p->public_id,
            'code' => $p->code,
            'title' => $p->title,
            'operation' => $p->operation,
            'category' => $p->category,
            'price' => $p->price !== null && $p->currency_code !== null ? ['amount' => number_format((float) $p->price, 2, '.', ''), 'currency' => $p->currency_code] : null,
            'availability' => $p->status,
            'city' => $p->city,
            'project' => $p->project_name,
            'as_of' => CarbonImmutable::now('UTC')->toIso8601String(),
            'version' => (int) $p->version,
        ];
    }

    /** @return array<string, mixed> */
    public function detail(object $p): array
    {
        return $this->summary($p) + [
            'province' => $p->province,
            'neighborhood' => $p->neighborhood,
            'bedrooms' => $p->bedrooms === null ? null : (int) $p->bedrooms,
            'bathrooms' => $p->bathrooms === null ? null : (int) $p->bathrooms,
            'area_m2' => $p->area_m2 === null ? null : (string) $p->area_m2,
            // Listing text is tenant-authored data, not instructions: bounded and labelled as such.
            'description' => $p->description === null ? null : mb_substr(strip_tags((string) $p->description), 0, 1200),
            'updated_at' => CarbonImmutable::parse($p->updated_at, 'UTC')->toIso8601String(),
        ];
    }
}
