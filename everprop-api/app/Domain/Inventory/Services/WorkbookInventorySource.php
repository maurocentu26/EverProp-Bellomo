<?php

namespace App\Domain\Inventory\Services;

use InvalidArgumentException;

final class WorkbookInventorySource
{
    public const CATALOGS = [
        'ProdT01' => ['legacy_property_types', 'ProTId', 'ProTTip'],
        'Estado' => ['legacy_property_statuses', 'ProEId', 'ProEEst'],
        'Localidades' => ['legacy_localities', 'LocCod', 'LocDes'],
    ];

    public const HEADERS = [
        'Productos' => ['EdId', 'ProPis', 'ProDep', 'ProDes1', 'ProDes2', 'ProTId', 'ProEId', 'ProPre', 'ProPor', 'ProPro', 'AdmCod', 'ProUbic', 'ProIEId', 'ProIFec', 'ProComFor', 'SocId', 'ProComiVend', 'ProAlqDesc', 'ProAlqFDesc', 'ProCoC', 'ProCoCV', 'ProM2', 'ProCamUsuId', 'ProCamFec'],
        'Edificio' => ['EdId', 'EdNom', 'EdDir', 'EdBar', 'LocCod', 'RubCod', 'ConCod', 'EdIUIL', 'EdUIL1', 'EdEst', 'EdEFec', 'EdDueId', 'EdComi', 'EdRetImp', 'EdRem', 'EdRemOrig', 'EdIUlL', 'EdUlL1'],
        'ProdT01' => ['ProTId', 'ProTTip'],
        'Estado' => ['ProEId', 'ProEEst'],
        'Localidades' => ['LocCod', 'LocDes'],
    ];

