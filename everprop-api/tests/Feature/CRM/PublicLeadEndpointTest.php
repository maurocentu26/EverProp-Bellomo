<?php

namespace Tests\Feature\CRM;

use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Tests\TestCase;

final class PublicLeadEndpointTest extends TestCase
{
    private int $tenantId;

    private string $tenantPublicId;

    protected function setUp(): void
    {
        parent::setUp();

        $this->tenantPublicId = (string) Str::uuid();
        $this->tenantId = (int) DB::table('tenants')->insertGetId([
            'public_id' => $this->tenantPublicId,
            'name' => 'Public lead endpoint test',
            'slug' => 'lead-endpoint-'.strtolower(Str::random(12)),
            'timezone' => 'UTC',
            'status' => 'ACTIVE',
        ]);
        DB::table('pipeline_stages')->insert([
            'tenant_id' => $this->tenantId,
            'code' => 'NEW',
            'name' => 'New',
            'category' => 'OPEN',
            'position' => 1,
            'is_active' => true,
        ]);
    }

    protected function tearDown(): void
    {
        if (isset($this->tenantId)) {
            foreach ([
                'contact_consents',
                'lead_touchpoints',
                'domain_outbox',
                'lead_assignments',
                'lead_properties',
                'leads',
                'contact_identities',
                'contacts',
                'pipeline_stages',
            ] as $table) {
                DB::table($table)->where('tenant_id', $this->tenantId)->delete();
            }

            DB::table('tenants')->where('id', $this->tenantId)->delete();
        }

        parent::tearDown();
    }

    public function test_public_endpoint_is_idempotent_and_rejects_client_selected_tenant(): void
    {
        $payload = [
            'contact' => [
                'display_name' => 'Public Test',
                'email' => 'public-endpoint@example.test',
                'locale' => 'es-AR',
            ],
            'identity' => [
                'channel_type' => 'EMAIL',
                'provider_user_id' => 'public-endpoint@example.test',
            ],
            'consent' => [
                'purpose_code' => 'COMMERCIAL_CONTACT',
                'status' => 'GRANTED',
                'legal_text_version' => 'test-v1',
            ],
            'lead' => [
                'source_channel' => 'WEB_FORM',
                'source_kind' => 'CONTACT_FORM',
                'priority' => 'NORMAL',
            ],
            'touchpoint' => [
                'type' => 'WEB_FORM',
                'summary' => 'Public endpoint test',
            ],
        ];
        $headers = [
            'X-Everprop-Tenant' => $this->tenantPublicId,
            'Idempotency-Key' => 'public-endpoint-delivery-0001',
        ];

        $this->withHeaders($headers)
            ->postJson('/api/v1/public/leads', $payload)
            ->assertCreated()
            ->assertJsonPath('data.idempotent_replay', false);

        $this->withHeaders($headers)
            ->postJson('/api/v1/public/leads', $payload)
            ->assertOk()
            ->assertJsonPath('data.idempotent_replay', true);

        self::assertSame(1, DB::table('contacts')->where('tenant_id', $this->tenantId)->count());
        self::assertSame(1, DB::table('leads')->where('tenant_id', $this->tenantId)->count());
        self::assertSame(1, DB::table('lead_touchpoints')->where('tenant_id', $this->tenantId)->count());
        self::assertSame(1, DB::table('domain_outbox')
            ->where('tenant_id', $this->tenantId)
            ->where('event_type', 'PUBLIC_LEAD_RECEIVED')
            ->count());

        $this->withHeaders($headers + ['Idempotency-Key' => 'public-endpoint-delivery-0002'])
            ->postJson('/api/v1/public/leads', $payload + ['tenant_id' => $this->tenantId])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('tenant_id');
    }
}
