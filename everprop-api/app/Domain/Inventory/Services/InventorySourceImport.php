<?php

namespace App\Domain\Inventory\Services;

use Illuminate\Database\Query\Builder;
use Illuminate\Support\Facades\DB;
use Ramsey\Uuid\Uuid;
use RuntimeException;

final class InventorySourceImport
{
    private const SNAPSHOT_TABLES = [
        'projects', 'properties', 'legacy_property_types', 'legacy_property_statuses', 'legacy_localities',
        'inventory_source_imports', 'property_media', 'property_features', 'user_inventory_scopes',
        'lead_properties', 'visits', 'payment_agreements',
    ];

    /** @param array<string, mixed> $value */
    public function hash(array $value): string
    {
        return hash('sha256', $this->json($value));
    }

    /** @param array<mixed> $value */
    public function json(array $value): string
    {
        return json_encode($value, JSON_THROW_ON_ERROR | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    }

    /** @return array<string, mixed> */
    public function target(string $slug): array
    {
        $this->require(DB::connection()->getDriverName() === 'mysql', 'MySQL is required');
        $tenant = DB::table('tenants')->where('slug', $slug)->first(['id', 'slug']);
        $this->require($tenant !== null, 'Tenant does not exist');

        return [
            'environment' => app()->environment(), 'database' => DB::connection()->getDatabaseName(),
            'server_uuid' => DB::selectOne('SELECT @@server_uuid AS uuid')->uuid,
            'tenant_id' => $tenant->id, 'tenant_slug' => $tenant->slug,
        ];
    }

    /** @return array<string, list<array<string, mixed>>> */
    public function snapshot(int $tenantId, bool $lock = false): array
    {
        $result = [];
        foreach (self::SNAPSHOT_TABLES as $table) {
            $query = $this->scoped($table, $tenantId);
            if ($lock) {
                $query->lockForUpdate();
            }
            $rows = $query->get()->map(fn ($row) => (array) $row)->all();
            usort($rows, fn ($a, $b) => strcmp($this->json($a), $this->json($b)));
            $result[$table] = $rows;
        }

        return $result;
    }

    /** @param array<string, mixed> $source
     * @param  array<string, mixed>  $cleanup
     * @return array<string, mixed>
     */
    public function plan(array $source, string $slug, string $currency = 'preserve', array $cleanup = [], bool $replaceMetadata = false): array
    {
        $this->require(in_array($currency, ['preserve', 'unset', 'ARS', 'USD'], true), 'Choose preserve, unset, ARS or USD for currency');
        $this->require(array_diff(array_keys($cleanup), ['properties', 'projects']) === [], 'Cleanup supports only individually reviewed inventory UUIDs, never CRM or accounts');
        $target = $this->target($slug);
        $snapshot = $this->snapshot($target['tenant_id']);
        $normalized = (new WorkbookInventorySource)->normalize($source);
        $removals = [];
        foreach (['properties', 'projects'] as $table) {
            $requested = $cleanup[$table] ?? [];
            $this->require(is_array($requested) && count($requested) === count(array_unique($requested)), 'Duplicate cleanup UUID');
            $removals[$table] = array_values(array_filter($snapshot[$table], fn ($row) => in_array($row['public_id'], $requested, true)));
            $this->require(count($removals[$table]) === count($requested), 'Cleanup UUID is missing or belongs to another tenant');
        }
        $changes = ['projects' => [], 'properties' => []];
        foreach ($normalized['projects'] as $record) {
            $matches = array_values(array_filter($snapshot['projects'], fn ($r) => $r['legacy_id'] === $record['legacy_id']));
            $this->require(count($matches) <= 1, 'Duplicate legacy project identity');
            $before = $matches[0] ?? null;
            $after = $record + [
                'code' => $before['code'] ?? 'ED-'.$record['legacy_id'],
                'province' => $before['province'] ?? '', 'description' => null, 'masterplan_image_url' => null,
            ];
            if (! $replaceMetadata && $before !== null) {
                $after['description'] = $before['description'];
                $after['masterplan_image_url'] = $before['masterplan_image_url'];
            }
            $after['public_id'] = $before['public_id'] ?? $this->uuid($target, 'project:'.$record['legacy_id']);
            $after['deleted_at'] = null;
            $this->checkCollision($snapshot['projects'], $removals['projects'], $before, $after);
            $changes['projects'][] = ['before_id' => $before['id'] ?? null, 'after' => $after];
        }
        foreach ($normalized['properties'] as $record) {
            $matches = array_values(array_filter($snapshot['properties'], fn ($r) => $r['legacy_ed_id'] === $record['legacy_ed_id'] && trim((string) $r['legacy_pis']) === $record['legacy_pis'] && trim((string) $r['legacy_dep']) === $record['legacy_dep']));
            $this->require(count($matches) <= 1, 'Duplicate legacy property identity');
            $before = $matches[0] ?? null;
            $after = $record + ['province' => $before['province'] ?? '', 'address' => null, 'bedrooms' => null, 'bathrooms' => null, 'main_image_url' => null, 'services_json' => null, 'commercial_features_json' => null];
            if (! $replaceMetadata && $before !== null) {
                foreach (['address', 'bedrooms', 'bathrooms', 'main_image_url', 'services_json', 'commercial_features_json'] as $field) {
                    $after[$field] = str_ends_with($field, '_json') && $before[$field] !== null ? json_decode($before[$field], true, flags: JSON_THROW_ON_ERROR) : $before[$field];
                }
            }
            $after['price'] = match ($currency) {
                'preserve' => $before['price'] ?? null, 'unset' => null, default => $record['legacy_data_json']['ProPre']
            };
            $after['currency_code'] = $after['price'] === null ? null : ($currency === 'preserve' ? $before['currency_code'] : $currency);
            $after['public_id'] = $before['public_id'] ?? $this->uuid($target, 'property:'.$record['code']);
            $after['version'] = ($before['version'] ?? 0) + 1;
            $after['deleted_at'] = null;
            $this->checkCollision($snapshot['properties'], $removals['properties'], $before, $after);
            $changes['properties'][] = ['before_id' => $before['id'] ?? null, 'after' => $after];
        }

        return [
            'format' => 1, 'target' => $target, 'source_hash' => $this->hash($source),
            'source_workbook_sha256' => $source['sha256'], 'snapshot_hash' => $this->hash($snapshot),
            'currency' => $currency, 'replace_metadata' => $replaceMetadata, 'cleanup' => $cleanup,
            'delete' => $removals, 'changes' => $changes, 'issues' => $normalized['issues'],
            'counts' => [
                'projects' => count($changes['projects']), 'properties' => count($changes['properties']),
                'delete_projects' => count($removals['projects']), 'delete_properties' => count($removals['properties']),
                'insert_projects' => count(array_filter($changes['projects'], fn ($r) => $r['before_id'] === null)),
                'insert_properties' => count(array_filter($changes['properties'], fn ($r) => $r['before_id'] === null)),
            ],
        ];
    }

    /** @param array<string, mixed> $source
     * @param  array<string, mixed>  $plan
     * @param  array<string, mixed>  $backup
     * @return array<string, mixed>
     */
    public function apply(array $source, array $plan, array $backup, bool $rehearse): array
    {
        $this->require(($plan['format'] ?? null) === 1, 'Unsupported plan');
        $target = $this->target($plan['target']['tenant_slug']);
        $this->require($target === $plan['target'], 'Plan belongs to another environment, server, database or tenant');
        $this->require($this->hash($source) === $plan['source_hash'], 'Source changed since review');
        $this->require(($backup['target'] ?? null) === $target && $this->hash($backup['rows'] ?? []) === $plan['snapshot_hash'], 'Backup does not match the reviewed target snapshot');
        $tenantId = $target['tenant_id'];
        $lock = 'inventory-import:'.substr(hash('sha256', $target['database'].':'.$tenantId), 0, 40);
        $this->require((int) DB::selectOne('SELECT GET_LOCK(?, 0) AS acquired', [$lock])->acquired === 1, 'Another import is running');
        try {
            return DB::transaction(function () use ($source, $plan, $tenantId, $rehearse): array {
                $snapshot = $this->snapshot($tenantId, true);
                $prior = $this->scoped('inventory_source_imports', $tenantId)->where('source_sha256', $source['sha256'])->first();
                if ($prior !== null && (json_decode($prior->report_json, true)['plan_hash'] ?? null) === $this->hash($plan)) {
                    $this->verify($source, $plan);

                    return ['status' => 'already_applied', 'counts' => $plan['counts']];
                }
                $this->require($this->hash($snapshot) === $plan['snapshot_hash'], 'Database changed since review; generate a new plan and backup');
                $expected = $this->plan($source, $plan['target']['tenant_slug'], $plan['currency'], $plan['cleanup'], $plan['replace_metadata']);
                $this->require($this->hash($expected) === $this->hash($plan), 'Plan content does not match the validated source');
                foreach (['properties', 'projects'] as $table) {
                    // FK enforcement deliberately blocks deletion of inventory linked to live CRM, payments or permissions.
                    $this->scoped($table, $tenantId)->whereIn('id', array_column($plan['delete'][$table], 'id'))->delete();
                }
                foreach (WorkbookInventorySource::CATALOGS as $sheet => [$table, $key, $label]) {
                    foreach ($source['sheets'][$sheet]['records'] as $record) {
                        $this->scoped($table, $tenantId)->updateOrInsert(['tenant_id' => $tenantId, 'legacy_id' => $record['data'][$key]], [
                            'label' => trim($record['data'][$label]), 'source_row' => $record['row'], 'data_json' => $this->json($record['data']),
                        ]);
                    }
                }
                foreach ($plan['changes']['projects'] as $change) {
                    $row = $this->encode($change['after']);
                    if ($change['before_id'] === null) {
                        DB::table('projects')->insert($row + ['tenant_id' => $tenantId]);
                    } else {
                        $this->scoped('projects', $tenantId)->where('id', $change['before_id'])->update($row);
                    }
                }
                $ids = $this->scoped('projects', $tenantId)->pluck('id', 'legacy_id');
                foreach ($plan['changes']['properties'] as $change) {
                    $row = $this->encode($change['after']);
                    $row['project_id'] = $ids->get($row['legacy_ed_id']);
                    if ($change['before_id'] === null) {
                        DB::table('properties')->insert($row + ['tenant_id' => $tenantId]);
                    } else {
                        $this->scoped('properties', $tenantId)->where('id', $change['before_id'])->update($row);
                    }
                }
                $this->verify($source, $plan);
                $this->scoped('inventory_source_imports', $tenantId)->updateOrInsert(['tenant_id' => $tenantId, 'source_sha256' => $source['sha256']], [
                    'source_name' => basename($source['source']), 'workbook_json' => $this->json($source),
                    'report_json' => $this->json(['plan_hash' => $this->hash($plan), 'counts' => $plan['counts'], 'issues' => $plan['issues'], 'currency' => $plan['currency']]),
                ]);
                if ($rehearse) {
                    // A controlled exception makes Laravel roll back the entire transaction, including import history.
                    throw new InventoryImportRehearsed($plan['counts']);
                }

                return ['status' => 'applied', 'counts' => $plan['counts']];
            });
        } catch (InventoryImportRehearsed $e) {
            return ['status' => 'rehearsed_and_rolled_back', 'counts' => $e->counts];
        } finally {
            DB::select('SELECT RELEASE_LOCK(?)', [$lock]);
        }
    }

    /** @param array<string, mixed> $source
     * @param  array<string, mixed>  $plan
     */
    public function verify(array $source, array $plan): void
    {
        $tenantId = $plan['target']['tenant_id'];
        $projects = $this->scoped('projects', $tenantId)->get()->keyBy('legacy_id');
        foreach (['projects', 'properties'] as $table) {
            $records = $this->scoped($table, $tenantId)->get()->keyBy('public_id');
            foreach ($plan['changes'][$table] as $change) {
                $after = $change['after'];
                $actual = $records->get($after['public_id']);
                $this->require($actual !== null, 'Missing imported record');
                foreach ($after as $field => $value) {
                    $actualValue = $actual->$field;
                    if (str_ends_with($field, '_json') && $actualValue !== null) {
                        $actualValue = json_decode($actualValue, true, flags: JSON_THROW_ON_ERROR);
                    }
                    $this->require(($actualValue === null) === ($value === null) && $actualValue == $value, 'Imported field differs: '.$table.'.'.$field);
                }
                if ($table === 'properties') {
                    $this->require($actual->project_id === ($projects->get($after['legacy_ed_id'])?->id), 'Wrong project relationship');
                }
            }
            $this->require(! $this->scoped($table, $tenantId)->whereIn('id', array_column($plan['delete'][$table], 'id'))->exists(), 'Cleanup incomplete');
        }
        foreach (WorkbookInventorySource::CATALOGS as $sheet => [$table, $key, $label]) {
            $actual = $this->scoped($table, $tenantId)->get()->keyBy('legacy_id');
            foreach ($source['sheets'][$sheet]['records'] as $row) {
                $found = $actual->get($row['data'][$key]);
                $this->require($found !== null && json_decode($found->data_json, true) == $row['data'], 'Lookup catalog differs from source');
            }
        }
    }

    /** @param list<array<string, mixed>> $rows
     * @param  list<array<string, mixed>>  $deletions
     * @param  array<string, mixed>|null  $before
     * @param  array<string, mixed>  $after
     */
    private function checkCollision(array $rows, array $deletions, ?array $before, array $after): void
    {
        $this->require($before === null || ! in_array($before['id'], array_column($deletions, 'id'), true), 'Cannot delete and import the same identity');
        foreach ($rows as $row) {
            if ($row['id'] !== ($before['id'] ?? null) && ! in_array($row['id'], array_column($deletions, 'id'), true)) {
                $this->require(mb_strtolower((string) $row['code']) !== mb_strtolower($after['code']), 'Source code conflicts with an unrelated existing record');
            }
        }
    }

    /** @param array<string, mixed> $target */
    private function uuid(array $target, string $key): string
    {
        return Uuid::uuid5(Uuid::NAMESPACE_URL, $this->json($target).':'.$key)->toString();
    }

    /** @param array<string, mixed> $row
     * @return array<string, mixed>
     */
    private function encode(array $row): array
    {
        foreach ($row as $key => $value) {
            if (str_ends_with($key, '_json') && $value !== null) {
                $row[$key] = $this->json($value);
            }
        }

        return $row;
    }

    private function scoped(string $table, int $tenantId): Builder
    {
        return DB::table($table)->where('tenant_id', $tenantId);
    }

    private function require(bool $condition, string $message): void
    {
        if (! $condition) {
            throw new RuntimeException($message);
        }
    }
}
