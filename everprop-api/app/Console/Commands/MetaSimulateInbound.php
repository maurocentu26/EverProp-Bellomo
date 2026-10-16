<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;
use Illuminate\Contracts\Http\Kernel;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/**
 * Local-only CLI helper to simulate signed Meta webhooks (WhatsApp, Instagram DM, Facebook Messenger)
 * end-to-end without requiring live Meta business accounts.
 */
final class MetaSimulateInbound extends Command
{
    protected $signature = 'meta:simulate
        {channel=instagram : Channel to simulate: whatsapp, instagram or messenger}
        {sender=1789000111 : Sender phone (digits) for whatsapp, or IGSID/PSID for instagram/messenger}
        {text=Hola! : Inbound message text}
        {--tenant=bellomo : Tenant slug for --setup and default account IDs}
        {--account= : Explicit provider_account_id}
        {--setup : Provision local synthetic Meta integration and channel accounts for the tenant}';

    protected $description = 'Simulate a signed Meta webhook delivery (whatsapp, instagram, messenger) in local/testing environments';

    public function handle(Kernel $kernel): int
    {
        if (app()->isProduction()) {
            $this->error('meta:simulate is disabled in production.');

            return self::FAILURE;
        }

        $secret = (string) config('services.meta.app_secret');
        if ($secret === '') {
            $this->error('META_APP_SECRET is not configured.');

            return self::FAILURE;
        }

        $slug = (string) $this->option('tenant');
        $tenant = DB::table('tenants')->where('slug', $slug)->first(['id', 'slug']);
        if ($tenant === null) {
            $this->error("Tenant '{$slug}' not found.");

            return self::FAILURE;
        }

        $tenantId = (int) $tenant->id;
        if ($this->option('setup')) {
            $this->setupChannels($tenantId);
        }

        $channel = strtolower((string) $this->argument('channel'));
        $sender = (string) $this->argument('sender');
        $text = (string) $this->argument('text');
        $accountOption = (string) ($this->option('account') ?? '');

        $payload = match ($channel) {
            'whatsapp', 'wa' => [
                'object' => 'whatsapp_business_account',
                'entry' => [[
                    'id' => 'local-waba-'.$tenantId,
                    'changes' => [[
                        'field' => 'messages',
                        'value' => [
                            'messaging_product' => 'whatsapp',
                            'metadata' => [
                                'display_phone_number' => '5493880000000',
                                'phone_number_id' => $accountOption !== '' ? $accountOption : 'local-wa-'.$tenantId,
                            ],
                            'contacts' => [['profile' => ['name' => 'Cliente WhatsApp'], 'wa_id' => preg_replace('/\D/', '', $sender) ?: '5493885550000']],
                            'messages' => [[
                                'from' => preg_replace('/\D/', '', $sender) ?: '5493885550000',
                                'id' => 'wamid.sim.'.Str::uuid(),
                                'timestamp' => (string) now()->timestamp,
                                'type' => 'text',
                                'text' => ['body' => $text],
                            ]],
                        ],
                    ]],
                ]],
            ],
            'instagram', 'ig' => [
                'object' => 'instagram',
                'entry' => [[
                    'id' => $accountOption !== '' ? $accountOption : 'local-ig-'.$tenantId,
                    'time' => now()->getTimestampMs(),
                    'messaging' => [[
                        'sender' => ['id' => $sender],
                        'recipient' => ['id' => $accountOption !== '' ? $accountOption : 'local-ig-'.$tenantId],
                        'timestamp' => now()->getTimestampMs(),
                        'message' => [
                            'mid' => 'm_ig_sim_'.Str::uuid(),
                            'text' => $text,
                        ],
                    ]],
                ]],
            ],
            'messenger', 'facebook', 'fb' => [
                'object' => 'page',
                'entry' => [[
                    'id' => $accountOption !== '' ? $accountOption : 'local-fb-'.$tenantId,
                    'time' => now()->getTimestampMs(),
                    'messaging' => [[
                        'sender' => ['id' => $sender],
                        'recipient' => ['id' => $accountOption !== '' ? $accountOption : 'local-fb-'.$tenantId],
                        'timestamp' => now()->getTimestampMs(),
                        'message' => [
                            'mid' => 'm_fb_sim_'.Str::uuid(),
                            'text' => $text,
                        ],
                    ]],
                ]],
            ],
            default => null,
        };

        if ($payload === null) {
            $this->error("Unsupported channel '{$channel}'. Use whatsapp, instagram or messenger.");

            return self::FAILURE;
        }

        $raw = json_encode($payload, JSON_THROW_ON_ERROR | JSON_UNESCAPED_UNICODE);
        $sig = 'sha256='.hash_hmac('sha256', $raw, $secret);
        $request = Request::create('/api/v1/webhooks/meta', 'POST', [], [], [], [
            'CONTENT_TYPE' => 'application/json',
            'HTTP_X_HUB_SIGNATURE_256' => $sig,
        ], $raw);

        $response = $kernel->handle($request);
        $this->info("status={$response->getStatusCode()} body={$response->getContent()}");

        return $response->getStatusCode() === 200 ? self::SUCCESS : self::FAILURE;
    }

