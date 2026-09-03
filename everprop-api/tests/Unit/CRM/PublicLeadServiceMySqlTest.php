<?php

namespace Tests\Unit\CRM;

use App\Domain\CRM\Exceptions\IdempotencyConflict;
use App\Domain\CRM\Services\PublicLeadService;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use PHPUnit\Framework\Attributes\Group;
use Tests\TestCase;

#[Group('mysql')]
final class PublicLeadServiceMySqlTest extends TestCase
{
    private int $tenantId;

    protected function setUp(): void
    {
        parent::setUp();

        $suffix = strtolower(Str::random(12));
        $this->tenantId = (int) DB::table('tenants')->insertGetId([
            'public_id' => (string) Str::uuid(),
            'name' => 'CRM integration test',
            'slug' => 'crm-test-'.$suffix,
            'timezone' => 'UTC',
            'status' => 'ACTIVE',
        ]);

        DB::table('pipeline_stages')->insert([
            'tenant_id' => $this->tenantId,
            'code' => 'NEW',
            'name' => 'New',
            'category' => 'OPEN',
            'position' => 1,
            'is_active' => 1,
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
                'assignment_pool_members',
                'assignment_pools',
                'contact_identities',
                'contacts',
                'pipeline_stages',
                'users',
            ] as $table) {
                DB::table($table)->where('tenant_id', $this->tenantId)->delete();
            }

            DB::table('tenants')->where('id', $this->tenantId)->delete();
        }

        parent::tearDown();
    }

    public function test_submission_and_replay_use_schema_dedupe_and_create_each_outbox_event_once(): void
    {
        $payload = [
            'contact' => [
                'display_name' => 'Test Contact',
                'email' => 'crm-integration@example.test',
                'locale' => 'es-AR',
            ],
            'identity' => [
                'channel_type' => 'EMAIL',
                'provider_user_id' => 'crm-integration@example.test',
            ],
            'consent' => [
                'purpose_code' => 'COMMERCIAL_CONTACT',
                'status' => 'GRANTED',
                'legal_text_version' => 'test-v1',
            ],
            'lead' => [
                'source_channel' => 'WEB_FORM',
                'source_kind' => 'PROPERTY_INQUIRY',
                'title' => 'Website inquiry',
                'priority' => 'NORMAL',
                'occurred_at' => '2026-08-07T12:00:00+00:00',
            ],
            'touchpoint' => [
                'type' => 'WEB_FORM',
                'summary' => 'Integration test submission',
            ],
        ];

        $service = $this->app->make(PublicLeadService::class);
        $first = $service->submit($this->tenantId, $payload, 'test-delivery-00000001');
        $replay = $service->submit($this->tenantId, $payload, 'test-delivery-00000001');

        self::assertTrue($first->leadCreated);
        self::assertFalse($first->replayed);
        self::assertTrue($replay->replayed);
        self::assertSame($first->leadPublicId, $replay->leadPublicId);
        self::assertSame(1, DB::table('contacts')->where('tenant_id', $this->tenantId)->count());
        self::assertSame(1, DB::table('leads')->where('tenant_id', $this->tenantId)->count());
        self::assertSame(1, DB::table('lead_touchpoints')->where('tenant_id', $this->tenantId)->count());
        self::assertSame(1, DB::table('contact_consents')->where('tenant_id', $this->tenantId)->count());
        self::assertSame(1, DB::table('domain_outbox')
            ->where('tenant_id', $this->tenantId)
            ->where('event_type', 'LEAD_CREATED_UNASSIGNED')
            ->count());
        self::assertSame(1, DB::table('domain_outbox')
            ->where('tenant_id', $this->tenantId)
            ->where('event_type', 'PUBLIC_LEAD_RECEIVED')
            ->count());
    }

    public function test_reusing_delivery_key_with_changed_payload_is_rejected_without_an_extra_touchpoint(): void
    {
        $payload = [
            'contact' => [],
            'identity' => [
                'channel_type' => 'WEB_VISITOR',
                'provider_user_id' => 'visitor-test-1',
            ],
            'lead' => [
                'source_channel' => 'WEB_FORM',
                'source_kind' => 'CONTACT_FORM',
                'priority' => 'NORMAL',
            ],
            'touchpoint' => [
                'type' => 'WEB_FORM',
            ],
        ];

        $service = $this->app->make(PublicLeadService::class);
        $service->submit($this->tenantId, $payload, 'test-delivery-00000002');

        $payload['lead']['priority'] = 'URGENT';

        try {
            $service->submit($this->tenantId, $payload, 'test-delivery-00000002');
            self::fail('An idempotency conflict was expected.');
        } catch (IdempotencyConflict) {
            self::assertSame(1, DB::table('lead_touchpoints')->where('tenant_id', $this->tenantId)->count());
            self::assertSame(1, DB::table('leads')->where('tenant_id', $this->tenantId)->count());
        }
    }

    public function test_new_contacts_are_assigned_in_round_robin_order(): void
    {
        $users = [];

        foreach ([1, 2] as $position) {
            $users[] = (int) DB::table('users')->insertGetId([
                'tenant_id' => $this->tenantId,
                'public_id' => (string) Str::uuid(),
                'display_name' => 'Advisor '.$position,
                'email' => 'advisor-'.$position.'-'.strtolower(Str::random(8)).'@example.test',
                'role_code' => 'SALES_ADVISOR',
                'status' => 'ACTIVE',
            ]);
        }

        $poolId = (int) DB::table('assignment_pools')->insertGetId([
            'tenant_id' => $this->tenantId,
            'name' => 'Default leads',
            'purpose_code' => 'NEW_LEADS',
            'strategy' => 'ROUND_ROBIN',
            'is_default' => true,
            'status' => 'ACTIVE',
        ]);

        foreach ($users as $index => $userId) {
            DB::table('assignment_pool_members')->insert([
                'tenant_id' => $this->tenantId,
                'pool_id' => $poolId,
                'user_id' => $userId,
                'position' => $index + 1,
                'status' => 'ACTIVE',
            ]);
        }

        $service = $this->app->make(PublicLeadService::class);

        foreach ([1, 2] as $number) {
            $service->submit($this->tenantId, [
                'contact' => [],
                'identity' => [
                    'channel_type' => 'WEB_VISITOR',
                    'provider_user_id' => 'round-robin-visitor-'.$number,
                ],
                'lead' => [
                    'source_channel' => 'WEB_FORM',
                    'source_kind' => 'CONTACT_FORM',
                    'priority' => 'NORMAL',
                ],
                'touchpoint' => ['type' => 'WEB_FORM'],
            ], 'round-robin-delivery-000'.$number);
        }

        self::assertSame(
            $users,
            DB::table('leads')
                ->where('tenant_id', $this->tenantId)
                ->orderBy('id')
                ->pluck('assigned_user_id')
                ->map(static fn (mixed $id): int => (int) $id)
                ->all(),
        );
        self::assertSame(2, DB::table('lead_assignments')->where('tenant_id', $this->tenantId)->count());
        self::assertSame(2, (int) DB::table('assignment_pools')->where('id', $poolId)->value('allocation_counter'));
    }
}
