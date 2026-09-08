<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;

class SetupSimulationDatabaseCommand extends Command
{
    private const BASELINE_SHA256 = '4C8B170BC6F8B6827E9B85E756ACB2254CCF392B0FF4C11459C775366BAE472D';

    /**
     * The name and signature of the console command.
     *
     * @var string
     */
    protected $signature = 'db:setup-simulation';

    /**
     * The console command description.
     *
     * @var string
     */
    protected $description = 'Creates the baseline tables and seeds realistic simulation data for Bellomo';

    /**
     * Execute the console command.
     */
    public function handle(): int
    {
        if (! $this->laravel->environment(['local', 'testing'])) {
            $this->error('Simulation database setup is restricted to local and testing environments.');

            return Command::FAILURE;
        }

        $this->info('Starting database setup for Bellomo simulation...');

        $baselinePath = database_path('schema/bellomo_crm_omnichannel_mysql8.baseline.sql');
        $seedPath = database_path('seeders/seed_real_simulation_data.sql');

        if (! file_exists($baselinePath)) {
            $this->error("Baseline SQL not found at: {$baselinePath}");

            return Command::FAILURE;
        }

        if (! file_exists($seedPath)) {
            $this->error("Seed SQL not found at: {$seedPath}");

            return Command::FAILURE;
        }

        if (! hash_equals(self::BASELINE_SHA256, strtoupper((string) hash_file('sha256', $baselinePath)))) {
            $this->error('The baseline SQL does not match the canonical SHA-256.');

            return Command::FAILURE;
        }

        $this->info('1. Executing baseline schema (creating tables)...');
        $baselineSql = file_get_contents($baselinePath);

        // Remove CREATE DATABASE and USE statements so all tables are created in the current database
        $baselineSql = preg_replace('/CREATE\s+DATABASE\s+IF\s+NOT\s+EXISTS\s+[^\;]+;/i', '', $baselineSql);
        $baselineSql = preg_replace('/USE\s+[^\;]+;/i', '', $baselineSql);

        // Split DELIMITER blocks so PDO can execute stored procedures and tables separately
        if (preg_match('/DELIMITER\s+\$\$(.*?)(DELIMITER\s+;)/s', $baselineSql, $matches)) {
            $parts = preg_split('/DELIMITER\s+\$\$.*?DELIMITER\s+;/s', $baselineSql);
            $part1 = $parts[0];
            $procsRaw = $matches[1];
            $part2 = $parts[1] ?? '';

            // Execute Part 1 (Initial tables and structures)
            try {
                DB::unprepared($part1);
                $this->info('   ✓ Baseline Part 1 (CRM & core tables) created.');
            } catch (\Throwable $e) {
                $this->error('Error in Baseline Part 1: '.$e->getMessage());

                return Command::FAILURE;
            }

            // Execute Stored Procedures individually
            $procStatements = preg_split('/\$\$/', $procsRaw);
            foreach ($procStatements as $stmt) {
                $trimmed = trim($stmt);
                if (! empty($trimmed)) {
                    DB::unprepared($trimmed);
                }
            }
            $this->info('   ✓ Stored procedures created.');

            // Execute Part 2 (Projects, Properties, Units, Inventory)
            if (! empty(trim($part2))) {
                DB::unprepared($part2);
                $this->info('   ✓ Baseline Part 2 (Properties & Real Estate inventory) created.');
            }
        } else {
            DB::unprepared($baselineSql);
            $this->info('   ✓ Baseline schema created successfully.');
        }

        $this->info('   ✓ Creating cache and sessions tables...');
        DB::unprepared('
            CREATE TABLE IF NOT EXISTS `cache` (
                `key` VARCHAR(255) NOT NULL,
                `value` MEDIUMTEXT NOT NULL,
                `expiration` INT NOT NULL,
                PRIMARY KEY (`key`)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

            CREATE TABLE IF NOT EXISTS `cache_locks` (
                `key` VARCHAR(255) NOT NULL,
                `owner` VARCHAR(255) NOT NULL,
                `expiration` INT NOT NULL,
                PRIMARY KEY (`key`)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

            CREATE TABLE IF NOT EXISTS `sessions` (
                `id` VARCHAR(255) NOT NULL,
                `user_id` BIGINT UNSIGNED NULL,
                `ip_address` VARCHAR(45) NULL,
                `user_agent` TEXT NULL,
                `payload` LONGTEXT NOT NULL,
                `last_activity` INT NOT NULL,
                PRIMARY KEY (`id`),
                KEY `sessions_user_id_index` (`user_id`),
                KEY `sessions_last_activity_index` (`last_activity`)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

            CREATE TABLE IF NOT EXISTS `notifications` (
                `id` CHAR(36) NOT NULL,
                `type` VARCHAR(255) NOT NULL,
                `notifiable_type` VARCHAR(255) NOT NULL,
                `notifiable_id` BIGINT UNSIGNED NOT NULL,
                `data` JSON NOT NULL,
                `read_at` TIMESTAMP NULL DEFAULT NULL,
                `created_at` TIMESTAMP NULL DEFAULT NULL,
                `updated_at` TIMESTAMP NULL DEFAULT NULL,
                PRIMARY KEY (`id`),
                KEY `notifications_notifiable_type_notifiable_id_index` (`notifiable_type`, `notifiable_id`),
                KEY `notifications_read_at_index` (`read_at`)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
        ');
        $this->info('   ✓ Cache, sessions and notifications tables created successfully.');

        $forwardDir = database_path('schema/forward');
        if (is_dir($forwardDir)) {
            $this->info('2. Executing forward schema migrations (password_hash & interop)...');
            $files = glob($forwardDir.'/*.sql');
            sort($files);
            foreach ($files as $migrationFile) {
                $filename = basename($migrationFile);
                try {
                    DB::unprepared(file_get_contents($migrationFile));
                    $this->info("   ✓ Migration {$filename} applied.");
                } catch (\Throwable $e) {
                    $this->warn("   Notice on {$filename}: ".$e->getMessage());
                }
            }
        }

        $this->info('3. Seeding simulation data (users, properties, leads, visits)...');
        $seedSql = file_get_contents($seedPath);
        DB::unprepared($seedSql);
        $this->info('   ✓ Simulation data seeded successfully.');

        $this->newLine();
        $this->info('=============================================');
        $this->info('🎉 DATABASE SETUP COMPLETE!');
        $this->info('Simulation users and data are ready for local testing.');
        $this->info('=============================================');

        return Command::SUCCESS;
    }
}
