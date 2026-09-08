<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;

final class SeedLocalDemo extends Command
{
    protected $signature = 'everprop:local-demo';

    protected $description = 'Load original demo fixtures into an empty local database without deleting data';

    public function handle(): int
    {
        if (! app()->environment('local') || DB::connection()->getDriverName() !== 'mysql') {
            $this->error('This command requires local MySQL.');

            return self::FAILURE;
        }

        if (DB::table('tenants')->where('id', 1)->value('slug') !== 'bellomo') {
            $this->error('The original fixtures require Bellomo tenant 1.');

            return self::FAILURE;
        }

        if (DB::table('leads')->where('public_id', '9de97deb-8d1d-44ef-bf63-4fa1343f8a66')->where('tenant_id', 1)->exists()) {
            $this->info('Original demo already loaded; existing data preserved.');

            return self::SUCCESS;
        }

        foreach (['projects', 'properties', 'contacts', 'leads', 'visits', 'payment_agreements'] as $table) {
            if (DB::table($table)->exists()) {
                $this->error("{$table} is not empty. Refusing to overwrite existing data.");

                return self::FAILURE;
            }
        }
        foreach (DB::table('users')->get(['id', 'tenant_id', 'public_id']) as $user) {
            $expected = 'b1100000-0000-4000-8000-'.sprintf('%012d', 100 + $user->id);
            if ($user->tenant_id !== 1 || $user->id > 4 || $user->public_id !== $expected) {
                $this->error('Unexpected user identity; refusing to replace it.');

                return self::FAILURE;
            }
        }

        DB::transaction(function (): void {
            foreach (['seed_bellomo_real_data.sql', 'seed_real_simulation_data.sql'] as $file) {
                $sql = file_get_contents(database_path('seeders/'.$file));
                if ($file === 'seed_real_simulation_data.sql') {
                    // Inventory comes exclusively from the 73 original real-data properties.
                    $sql = preg_replace('/INSERT INTO properties\s*\(.*?;/s', '', $sql);
                }
                // Keep FK enforcement and preserve all existing rows. Never import the baseline here.
                $sql = preg_replace('/^\s*(?:USE\s+\w+|SET FOREIGN_KEY_CHECKS\s*=\s*[01]|DELETE FROM[^;]+);/mi', '', $sql);
                DB::unprepared($sql);
            }
        });
        $this->info('Original four demo accounts, inventory and CRM loaded. Password: password123');

        return self::SUCCESS;
    }
}
