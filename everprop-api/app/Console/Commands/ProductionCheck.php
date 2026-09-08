<?php

namespace App\Console\Commands;

use App\Support\ProductionDependencies;
use Illuminate\Console\Command;
use Illuminate\Encryption\Encrypter;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Throwable;

final class ProductionCheck extends Command
{
    protected $signature = 'everprop:production-check {--connections : Verify MySQL, Redis and release schema}';

    protected $description = 'Validate production configuration without displaying secrets or modifying data';

    public function handle(): int
    {
        $key = (string) config('app.key');
        $key = str_starts_with($key, 'base64:') ? base64_decode(substr($key, 7), true) : $key;
        $checks = [
            'APP_ENV=production' => app()->environment('production'),
            'APP_DEBUG=false' => ! config('app.debug'),
            'APP_KEY configured' => is_string($key) && Encrypter::supported($key, config('app.cipher')),
            'APP_URL uses HTTPS' => str_starts_with((string) config('app.url'), 'https://'),
            'MySQL connection' => config('database.default') === 'mysql',
            'Persistent sessions/cache and supported queue' => in_array(config('session.driver'), ['redis', 'database'], true) && in_array(config('cache.default'), ['redis', 'database'], true) && in_array(config('queue.default'), ['redis', 'sync'], true),
            'Secure HTTP-only encrypted sessions' => config('session.secure') && config('session.http_only') && config('session.encrypt'),
            'Trusted tenant hosts configured' => config('tenancy.hosts') !== [] && config('tenancy.trusted_hosts') !== [] && ! config('tenancy.allow_local_resolver'),
            'Explicit frontend origins' => config('cors.allowed_origins') !== [] && ! in_array('*', config('cors.allowed_origins'), true),
        ];
        foreach (config('cors.allowed_origins', []) as $origin) {
            $checks['Frontend origins use HTTPS'] = ($checks['Frontend origins use HTTPS'] ?? true) && str_starts_with($origin, 'https://');
        }
        if ($this->option('connections')) {
            try {
                ProductionDependencies::check();
                foreach (['payment_agreements', 'installments', 'installment_payments', 'user_inventory_settings'] as $table) {
                    $checks['Schema: '.$table] = Schema::hasTable($table);
                }
                $checks['Schema: password_hash'] = Schema::hasColumn('users', 'password_hash');
                $constraint = DB::selectOne("SELECT CHECK_CLAUSE AS clause_text FROM information_schema.CHECK_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = DATABASE() AND CONSTRAINT_NAME = 'ck_users_role'");
                $checks['Schema: inventory manager role'] = str_contains($constraint->clause_text ?? '', 'INVENTORY_MANAGER');
            } catch (Throwable) {
                $checks['Database and Redis connections'] = false;
            }
        }
        foreach ($checks as $label => $passed) {
            $this->line(($passed ? 'OK ' : 'FAIL ').$label);
        }

        return in_array(false, $checks, true) ? self::FAILURE : self::SUCCESS;
    }
}
