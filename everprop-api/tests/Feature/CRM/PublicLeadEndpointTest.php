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
            ->assertJsonValidationErrors('payload');
    }

    /** EVP-137: a lead nobody can contact was accepted (201), assigned and notified. */
    public function test_a_lead_without_email_or_phone_is_refused_and_phone_alone_is_enough(): void
    {
        $payload = fn (array $contact, array $identity) => [
            'contact' => $contact,
            'identity' => $identity,
            'lead' => ['source_channel' => 'WEB_CHAT', 'source_kind' => 'BELLOMITO_AI', 'priority' => 'NORMAL'],
            'touchpoint' => ['type' => 'WEB_CHAT', 'summary' => 'EVP-137'],
        ];
        $headers = ['X-Everprop-Tenant' => $this->tenantPublicId, 'Idempotency-Key' => 'evp137-anonymous-0001'];

        foreach ([['display_name' => null, 'email' => null, 'phone_e164' => null], ['display_name' => 'Laura', 'email' => '  ']] as $contact) {
            $this->withHeaders($headers)
                ->postJson('/api/v1/public/leads', $payload($contact, ['channel_type' => 'WEB_VISITOR', 'provider_user_id' => (string) Str::uuid()]))
                ->assertUnprocessable()
                ->assertJsonValidationErrors('contact');
        }
        self::assertSame(0, DB::table('leads')->where('tenant_id', $this->tenantId)->count());

        $this->withHeaders(['Idempotency-Key' => 'evp137-phone-only-0001'] + $headers)
            ->postJson('/api/v1/public/leads', $payload(['display_name' => 'Laura', 'phone_e164' => '+541155550137'], ['channel_type' => 'PHONE', 'provider_user_id' => '+541155550137']))
            ->assertCreated();
        self::assertSame(1, DB::table('leads')->where('tenant_id', $this->tenantId)->count());
    }
}
