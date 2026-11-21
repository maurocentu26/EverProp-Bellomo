<?php

namespace App\Domain\CRM\Services;

use Illuminate\Database\Query\Builder;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;

/**
 * EVP-178: interest sheets of a lead (lead_interests) and their unit link in lead_properties, which visits,
 * statistics and collections keep reading.
 */
final class LeadInterests
{
    /**
     * Interests are shown even when their unit or project was later soft-deleted (the sheet is commercial history);
     * `property_deleted` tells the UI so it does not offer that unit for new actions.
     *
     * @return list<array<string, mixed>>
     */
    public function forLead(int $tenantId, int $leadId, bool $canViewPrices, bool $sensitive): array
    {
        return $this->query($tenantId)->where('li.lead_id', $leadId)->whereNull('li.deleted_at')->orderBy('li.id')->get()
            ->map(fn (object $row): array => $this->present($row, $canViewPrices, $sensitive))->values()->all();
    }

    /** @return array<string, mixed>|null */
    public function one(int $tenantId, int $id, bool $canViewPrices, bool $sensitive): ?array
    {
        $row = $this->query($tenantId)->where('li.id', $id)->first();

        return $row ? $this->present($row, $canViewPrices, $sensitive) : null;
    }

    private function query(int $tenantId): Builder
    {
        return DB::table('lead_interests as li')
            ->leftJoin('projects', fn ($j) => $j->on('projects.id', '=', 'li.project_id')->on('projects.tenant_id', '=', 'li.tenant_id'))
            ->leftJoin('properties', fn ($j) => $j->on('properties.id', '=', 'li.property_id')->on('properties.tenant_id', '=', 'li.tenant_id'))
            ->where('li.tenant_id', $tenantId)
            ->select([
                'li.*', 'projects.public_id as project_public_id', 'projects.name as project_name',
                'properties.public_id as property_public_id', 'properties.title as property_title', 'properties.unit_number',
                'properties.deleted_at as property_deleted_at',
            ]);
    }

    /** @return array<string, mixed> */
    private function present(object $row, bool $canViewPrices, bool $sensitive): array
    {
        $date = fn (?string $value): ?string => $value ? Carbon::parse($value, 'UTC')->toISOString() : null;

        return [
            'id' => $row->public_id,
            'project_id' => $row->project_public_id,
            'project_name' => $row->project_name,
            'property_id' => $row->property_public_id,
            'property_title' => $row->property_title,
            'property_deleted' => $row->property_deleted_at !== null,
            'unit_number' => $row->unit_number,
            'operation' => $row->operation,
            'category' => $row->category,
            'prototype_label' => $row->prototype_label,
            'how_heard' => $row->how_heard,
            'first_contact_at' => $date($row->first_contact_at),
            'first_contact_channel' => $row->first_contact_channel,
            'payment_method' => $row->payment_method,
            'installments_count' => $row->installments_count === null ? null : (int) $row->installments_count,
            'interest_level' => $row->interest_level,
            'status' => $row->status,
            'quoted_price' => $canViewPrices && $row->quoted_price !== null ? (float) $row->quoted_price : null,
            'quoted_currency_code' => $canViewPrices ? $row->quoted_currency_code : null,
            'preferences' => $row->preferences,
            'notes' => $row->notes,
            'participants' => array_map(fn (array $p): array => $sensitive ? $p : [...$p, 'document' => null, 'phone' => null, 'income' => null],
                $row->participants_json ? (array) json_decode($row->participants_json, true) : []),
            'created_at' => $date($row->created_at),
            'updated_at' => $date($row->updated_at),
        ];
    }

    /**
     * Mirrors the newest live interest naming this unit into lead_properties, read by visits, statistics and
     * collections. Links created here carry metadata_json.source = lead_interest. When no live interest names the
     * unit any more (deleted, or moved to another property_id) only such a link is set to DISCARDED, never deleted;
     * a link created by hand (attachProperty, public form, pre-EVP-178 backfill) is left untouched. Call inside the
     * write transaction: the link row (or its gap) is locked before the interests are read.
     */
    public function syncUnitLink(int $tenantId, int $leadId, ?int $propertyId, int $userId): void
    {
        if ($propertyId === null) {
            return;
        }
        $key = ['tenant_id' => $tenantId, 'lead_id' => $leadId, 'property_id' => $propertyId];
        $link = DB::table('lead_properties')->where($key)->lockForUpdate()->first();
        $interest = DB::table('lead_interests')->where($key)->whereNull('deleted_at')
            ->orderByDesc('updated_at')->orderByDesc('id')->first();
        $now = Carbon::now('UTC');

        if (! $interest) {
            $source = $link && $link->metadata_json ? (json_decode($link->metadata_json, true)['source'] ?? null) : null;
            if ($source === 'lead_interest') {
                DB::table('lead_properties')->where($key)->update(['status' => 'DISCARDED', 'last_activity_at' => $now]);
            }

            return;
        }
        $values = ['interest_level' => $interest->interest_level, 'status' => $interest->status, 'last_activity_at' => $now];
        if ($interest->quoted_price !== null) {
            $values += ['quoted_price' => $interest->quoted_price, 'quoted_currency_code' => $interest->quoted_currency_code];
        }
        if ($link) {
            DB::table('lead_properties')->where($key)->update($values);
        } else {
            DB::table('lead_properties')->insert($key + $values + [
                'linked_by_user_id' => $userId, 'linked_at' => $now, 'metadata_json' => json_encode(['source' => 'lead_interest']),
            ]);
        }
    }

    /** @return array{prototype_label: list<string>, how_heard: list<string>, payment_method: list<string>} */
    public function suggestions(int $tenantId): array
    {
        $result = [];
        foreach (['prototype_label', 'how_heard', 'payment_method'] as $column) {
            $result[$column] = DB::table('lead_interests')->where('tenant_id', $tenantId)->whereNull('deleted_at')
                ->whereNotNull($column)->where($column, '<>', '')
                ->groupBy($column)->orderByRaw('COUNT(*) DESC')->orderBy($column)->limit(50)
                ->pluck($column)->map(fn ($v): string => (string) $v)->values()->all();
        }

        /** @var array{prototype_label: list<string>, how_heard: list<string>, payment_method: list<string>} $result */
        return $result;
    }
}