    private function setupChannels(int $tenantId): void
    {
        $rawSettings = DB::table('tenants')->where('id', $tenantId)->value('settings_json');
        $settings = is_string($rawSettings) ? (json_decode($rawSettings, true) ?: []) : [];
        $settings['conversations']['ai_enabled'] = true;
        $settings['conversations']['copilot_enabled'] = true;
        DB::table('tenants')->where('id', $tenantId)->update([
            'settings_json' => json_encode($settings, JSON_THROW_ON_ERROR | JSON_UNESCAPED_UNICODE),
        ]);

        $integration = DB::table('integration_connections')
            ->where('tenant_id', $tenantId)
            ->where('provider', 'META')
            ->first(['id']);

        if ($integration === null) {
            $integrationId = (int) DB::table('integration_connections')->insertGetId([
                'tenant_id' => $tenantId,
                'public_id' => (string) Str::uuid(),
                'provider' => 'META',
                'name' => 'Meta Local Sandbox',
                'status' => 'ACTIVE',
                'access_token_secret_ref' => 'meta-local-'.$tenantId,
            ]);
        } else {
            $integrationId = (int) $integration->id;
            DB::table('integration_connections')->where('id', $integrationId)->update(['status' => 'ACTIVE']);
        }

        $channels = [
            ['type' => 'WHATSAPP', 'account' => 'local-wa-'.$tenantId, 'name' => 'WhatsApp Sandbox'],
            ['type' => 'INSTAGRAM_DM', 'account' => 'local-ig-'.$tenantId, 'name' => 'Instagram Sandbox'],
            ['type' => 'FACEBOOK_MESSENGER', 'account' => 'local-fb-'.$tenantId, 'name' => 'Messenger Sandbox'],
        ];

        foreach ($channels as $ch) {
            $existing = DB::table('channel_accounts')
                ->where('tenant_id', $tenantId)
                ->where('channel_type', $ch['type'])
                ->where('provider_account_id', $ch['account'])
                ->first(['id']);

            if ($existing === null) {
                DB::table('channel_accounts')->insert([
                    'tenant_id' => $tenantId,
                    'integration_id' => $integrationId,
                    'public_id' => (string) Str::uuid(),
                    'channel_type' => $ch['type'],
                    'provider_account_id' => $ch['account'],
                    'display_name' => $ch['name'],
                    'status' => 'ACTIVE',
                ]);
            } else {
                DB::table('channel_accounts')->where('id', $existing->id)->update([
                    'integration_id' => $integrationId,
                    'status' => 'ACTIVE',
                ]);
            }
        }
    }
}
