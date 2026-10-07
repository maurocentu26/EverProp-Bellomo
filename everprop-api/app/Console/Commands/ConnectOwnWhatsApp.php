<?php

namespace App\Console\Commands;

use App\Domain\Identity\Enums\RoleCode;
use App\Domain\Integrations\Exceptions\OnboardingFailed;
use App\Domain\Integrations\Services\WhatsAppOnboarding;
use App\Domain\Tenancy\Models\Tenant;
use App\Models\User;
use Illuminate\Console\Command;

/**
 * Connects a business's own WhatsApp number (its Meta app and WABA) without Tech Provider review.
 * The token is asked hidden: never an argument, so it stays out of shell history and process lists.
 */
final class ConnectOwnWhatsApp extends Command
{
    protected $signature = 'everprop:whatsapp:connect-own {--tenant= : tenant slug} {--waba= : WhatsApp Business Account id}
        {--phone= : phone number id} {--admin= : email of the tenant admin who authorizes it}';

    protected $description = 'Conecta el número de WhatsApp propio de un cliente (piloto, sin App Review)';

    public function handle(WhatsAppOnboarding $onboarding): int
    {
        $tenant = Tenant::query()->active()->where('slug', (string) $this->option('tenant'))->first();
        $admin = $tenant === null ? null : User::query()->where('tenant_id', $tenant->id)->where('email', (string) $this->option('admin'))->first();
        $ids = [(string) $this->option('waba'), (string) $this->option('phone')];
        if ($tenant === null || $admin === null || $admin->role() !== RoleCode::TENANT_ADMIN || preg_grep('/\A\d{1,30}\z/', $ids) !== $ids) {
            $this->error('Revisá --tenant, --admin (TENANT_ADMIN activo del cliente), --waba y --phone (ids numéricos de Meta).');

            return self::FAILURE;
        }
        $token = (string) $this->secret('Token del usuario del sistema de Meta (no se muestra)');
        if (strlen($token) < 20) {
            $this->error('Token vacío o inválido.');

            return self::FAILURE;
        }

        try {
            $result = $onboarding->connectOwnAccount((int) $tenant->id, $admin, $ids[0], $ids[1], $token);
        } catch (OnboardingFailed $e) {
            $this->error($e->getMessage());

            return self::FAILURE;
        }
        $this->info("Conectado {$result['display_phone_number']} · estado {$result['state']}.");

        return self::SUCCESS;
    }
}
