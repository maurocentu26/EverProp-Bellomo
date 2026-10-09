<?php

namespace Tests\Feature\Conversations;

use App\Domain\Identity\Enums\RoleCode;
use App\Domain\Tenancy\Models\Tenant;
use App\Models\User;
use Illuminate\Http\Response;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Illuminate\Testing\TestResponse;

/** Synthetic tenants/channels only (no Bellomo data). */
trait ConversationTestSupport
{
    protected const APP_SECRET = 'test-app-secret';

    /** @return array{tenant: Tenant, integration: int} */
    protected function tenantWithIntegration(string $provider = 'META'): array
    {
        $tenant = Tenant::factory()->create();
        $integration = (int) DB::table('integration_connections')->insertGetId([
            'tenant_id' => $tenant->id, 'public_id' => (string) Str::uuid(), 'provider' => $provider,
            'name' => $provider.' '.Str::random(6), 'status' => 'ACTIVE', 'access_token_secret_ref' => 'wa-token-'.$tenant->id,
        ]);

        return ['tenant' => $tenant, 'integration' => $integration];
    }

    protected function whatsappChannel(int $tenantId, int $integrationId, string $phoneNumberId): int
    {
        return (int) DB::table('channel_accounts')->insertGetId([
            'tenant_id' => $tenantId, 'integration_id' => $integrationId, 'public_id' => (string) Str::uuid(),
            'channel_type' => 'WHATSAPP', 'provider_account_id' => $phoneNumberId, 'display_name' => 'WA '.$phoneNumberId,
        ]);
    }

    /** @return array{id: int, public_id: string} */
    protected function webChannel(int $tenantId, int $integrationId): array
    {
        $publicId = (string) Str::uuid();
        $id = (int) DB::table('channel_accounts')->insertGetId([
            'tenant_id' => $tenantId, 'integration_id' => $integrationId, 'public_id' => $publicId,
            'channel_type' => 'WEB_CHAT', 'provider_account_id' => 'widget-'.$publicId, 'display_name' => 'Widget',
            'metadata_json' => json_encode(['allowed_origins' => ['http://localhost:5173']]),
        ]);

        return ['id' => $id, 'public_id' => $publicId];
    }

    protected function user(Tenant $tenant, RoleCode $role): User
    {
        return User::factory()->for($tenant)->create(['role_code' => $role->value]);
    }

    /** @return array<string, string> */
    protected function tenantHeaders(Tenant $tenant): array
    {
        return ['X-Everprop-Tenant' => $tenant->public_id, 'Origin' => 'http://localhost:5173'];
    }

    /** @param list<array<string, mixed>> $messages
     * @param list<array<string, mixed>> $statuses */
    protected function waPayload(string $phoneNumberId, array $messages = [], array $statuses = []): string
    {
        return json_encode([
            'object' => 'whatsapp_business_account',
            'entry' => [[
                'id' => 'WABA-1',
                'changes' => [[
                    'field' => 'messages',
                    'value' => array_filter([
                        'messaging_product' => 'whatsapp',
                        'metadata' => ['display_phone_number' => '5493880000000', 'phone_number_id' => $phoneNumberId],
                        'contacts' => [['profile' => ['name' => 'Cliente Sintético'], 'wa_id' => '5493881111111']],
                        'messages' => $messages ?: null,
                        'statuses' => $statuses ?: null,
                    ]),
                ]],
            ]],
        ], JSON_THROW_ON_ERROR);
    }

    /** @return array<string, mixed> */
    protected function waText(string $id, string $body, string $from = '5493881111111'): array
    {
        return ['from' => $from, 'id' => $id, 'timestamp' => (string) now()->timestamp, 'type' => 'text', 'text' => ['body' => $body]];
    }

    /** @return TestResponse<Response> */
    protected function postWebhook(string $raw, ?string $secret = self::APP_SECRET): TestResponse
    {
        $headers = ['CONTENT_TYPE' => 'application/json'];
        if ($secret !== null) {
            $headers['HTTP_X_HUB_SIGNATURE_256'] = 'sha256='.hash_hmac('sha256', $raw, $secret);
        }

        return $this->call('POST', '/api/v1/webhooks/meta/whatsapp', [], [], [], $headers, $raw);
    }
}