    /** @param array<string, mixed> $source
     * @return array<string, mixed>
     */
    public function normalize(array $source): array
    {
        $this->require(preg_match('/^[a-f0-9]{64}$/i', $source['sha256'] ?? '') === 1, 'Workbook hash is missing');
        $this->require(count($source['sheets'] ?? []) === count(self::HEADERS), 'Exactly five source sheets are required');
        foreach (self::HEADERS as $name => $headers) {
            $sheet = $source['sheets'][$name] ?? [];
            $this->require(($sheet['headers'] ?? []) === $headers, 'Unexpected columns in '.$name);
            $this->require(($sheet['formulas'] ?? []) === [], 'Formula cells must be resolved in the source workbook');
            $this->require(is_array($sheet['records'] ?? null) && count($sheet['records']) > 0, 'Empty sheet '.$name);
            foreach ($sheet['records'] as $record) {
                $this->require(is_int($record['row'] ?? null) && $record['row'] > 1, 'Invalid source row');
                $this->require(array_keys($record['data'] ?? []) === $headers, 'Record columns differ in '.$name);
                foreach ($record['data'] as $value) {
                    $this->require(is_scalar($value) || $value === null, 'Non-scalar workbook cell');
                }
            }
        }
        $catalogs = [];
        foreach (self::CATALOGS as $sheet => [$table, $key, $label]) {
            $catalogs[$sheet] = $this->index($source['sheets'][$sheet]['records'], $key);
        }
        $buildings = $this->index($source['sheets']['Edificio']['records'], 'EdId');
        $properties = [];
        $counts = [];
        $categories = [];
        $issues = [];
        foreach ($source['sheets']['Productos']['records'] as $record) {
            $r = $record['data'];
            $this->require(is_int($r['EdId']) && $r['EdId'] > 0, 'Invalid EdId');
            $pis = trim((string) $r['ProPis']);
            $dep = trim((string) $r['ProDep']);
            $code = $r['EdId'].'-'.$pis.'-'.$dep;
            $this->require(strlen($pis) <= 40 && strlen($dep) <= 40 && strlen($code) <= 80, 'Property key exceeds database limits');
            $this->require(! isset($properties[mb_strtolower($code)]), 'Duplicate property key '.$code);
            foreach (['ProTId' => 'ProdT01', 'ProEId' => 'Estado'] as $key => $sheet) {
                $this->require($r[$key] === null || isset($catalogs[$sheet][$r[$key]]), 'Unknown catalog reference '.$key.' in '.$code);
                if ($r[$key] === null) {
                    $issues[] = ['sheet' => 'Productos', 'row' => $record['row'], 'key' => $code, 'issue' => 'Missing '.$key];
                }
            }
            $building = $buildings[$r['EdId']] ?? [];
            if ($building === []) {
                $issues[] = ['sheet' => 'Productos', 'row' => $record['row'], 'key' => $code, 'issue' => 'Missing Edificio parent'];
            }
            if ($pis === '' || $dep === '') {
                $issues[] = ['sheet' => 'Productos', 'row' => $record['row'], 'key' => $code, 'issue' => 'Blank unit key component'];
            }
            $area = $r['ProM2'];
            $this->require($area === null || (is_numeric($area) && is_finite((float) $area)), 'Invalid area '.$code);
            $this->require($r['ProPre'] === null || (is_numeric($r['ProPre']) && is_finite((float) $r['ProPre']) && $r['ProPre'] >= 0), 'Invalid price '.$code);
            if ($area !== null && $area <= 0) {
                $issues[] = ['sheet' => 'Productos', 'row' => $record['row'], 'key' => $code, 'issue' => 'Nonpositive area retained only in source'];
            }
            $category = match ($r['ProTId']) {
                1 => 'APARTMENT', 2 => 'GARAGE', 3 => 'LOCAL', 4, 5, 33 => 'HOUSE',
                9, 10, 12 => 'LOT', 11 => 'TRADITIONAL', default => 'UNKNOWN',
            };
            $label = trim($catalogs['ProdT01'][$r['ProTId']]['ProTTip'] ?? 'Sin tipo');
            $properties[mb_strtolower($code)] = [
                'code' => $code, 'legacy_ed_id' => $r['EdId'], 'legacy_pis' => $pis, 'legacy_dep' => $dep,
                'legacy_status_id' => $r['ProEId'], 'legacy_type_id' => $r['ProTId'],
                'title' => $pis !== '' || $dep !== '' ? $label.' '.$dep.' — '.$pis : 'Registro '.$r['EdId'].' sin unidad informada',
                'operation' => match ($r['ProEId']) {
                    1, 3 => 'RENT', 2, 4 => 'SALE', 5 => 'LEASING', default => 'UNKNOWN'
                },
                'status' => match ($r['ProEId']) {
                    1, 2 => 'AVAILABLE', 3 => 'RENTED', 4 => 'SOLD', 6 => 'RESERVED', 7 => 'NOT_SELLABLE', 8 => 'NOT_MARKETED', default => 'UNKNOWN'
                },
                'category' => $category, 'area_m2' => $area !== null && $area > 0 ? round((float) $area, 2) : null,
                'city' => trim($catalogs['Localidades'][$building['LocCod'] ?? null]['LocDes'] ?? ''),
                'neighborhood' => trim((string) $r['ProUbic']) ?: (trim($building['EdBar'] ?? '') ?: null),
                'sector_name' => $pis ?: null, 'unit_number' => $dep ?: null,
                'description' => trim(trim((string) $r['ProDes1']).' '.trim((string) $r['ProDes2'])) ?: null,
                'legacy_data_json' => $r,
            ];
            $counts[$r['EdId']] = ($counts[$r['EdId']] ?? 0) + 1;
            $categories[$r['EdId']][$category] = true;
        }
        $projects = [];
        foreach ($source['sheets']['Edificio']['records'] as $record) {
            $r = $record['data'];
            $this->require($r['LocCod'] === null || isset($catalogs['Localidades'][$r['LocCod']]), 'Unknown locality '.$r['EdId']);
            if ($r['LocCod'] === null) {
                $issues[] = ['sheet' => 'Edificio', 'row' => $record['row'], 'key' => $r['EdId'], 'issue' => 'Missing locality'];
            }
            $cats = $categories[$r['EdId']] ?? [];
            $projects[] = [
                'legacy_id' => $r['EdId'], 'name' => trim($r['EdNom']),
                'project_type' => isset($cats['APARTMENT']) ? 'BUILDING' : (isset($cats['LOT']) || str_contains(mb_strtoupper($r['EdNom']), 'LOTEO') ? 'LAND_DEVELOPMENT' : 'COMMERCIAL'),
                'status' => match (trim((string) $r['EdEst'])) {
                    'EN OBRA' => 'UNDER_CONSTRUCTION', 'DISPONIBLE' => 'AVAILABLE', default => 'UNKNOWN'
                },
                'progress' => null, 'total_units' => $counts[$r['EdId']] ?? 0,
                'city' => trim($catalogs['Localidades'][$r['LocCod']]['LocDes'] ?? ''),
                'address' => trim((string) $r['EdDir']) ?: null, 'legacy_data_json' => $r,
            ];
        }

        return ['projects' => $projects, 'properties' => array_values($properties), 'issues' => $issues];
    }

    /** @param list<array<string, mixed>> $records
     * @return array<int, array<string, mixed>>
     */
    private function index(array $records, string $key): array
    {
        $indexed = [];
        foreach ($records as $record) {
            $id = $record['data'][$key];
            $this->require(is_int($id) && $id >= 0 && ! isset($indexed[$id]), 'Invalid or duplicate '.$key);
            $indexed[$id] = $record['data'];
        }

        return $indexed;
    }

    private function require(bool $condition, string $message): void
    {
        if (! $condition) {
            throw new InvalidArgumentException($message);
        }
    }
}
