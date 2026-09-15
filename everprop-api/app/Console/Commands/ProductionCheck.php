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
    protected $signature = 'everprop:production-check {--connections : Verify MySQL, Redis and release schema} {--webpush : Require Web Push credentials and an asynchronous queue}';

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
        if ($this->option('webpush')) {
            try {
                \Minishlink\WebPush\VAPID::validate([
                    'subject' => config('webpush.subject'),
                    'publicKey' => config('webpush.public_key'),
                    'privateKey' => config('webpush.private_key'),
                ]);
                $subject = (string) config('webpush.subject');
                $checks['Web Push: valid VAPID configuration'] =
                    (str_starts_with($subject, 'https://') && filter_var($subject, FILTER_VALIDATE_URL) !== false)
                    || (str_starts_with($subject, 'mailto:') && filter_var(substr($subject, 7), FILTER_VALIDATE_EMAIL) !== false);
            } catch (Throwable) {
                $checks['Web Push: valid VAPID configuration'] = false;
            }
            $connection = config('webpush.connection');
            $driver = is_string($connection) ? config('queue.connections.'.$connection.'.driver') : null;
            $checks['Web Push: asynchronous queue'] = in_array($driver, ['database', 'redis', 'sqs', 'beanstalkd'], true);
            if ($this->option('connections') && $driver === 'database') {
                try {
                    DB::connection(config('queue.connections.'.$connection.'.connection'))
                        ->table(config('queue.connections.'.$connection.'.table', 'jobs'))->limit(1)->get(['id']);
                    $checks['Web Push: queue table accessible'] = true;
                } catch (Throwable) {
                    $checks['Web Push: queue table accessible'] = false;
                }
            }
            $this->line('MANUAL: verify the supervised worker and delivery on a physical phone; configuration alone does not prove delivery.');
        }
        if ($this->option('connections')) {
            try {
                ProductionDependencies::check();
                foreach (['payment_agreements', 'installments', 'installment_payments', 'user_inventory_settings'] as $table) {
                    $checks['Schema: '.$table] = Schema::hasTable($table);
                }
                $checks['Schema: password_hash'] = Schema::hasColumn('users', 'password_hash');
                foreach (['follow_up_id', 'guest_name', 'guest_phone', 'guest_email'] as $column) {
                    $checks['Schema: visits.'.$column] = Schema::hasColumn('visits', $column);
                }
                $checks['Schema: Web Push subscriptions'] = Schema::hasColumns('web_push_subscriptions', [
                    'tenant_id', 'user_id', 'endpoint_hash', 'subscription',
                ]);
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
