<?php

namespace App\Domain\CRM\Support;

use Illuminate\Support\Facades\DB;

/**
 * EVP-177: versioned extended profile of a contact, stored under contacts.profile_json.extended so the other
 * profile_json keys (declared_phone, unverified_fields, ...) written by the agent runtime are never touched.
 *
 * Patch semantics: a block missing from the payload is kept; an object block (personal, employment, guarantor,
 * currentHousing) merges field by field; a list (addresses, currentHousing.assets) replaces the whole list;
 * a block sent as null is removed.
 */
final class ContactExtendedProfile
{
    public const VERSION = 1;

    public const KEY = 'extended';

    public const HOUSING_STATUSES = ['AGREGADO', 'LOAN_FOR_USE', 'TENANT', 'OWNER'];

    private const OBJECT_BLOCKS = ['personal', 'employment', 'guarantor', 'currentHousing'];

    private const LIST_BLOCKS = ['addresses'];

    /** @return array<string, mixed> Laravel rules for the `profile` request field. */
    public static function rules(string $p = 'profile'): array
    {
        $text = 'nullable|string|max:200';
        $money = 'nullable|numeric|min:0|max:999999999999';

        return [
            $p => 'sometimes|nullable|array:personal,addresses,employment,guarantor,currentHousing',
            "$p.personal" => 'nullable|array:documentNumber,taxId,taxCondition,nationality,maritalStatus,birthDate,childrenCount',
            "$p.personal.documentNumber" => 'nullable|string|max:20',
            "$p.personal.taxId" => 'nullable|string|max:20',
            "$p.personal.taxCondition" => 'nullable|string|max:80',
            "$p.personal.nationality" => 'nullable|string|max:80',
            "$p.personal.maritalStatus" => 'nullable|string|max:40',
            "$p.personal.birthDate" => 'nullable|date_format:Y-m-d|after:1900-01-01|before_or_equal:today',
            "$p.personal.childrenCount" => 'nullable|integer|min:0|max:50',
            "$p.addresses" => 'nullable|array|max:10',
            "$p.addresses.*" => 'array:street,floorAndUnit,neighborhood,city,province',
            "$p.addresses.*.street" => $text,
            "$p.addresses.*.floorAndUnit" => 'nullable|string|max:40',
            "$p.addresses.*.neighborhood" => 'nullable|string|max:120',
            "$p.addresses.*.city" => 'nullable|string|max:120',
            "$p.addresses.*.province" => 'nullable|string|max:120',
            "$p.employment" => 'nullable|array:employer,phone,email,profession,role,income',
            "$p.employment.employer" => $text,
            "$p.employment.phone" => 'nullable|string|max:40',
            "$p.employment.email" => 'nullable|email|max:320',
            "$p.employment.profession" => 'nullable|string|max:120',
            "$p.employment.role" => 'nullable|string|max:120',
            "$p.employment.income" => $money,
            "$p.guarantor" => 'nullable|array:name,documentNumber,phone,address,employer,role,income',
            "$p.guarantor.name" => $text,
            "$p.guarantor.documentNumber" => 'nullable|string|max:20',
            "$p.guarantor.phone" => 'nullable|string|max:40',
            "$p.guarantor.address" => 'nullable|string|max:300',
            "$p.guarantor.employer" => $text,
            "$p.guarantor.role" => 'nullable|string|max:120',
            "$p.guarantor.income" => $money,
            "$p.currentHousing" => 'nullable|array:status,notes,assets',
            "$p.currentHousing.status" => 'nullable|string|in:'.implode(',', self::HOUSING_STATUSES),
            "$p.currentHousing.notes" => 'nullable|string|max:2000',
            "$p.currentHousing.assets" => 'nullable|array|max:20',
            "$p.currentHousing.assets.*" => 'array:value,typology,quantity',
            "$p.currentHousing.assets.*.value" => $money,
            "$p.currentHousing.assets.*.typology" => 'nullable|string|max:120',
            "$p.currentHousing.assets.*.quantity" => 'nullable|integer|min:0|max:1000',
        ];
    }

    /** @return array<string, mixed> profile_json decoded; garbage or null becomes []. */
    public static function decode(mixed $json): array
    {
        $decoded = is_string($json) ? json_decode($json, true) : null;

        return is_array($decoded) ? $decoded : [];
    }

    /** @return array<string, mixed>|null the extended block for API responses (null when never filled). */
    public static function read(mixed $json, bool $sensitive = true): ?array
    {
        $extended = self::decode($json)[self::KEY] ?? null;
        if (! is_array($extended)) {
            return null;
        }
        // Without $sensitive: no DNI, CUIT, incomes nor guarantor (READ_ONLY).
        if (! $sensitive) {
            unset($extended['guarantor'], $extended['personal']['documentNumber'], $extended['personal']['taxId'], $extended['employment']['income']);
        }

        return $extended;
    }

    /**
     * Applies a validated patch to the whole profile_json and returns it encoded, other keys untouched.
     *
     * @param  array<string, mixed>  $patch
     */
    public static function apply(mixed $json, array $patch): string
    {
        $profile = self::decode($json);
        $extended = is_array($profile[self::KEY] ?? null) ? $profile[self::KEY] : [];
        foreach ($patch as $block => $value) {
            if ($value === null) {
                unset($extended[$block]);
            } elseif (in_array($block, self::OBJECT_BLOCKS, true)) {
                $extended[$block] = array_replace(is_array($extended[$block] ?? null) ? $extended[$block] : [], $value);
            } elseif (in_array($block, self::LIST_BLOCKS, true)) {
                $extended[$block] = array_values($value);
            }
        }
        $extended['version'] = self::VERSION;
        $profile[self::KEY] = $extended;

        return json_encode($profile, JSON_THROW_ON_ERROR | JSON_UNESCAPED_UNICODE);
    }

    /** Digits only, so "20-12345678-3" and "20123456783" match the same CUIT. */
    public static function normalizeDocument(string $value): string
    {
        return (string) preg_replace('/\D+/', '', $value);
    }

    /**
     * Previous values of this tenant for autocomplete.
     *
     * ponytail: scans the latest 2000 profiles of the tenant in PHP; past that, move to generated/indexed columns.
     *
     * @return array{neighborhoods: list<string>, cities: list<string>, provinces: list<string>, taxConditions: list<string>}
     */
    public static function suggestions(int $tenantId): array
    {
        $out = ['neighborhoods' => [], 'cities' => [], 'provinces' => [], 'taxConditions' => []];
        $rows = DB::table('contacts')->where('tenant_id', $tenantId)->whereNull('deleted_at')
            ->whereRaw("JSON_CONTAINS_PATH(profile_json, 'one', '$.extended')")
            ->orderByDesc('updated_at')->limit(2000)->pluck('profile_json');
        foreach ($rows as $json) {
            $extended = self::read($json) ?? [];
            foreach ((array) ($extended['addresses'] ?? []) as $address) {
                foreach (['neighborhood' => 'neighborhoods', 'city' => 'cities', 'province' => 'provinces'] as $field => $bucket) {
                    $out[$bucket][] = is_array($address) ? ($address[$field] ?? null) : null;
                }
            }
            $out['taxConditions'][] = $extended['personal']['taxCondition'] ?? null;
        }

        return array_map(function (array $values): array {
            $clean = array_values(array_unique(array_filter(array_map(fn ($v) => is_string($v) ? trim($v) : '', $values), fn ($v) => $v !== '')));
            sort($clean, SORT_NATURAL | SORT_FLAG_CASE);

            return array_slice($clean, 0, 200);
        }, $out);
    }
}
