<?php

namespace App\Domain\Shared\Infrastructure\Database;

use Illuminate\Database\ConnectionInterface;

final readonly class SchemaContractVerifier
{
    public function __construct(private ConnectionInterface $database) {}

    /**
     * @return array<string, array{expected: mixed, actual: mixed, passed: bool}>
     */
    public function verify(): array
    {
        $schema = (string) $this->database->getDatabaseName();
        $contract = config('database-contract');

        $tables = (int) $this->scalar(
            "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = ? AND table_type = 'BASE TABLE'",
            [$schema],
        );
        $tenantTables = (int) $this->scalar(
            <<<'SQL'
                SELECT COUNT(DISTINCT c.table_name)
                FROM information_schema.columns c
                INNER JOIN information_schema.tables t
                    ON t.table_schema = c.table_schema
                    AND t.table_name = c.table_name
                    AND t.table_type = 'BASE TABLE'
                WHERE c.table_schema = ? AND c.column_name = 'tenant_id'
                SQL,
            [$schema],
        );
        $foreignKeys = (int) $this->scalar(
            'SELECT COUNT(*) FROM information_schema.referential_constraints WHERE constraint_schema = ?',
            [$schema],
        );
        $procedures = (int) $this->scalar(
            "SELECT COUNT(*) FROM information_schema.routines WHERE routine_schema = ? AND routine_type = 'PROCEDURE'",
            [$schema],
        );
        $views = (int) $this->scalar(
            'SELECT COUNT(*) FROM information_schema.views WHERE table_schema = ?',
            [$schema],
        );
        $globals = array_map(
            static fn (object $row): string => (string) $row->global_name,
            $this->database->select(
                <<<'SQL'
                    SELECT t.table_name AS global_name
                    FROM information_schema.tables t
                    LEFT JOIN information_schema.columns c
                        ON c.table_schema = t.table_schema
                        AND c.table_name = t.table_name
                        AND c.column_name = 'tenant_id'
                    WHERE t.table_schema = ?
                        AND t.table_type = 'BASE TABLE'
                        AND c.table_name IS NULL
                    ORDER BY t.table_name
                    SQL,
                [$schema],
            ),
        );
        $runtimeUser = (string) $this->scalar('SELECT CURRENT_USER()');
        $baselinePath = (string) $contract['baseline_path'];
        $hash = is_file($baselinePath) ? strtoupper((string) hash_file('sha256', $baselinePath)) : null;

        return [
            'baseline_sha256' => $this->check($contract['baseline_sha256'], $hash),
            'tables' => $this->check($contract['tables'], $tables),
            'tenant_tables' => $this->check($contract['tenant_tables'], $tenantTables),
            'foreign_keys' => $this->check($contract['foreign_keys'], $foreignKeys),
            'procedures' => $this->check($contract['procedures'], $procedures),
            'views' => $this->check($contract['views'], $views),
            'global_tables' => $this->check($contract['global_tables'], $globals),
            'runtime_not_root' => $this->check(true, ! str_starts_with(strtolower($runtimeUser), 'root@')),
        ];
    }

    /** @param list<mixed> $bindings */
    private function scalar(string $query, array $bindings = []): mixed
    {
        $row = $this->database->selectOne($query, $bindings);

        return $row === null ? null : array_values((array) $row)[0];
    }

    /** @return array{expected: mixed, actual: mixed, passed: bool} */
    private function check(mixed $expected, mixed $actual): array
    {
        return [
            'expected' => $expected,
            'actual' => $actual,
            'passed' => $expected === $actual,
        ];
    }
}
