<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;

class SetupSimulationDatabaseCommand extends Command
{
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

        $this->info('1. Executing baseline schema (creating tables)...');
        $baselineSql = file_get_contents($baselinePath);
        try {
            DB::unprepared($baselineSql);
            $this->info('   ✓ Baseline schema created successfully.');
        } catch (\Throwable $e) {
            $this->warn('   Notice on baseline: ' . $e->getMessage());
        }

        $this->info('2. Seeding simulation data (users, properties, leads, visits)...');
        $seedSql = file_get_contents($seedPath);
        DB::unprepared($seedSql);
        $this->info('   ✓ Simulation data seeded successfully.');

        $this->newLine();
        $this->info('=============================================');
        $this->info('🎉 DATABASE SETUP COMPLETE!');
        $this->info('Users ready with password: password123');
        $this->info('- admin@bellomo.com (Marcos Bellomo)');
        $this->info('- sofia@bellomo.com (Ing. Sofía Bellomo)');
        $this->info('- lucas.albarracin@bellomo.com (Lucas Albarracín)');
        $this->info('- valentina.morales@bellomo.com (Valentina Morales)');
        $this->info('=============================================');

        return Command::SUCCESS;
    }
}
