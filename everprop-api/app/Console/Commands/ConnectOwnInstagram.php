<?php

namespace App\Console\Commands;

use App\Domain\Identity\Enums\RoleCode;
use App\Domain\Integrations\Services\IntegrationTokens;
use App\Domain\Tenancy\Models\Tenant;
use App\Models\User;
use Illuminate\Console\Command;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Str;

final class ConnectOwnInstagram extends Command
{
    protected $signature = 'everprop:instagram:connect-own {--tenant= : tenant slug} {--account= : Instagram professional account user_id} {--admin= : tenant admin email}';

    protected $description = 'Conecta una cuenta propia con Instagram Login para el piloto de texto';

    public function handle(IntegrationTokens $tokens): int
    {
        $tenant = Tenant::query()->active()->where('slug', (string) $this->option('tenant'))->first();
        $admin = $tenant === null ? null : User::query()->where('tenant_id', $tenant->id)->where('email', (string) $this->option('admin'))->first();
        $account = (string) $this->option('account');
        if ($tenant === null || $admin === null || $admin->role() !== RoleCode::TENANT_ADMIN || ! $admin->isActive()
            || preg_match('/\A[0-9]{1,30}\z/', $account) !== 1) {
            $this->error('Revisá --tenant, --admin (TENANT_ADMIN activo del cliente) y --account (user_id numérico).');

            return self::FAILURE;
        }
        $token = (string) $this->secret('Token de Instagram Login (no se muestra)');
        if (strlen($token) < 20) {
            $this->error('Token vacío o inválido.');

            return self::FAILURE;
        }
        try {
            $response = Http::withToken($token)->timeout(10)->get('https://graph.instagram.com/'.config('services.meta.graph_version').'/me', ['fields' => 'user_id,username']);
        } catch (ConnectionException) {
            $this->error('No se pudo validar la cuenta con Meta. No se guardó el token.');

            return self::FAILURE;
        }
        $identity = $response->json('data.0') ?? $response->json();
        if (! $response->successful() || ! is_array($identity) || (string) ($identity['user_id'] ?? '') !== $account
            || ! is_string($identity['username'] ?? null) || $identity['username'] === '') {
            $this->error('Meta no validó el token para el user_id solicitado.');

            return self::FAILURE;
        }
        // Serialize platform-wide ownership checks; tenant filters alone cannot prevent duplicate mappings.
        $lock = 'ig-connect:'.substr(hash('sha256', DB::getDatabaseName().':'.$account), 0, 48);
        if ((int) DB::selectOne('SELECT GET_LOCK(?, 5) AS acquired', [$lock])->acquired !== 1) {
            $this->error('La cuenta se está configurando. Reintentá más tarde.');

            return self::FAILURE;
        }
        try {
            $created = DB::transaction(function () use ($tenant, $admin, $account, $identity, $token, $tokens): bool {
                if (DB::table('channel_accounts')->where('channel_type', 'INSTAGRAM_DM')->where('provider_account_id', $account)->exists()) {
                    return false;
                }
                $integration = (int) DB::table('integration_connections')->insertGetId([
                    'tenant_id' => $tenant->id, 'public_id' => (string) Str::uuid(), 'provider' => 'META', 'status' => 'ACTIVE',
                    'name' => mb_substr('Instagram '.$identity['username'], 0, 120), 'api_version' => config('services.meta.graph_version'),
                    'settings_json' => json_encode(['instagram_login' => true], JSON_THROW_ON_ERROR),
                ]);
                $tokens->store((int) $tenant->id, $integration, $token);
                DB::table('channel_accounts')->insert([
                    'tenant_id' => $tenant->id, 'integration_id' => $integration, 'public_id' => (string) Str::uuid(),
                    'channel_type' => 'INSTAGRAM_DM', 'provider_account_id' => $account,
                    'display_name' => mb_substr('Instagram '.$identity['username'], 0, 120), 'status' => 'ACTIVE',
                ]);
                DB::table('audit_logs')->insert([
                    'tenant_id' => $tenant->id, 'actor_type' => 'USER', 'actor_user_id' => $admin->id, 'action_code' => 'INSTAGRAM_CONNECTED',
                    'entity_type' => 'INTEGRATION_CONNECTION', 'entity_id' => $integration, 'occurred_at' => now(),
                    'metadata_json' => json_encode(['account_id' => $account], JSON_THROW_ON_ERROR),
                ]);

                return true;
            });
        } finally {
            DB::selectOne('SELECT RELEASE_LOCK(?) AS released', [$lock]);
        }
        if (! $created) {
            $this->error('La cuenta ya tiene un canal. Revisá la configuración existente antes de reconectarla.');

            return self::FAILURE;
        }
        $this->info('Canal de Instagram conectado; falta comprobar webhook, suscripción y envío real.');

        return self::SUCCESS;
    }
}
