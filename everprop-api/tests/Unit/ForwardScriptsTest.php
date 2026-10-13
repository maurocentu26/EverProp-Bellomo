<?php

namespace Tests\Unit;

use PHPUnit\Framework\TestCase;

/**
 * EVP-16: forward scripts are applied in file-name order and leave their version in schema_versions. A repeated
 * version is ambiguous and a script without its row leaves no trace of having run. Applied scripts are never
 * edited or renamed (forward-only), so the legacy cases are listed here and the list can only shrink.
 */
final class ForwardScriptsTest extends TestCase
{
    /** Shipped before the check; both files are applied in staging and run in name order. */
    private const DUPLICATED_VERSIONS = ['2026-10-07.001'];

    /** Shipped before the check without recording their version. */
    private const WITHOUT_VERSION_ROW = [
        '2026-09-05.001_create_notifications_table.sql',
        '2026-09-06.001_create_lead_follow_ups_table.sql',
        '2026-09-08.002_inventory_manager_role.sql',
        '2026-09-14.001_visit_follow_up_origin.sql',
        '2026-09-14.002_web_push.sql',
        '2026-09-19.001_fix_project_types.sql',
        '2026-09-29.001_update_sp_create_lead_sticky_routing.sql',
        '2026-10-07.001_rotator_role.sql',
    ];

    /** @return array<string, string> file name => contents */
    private function scripts(): array
    {
        $scripts = [];
        foreach (glob(dirname(__DIR__, 2).'/database/schema/forward/*.sql') ?: [] as $path) {
            // Without comment lines: a commented-out INSERT must not count as recording the version.
            $scripts[basename($path)] = (string) preg_replace('/^\s*--.*$/m', '', (string) file_get_contents($path));
        }
        $this->assertNotEmpty($scripts);

        return $scripts;
    }

    public function test_every_file_is_named_with_a_version_and_a_description(): void
    {
        foreach (array_keys($this->scripts()) as $file) {
            $this->assertMatchesRegularExpression('/^\d{4}-\d{2}-\d{2}\.\d{3}_[a-z0-9_]+\.sql$/', $file);
        }
    }

    public function test_versions_are_not_repeated(): void
    {
        $versions = array_map(fn (string $file): string => substr($file, 0, 14), array_keys($this->scripts()));
        $repeated = array_keys(array_filter(array_count_values($versions), fn (int $n): bool => $n > 1));

        $this->assertSame(self::DUPLICATED_VERSIONS, $repeated, 'Use the next free NNN of the day.');
    }

    public function test_each_script_records_its_own_version(): void
    {
        $missing = [];
        foreach ($this->scripts() as $file => $sql) {
            $version = substr($file, 0, 14);
            if (! preg_match("/INSERT\s+IGNORE\s+INTO\s+schema_versions\s*\([^)]*\)\s*(VALUES\s*\(|SELECT)\s*'".preg_quote($version, '/')."'/i", $sql)) {
                $missing[] = $file;
            }
        }

        $this->assertSame(self::WITHOUT_VERSION_ROW, $missing, "New scripts end with INSERT IGNORE INTO schema_versions (version, description) VALUES ('<version>', '…').");
    }
}
