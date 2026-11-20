<?php

namespace Tests\Feature\CRM;

use App\Domain\CRM\Notifications\LeadAssignedNotification;
use App\Domain\Identity\Enums\RoleCode;
use App\Domain\Tenancy\Models\Tenant;
use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Notification;
use Tests\TestCase;

/**
 * EVP-136: a new lead nobody follows (manual or web with an empty rotation) told nobody.
 * Committed rows (the web form runs sp_create_or_get_open_lead, which refuses an open transaction), cleaned up after.
 */
final class UnassignedLeadNotificationTest extends TestCase
{
    private Tenant $tenant;

    private User $admin;

    private User $manager;

    private User $advisor;

    private User $disabledAdmin;

    protected function setUp(): void
    {
        parent::setUp();
        Notification::fake();
        $this->tenant = Tenant::factory()->create();
        $this->admin = User::factory()->for($this->tenant)->create(['role_code' => RoleCode::TENANT_ADMIN->value]);
        $this->manager = User::factory()->for($this->tenant)->create(['role_code' => RoleCode::SALES_MANAGER->value]);
        $this->advisor = User::factory()->for($this->tenant)->create(['role_code' => RoleCode::SALES_ADVISOR->value]);
        $this->disabledAdmin = User::factory()->for($this->tenant)->disabled()->create(['role_code' => RoleCode::TENANT_ADMIN->value]);
        DB::table('pipeline_stages')->insert(['tenant_id' => $this->tenant->id, 'code' => 'NEW', 'name' => 'Nuevo', 'category' => 'OPEN', 'position' => 1, 'is_active' => true]);
        $this->withHeaders(['X-Everprop-Tenant' => $this->tenant->public_id, 'Origin' => 'http://localhost:5173']);
    }

    protected function tearDown(): void
    {
        $this->deleteSyntheticTenants([(int) $this->tenant->id]);
        parent::tearDown();
    }

    /** @param list<int> $tenantIds */
    private function deleteSyntheticTenants(array $tenantIds): void
    {
        if ($tenantIds === []) {
            return;
        }
        $tables = DB::table('information_schema.COLUMNS')->where('COLUMNS.TABLE_SCHEMA', DB::getDatabaseName())
            ->where('COLUMNS.COLUMN_NAME', 'tenant_id')->join('information_schema.TABLES as t', fn ($j) => $j
            ->on('t.TABLE_NAME', '=', 'COLUMNS.TABLE_NAME')->on('t.TABLE_SCHEMA', '=', 'COLUMNS.TABLE_SCHEMA'))
            ->where('t.TABLE_TYPE', 'BASE TABLE')->pluck('COLUMNS.TABLE_NAME');
        DB::statement('SET FOREIGN_KEY_CHECKS=0');
        foreach ($tables as $table) {
            DB::table($table)->whereIn('tenant_id', $tenantIds)->delete();
        }
        DB::table('tenants')->whereIn('id', $tenantIds)->delete();
        DB::statement('SET FOREIGN_KEY_CHECKS=1');
    }

    private function assertManagersToldOnce(string $leadPublicId, string $actionUrl): void
    {
        foreach ([$this->admin, $this->manager] as $user) {
            Notification::assertSentToTimes($user, LeadAssignedNotification::class, 1);
            Notification::assertSentTo($user, LeadAssignedNotification::class, fn (LeadAssignedNotification $n) => $n->eventType === 'LEAD_CREATED_UNASSIGNED'
                && $n->title === 'Lead pendiente de asignación' && $n->leadPublicId === $leadPublicId && $n->toArray($user)['action_url'] === $actionUrl);
        }
        Notification::assertNotSentTo([$this->advisor, $this->disabledAdmin], LeadAssignedNotification::class);
    }

    public function test_a_manual_lead_without_advisor_tells_every_active_admin_and_manager(): void
    {
        $id = $this->actingAs($this->admin)->postJson('/api/v1/admin/leads', ['phone' => '11 5555-0109', 'name' => 'Laura Gómez'])->assertCreated()->json('data.id');

        $this->assertManagersToldOnce($id, "/admin/leads/{$id}");
    }

    public function test_an_assigned_manual_lead_only_tells_its_advisor(): void
    {
        $this->actingAs($this->admin)->postJson('/api/v1/admin/leads', ['phone' => '11 5555-0110', 'name' => 'Laura Gómez', 'agent_id' => $this->advisor->public_id])->assertCreated();

        Notification::assertSentTo($this->advisor, LeadAssignedNotification::class, fn (LeadAssignedNotification $n) => $n->eventType === 'LEAD_CREATED');
        Notification::assertNotSentTo([$this->admin, $this->manager], LeadAssignedNotification::class);
    }

    public function test_a_web_lead_the_empty_rotation_leaves_unassigned_tells_admins_and_managers(): void
    {
        $this->withHeaders(['Idempotency-Key' => 'evp136-web-form-'.$this->tenant->id])->postJson('/api/v1/public/leads', [
            'contact' => ['display_name' => 'Laura Web', 'phone_e164' => '+541155550136'],
            'identity' => ['channel_type' => 'PHONE', 'provider_user_id' => '+541155550136'],
            'consent' => ['purpose_code' => 'COMMERCIAL_CONTACT', 'status' => 'GRANTED', 'legal_text_version' => 'test-v1'],
            'lead' => ['source_channel' => 'WEB_FORM', 'source_kind' => 'CONTACT_FORM', 'priority' => 'NORMAL'],
            'touchpoint' => ['type' => 'WEB_FORM', 'summary' => 'EVP-136'],
        ])->assertSuccessful();

        $lead = DB::table('leads')->where('tenant_id', $this->tenant->id)->sole();
        $this->assertNull($lead->assigned_user_id, 'no assignment pool: the rotation leaves it unassigned');
        $this->assertManagersToldOnce((string) $lead->public_id, "/admin/leads/{$lead->public_id}");
    }
}
