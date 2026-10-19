<?php

namespace App\Console\Commands;

use App\Domain\Tenancy\Models\Tenant;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/**
 * Go-live helper until the onboarding UI exists (S14): creates (or updates) the WEB_CHAT channel of
 * a tenant and prints the <script> tag for the tenant's site.
 *
 * The widget iframe is served by the panel and calls the API same-origin through the Next proxy,
 * so the request Origin checked by PublicChatController is the PANEL origin (--panel-origin).
 * Which sites may embed the iframe is enforced by EVERSYS_WIDGET_FRAME_ANCESTORS (--site).
 */
final class ProvisionWebChatChannel extends Command
{
    protected $signature = 'everprop:channels:web-chat {--tenant= : tenant slug or public id} {--panel-origin=* : origin serving the widget, e.g. https://ever-prop-bellomo.vercel.app} {--site=* : site origin that embeds it, e.g. https://www.bellomo.com.ar} {--name=Chat web}';

    protected $description = 'Create or update the tenant web chat widget and print its embed snippet';

    public function handle(): int
    {
        $tenant = Tenant::query()->where('public_id', (string) $this->option('tenant'))->orWhere('slug', (string) $this->option('tenant'))->first();
        $valid = fn (array $list): array => array_values(array_filter($list, fn ($o) => preg_match('#^https?://[a-z0-9.-]+(:\d+)?$#i', (string) $o) === 1));
        $origins = $valid((array) $this->option('panel-origin'));
        $sites = $valid((array) $this->option('site'));
        if ($tenant === null || $origins === [] || count($origins) !== count((array) $this->option('panel-origin')) || count($sites) !== count((array) $this->option('site'))) {
            $this->error('Indicá --tenant válido, --panel-origin y opcionalmente --site, como origen exacto (esquema + host, sin barra final).');

            return self::FAILURE;
        }

        $widgetId = DB::transaction(function () use ($tenant, $origins, $sites): string {
            $integration = DB::table('integration_connections')->where('tenant_id', $tenant->id)->where('provider', 'WEB')->lockForUpdate()->value('id')
                ?? DB::table('integration_connections')->insertGetId(['tenant_id' => $tenant->id, 'public_id' => (string) Str::uuid(),
                    'provider' => 'WEB', 'name' => 'Widget web', 'status' => 'ACTIVE']);
            $channel = DB::table('channel_accounts')->where('tenant_id', $tenant->id)->where('channel_type', 'WEB_CHAT')->lockForUpdate()->first(['id', 'public_id', 'metadata_json']);
            if ($channel !== null) {
                $metadata = json_decode((string) $channel->metadata_json, true) ?: [];
                $metadata['allowed_origins'] = $origins;
                $metadata['embed_sites'] = $sites;
                DB::table('channel_accounts')->where('tenant_id', $tenant->id)->where('id', $channel->id)
                    ->update(['metadata_json' => json_encode($metadata, JSON_THROW_ON_ERROR), 'status' => 'ACTIVE']);

                return (string) $channel->public_id;
            }
            $publicId = (string) Str::uuid();
            DB::table('channel_accounts')->insert([
                'tenant_id' => $tenant->id, 'integration_id' => $integration, 'public_id' => $publicId, 'channel_type' => 'WEB_CHAT',
                'provider_account_id' => 'widget-'.$publicId, 'display_name' => (string) $this->option('name'),
                'metadata_json' => json_encode(['allowed_origins' => $origins, 'embed_sites' => $sites], JSON_THROW_ON_ERROR),
            ]);

            return $publicId;
        });

        $this->info("widget_id={$widgetId}");
        $this->line('<script src="'.$origins[0].'/eversys-widget.js" data-widget-id="'.$widgetId.'" defer></script>');
        if ($sites !== []) {
            $this->line('Frontend: EVERSYS_WIDGET_FRAME_ANCESTORS="\'self\' '.implode(' ', $sites).'"');
        }

        return self::SUCCESS;
    }
}
