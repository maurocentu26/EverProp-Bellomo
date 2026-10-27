<?php

namespace App\Console\Commands;

use App\Domain\Identity\Enums\RoleCode;
use App\Domain\Tenancy\Models\Tenant;
use App\Models\User;
use Illuminate\Console\Command;
use Illuminate\Database\QueryException;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Validator;
use Illuminate\Support\Str;
use Illuminate\Validation\Rules\Password;
use LogicException;

final class PrepareMetaReview extends Command
{
    protected $signature = 'everprop:reviewer:prepare {--apply : Crear el tenant y el revisor aislados; sin esta opción solo muestra el plan}';

    protected $description = 'Preparar el acceso de revisión de Meta exclusivamente en staging o una base de pruebas';

    private const SLUG = 'meta-review-staging';

    private const EMAIL = 'meta-review@example.invalid';

    public function handle(): int
    {
        if (! app()->environment('testing') && getenv('RAILWAY_ENVIRONMENT_NAME') !== 'staging') {
            $this->error('Solo se permite Railway staging o una base de pruebas identificada.');

            return self::FAILURE;
        }
        if (app()->environment('testing') && ! preg_match('/\Abellomo_crm_(?:test|evp\d+_qa)\z/', DB::connection()->getDatabaseName())) {
            $this->error('La base no está identificada como base de pruebas.');

            return self::FAILURE;
        }

        try {
            $tenant = Tenant::query()->where('slug', self::SLUG)->first();
            $this->checkTenant($tenant);
            $reviewer = $tenant === null ? null : $this->reviewer($tenant);
            if (! $this->option('apply') || $reviewer !== null) {
                $this->info($reviewer === null ? 'Plan: crear tenant aislado '.self::SLUG.' y administrador '.self::EMAIL.'; IA apagada.' : 'El acceso dedicado ya existe; no se cambia su contraseña ni sus datos.');

                return self::SUCCESS;
            }

            // No password argument/env/output: the operator enters a new credential through a hidden prompt.
            $password = $this->secret('Contraseña nueva del revisor', false);
            if (Validator::make(['password' => $password], ['password' => ['required', Password::min(12)->letters()->numbers()]])->fails()) {
                $this->error('La contraseña debe tener al menos12 caracteres, letras y números. No se creó el acceso.');

                return self::FAILURE;
            }
            DB::transaction(function () use ($password): void {
                // Fixed bootstrap namespace, never a tenant selected by an HTTP request or an existing client.
                $tenant = Tenant::query()->firstOrCreate(['slug' => self::SLUG], [
                    'public_id' => (string) Str::uuid(), 'name' => 'Meta Review — DATOS FICTICIOS',
                    'timezone' => 'America/Argentina/Cordoba', 'status' => 'ACTIVE',
                    'settings_json' => ['meta_review' => true, 'conversations' => ['ai_enabled' => false, 'copilot_enabled' => false]],
                ]);
                $tenant = Tenant::query()->whereKey($tenant->id)->lockForUpdate()->firstOrFail();
                $this->checkTenant($tenant);
                if ($this->reviewer($tenant) !== null) {
                    return; // A concurrent preparation won; never rotate its password.
                }
                $reviewer = new User(['public_id' => (string) Str::uuid(), 'display_name' => 'Meta Reviewer',
                    'email' => self::EMAIL, 'role_code' => RoleCode::TENANT_ADMIN, 'status' => 'ACTIVE', 'password_hash' => $password]);
                $reviewer->tenant_id = $tenant->id;
                $reviewer->save();
                DB::table('user_inventory_settings')->insert(['tenant_id' => $tenant->id, 'user_id' => $reviewer->id,
                    'visibility_mode' => 'ALL', 'can_view_prices' => true, 'can_manage_inventory' => true, 'can_manage_prices' => true]);
            }, 3);
            $this->info('Acceso preparado: '.self::EMAIL.' en '.self::SLUG.'. Falta configurar el hostname dedicado y verificar aislamiento antes de compartirlo.');

            return self::SUCCESS;
        } catch (LogicException|QueryException) {
            $this->error('No se pudo confirmar la preparación aislada. No se reasigna un tenant ni se modifica un usuario existente.');

            return self::FAILURE;
        }
    }

    private function checkTenant(?Tenant $tenant): void
    {
        $settings = $tenant?->getAttribute('settings_json');
        if ($tenant !== null && (! $tenant->isActive() || ! is_array($settings) || ($settings['meta_review'] ?? false) !== true)) {
            throw new LogicException('El namespace de revisión pertenece a otro uso.');
        }
    }

    private function reviewer(Tenant $tenant): ?User
    {
        $user = User::withTrashed()->where('tenant_id', $tenant->id)->where('email', self::EMAIL)->first();
        if ($user !== null && (! $user->isActive() || $user->role() !== RoleCode::TENANT_ADMIN || $user->password_hash === null)) {
            throw new LogicException('El acceso existente requiere revisión del operador.');
        }

        return $user;
    }
}
