<?php

namespace Tests\Feature\CRM;

use App\Domain\Identity\Enums\RoleCode;
use App\Domain\Tenancy\Models\Tenant;
use App\Models\User;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Tests\TestCase;

final class AdminLeadAuthorizationTest extends TestCase
{
    use DatabaseTransactions;

    public function test_read_only_user_cannot_mutate_leads_or_follow_ups(): void
    {
        [$tenant, $viewer] = $this->identity(RoleCode::READ_ONLY);
        $this->actingAs($viewer);
        $headers = $this->tenantHeaders($tenant);

        $this->withHeaders($headers)
            ->postJson('/api/v1/admin/leads', ['name' => 'Forbidden lead'])
            ->assertForbidden();

        $this->withHeaders($headers)
            ->postJson('/api/v1/admin/leads/not-a-lead/follow-ups', [])
            ->assertForbidden();
    }

    public function test_advisor_cannot_update_or_add_follow_up_to_another_advisors_lead(): void
    {
        [$tenant, $advisor] = $this->identity(RoleCode::SALES_ADVISOR);
        $otherAdvisor = User::factory()->for($tenant)->create([
            'role_code' => RoleCode::SALES_ADVISOR->value,
        ]);
        $lead = $this->lead($tenant->id, $otherAdvisor->id);

        $this->actingAs($advisor);
        $headers = $this->tenantHeaders($tenant);

        $this->withHeaders($headers)
            ->patchJson('/api/v1/admin/leads/'.$lead['public_id'], ['notes' => 'Forbidden change'])
            ->assertNotFound();

        $this->withHeaders($headers)
            ->postJson('/api/v1/admin/leads/'.$lead['public_id'].'/follow-ups', [
                'type' => 'note',
                'occurred_at' => now()->toISOString(),
                'summary' => 'Forbidden follow-up',
                'result' => 'Forbidden',
            ])
            ->assertNotFound();
    }

    public function test_advisor_can_keep_self_assignment_but_cannot_reassign_a_lead(): void
    {
        [$tenant, $advisor] = $this->identity(RoleCode::SALES_ADVISOR);
        $lead = $this->lead($tenant->id, $advisor->id);
        $otherAdvisor = User::factory()->for($tenant)->create([
            'role_code' => RoleCode::SALES_ADVISOR->value,
        ]);

        $this->actingAs($advisor);

        $this->withHeaders($this->tenantHeaders($tenant))
            ->patchJson('/api/v1/admin/leads/'.$lead['public_id'], [
                'agent_id' => $advisor->public_id,
                'notes' => 'Own lead update',
            ])
            ->assertOk();

        $this->withHeaders($this->tenantHeaders($tenant))
            ->patchJson('/api/v1/admin/leads/'.$lead['public_id'], [
                'agent_id' => $otherAdvisor->public_id,
            ])
            ->assertForbidden();
    }

    public function test_invalid_admin_lead_payload_returns_validation_error_without_debug_paths(): void
    {
        [$tenant, $admin] = $this->identity(RoleCode::TENANT_ADMIN);
        $this->actingAs($admin);

        $response = $this->withHeaders($this->tenantHeaders($tenant))
            ->postJson('/api/v1/admin/leads', []);

        $response->assertUnprocessable()
            ->assertJsonValidationErrors('name')
            ->assertJsonMissingPath('file')
            ->assertJsonMissingPath('line');
    }

    /** @return array{Tenant, User} */
    private function identity(RoleCode $role): array
    {
        $tenant = Tenant::factory()->create();
        $user = User::factory()->for($tenant)->create(['role_code' => $role->value]);

        return [$tenant, $user];
    }

    /** @return array{id: int, public_id: string} */
    private function lead(int $tenantId, int $assignedUserId): array
    {
        $now = now();
        $contactId = (int) DB::table('contacts')->insertGetId([
            'tenant_id' => $tenantId,
            'public_id' => (string) Str::uuid(),
            'display_name' => 'QA Contact',
            'first_seen_at' => $now,
            'last_seen_at' => $now,
        ]);
        $stageId = (int) DB::table('pipeline_stages')->insertGetId([
            'tenant_id' => $tenantId,
            'code' => 'QA_NEW',
            'name' => 'QA New',
            'category' => 'OPEN',
            'position' => 999,
        ]);
        $publicId = (string) Str::uuid();
        $id = (int) DB::table('leads')->insertGetId([
            'tenant_id' => $tenantId,
            'public_id' => $publicId,
            'contact_id' => $contactId,
            'stage_id' => $stageId,
            'assigned_user_id' => $assignedUserId,
            'assignment_method' => 'MANUAL',
            'source_channel' => 'WEB_FORM',
            'source_kind' => 'QA',
            'title' => 'QA Lead',
            'first_touch_at' => $now,
            'last_touch_at' => $now,
        ]);

        return ['id' => $id, 'public_id' => $publicId];
    }

    /** @return array<string, string> */
    private function tenantHeaders(Tenant $tenant): array
    {
        return [
            'X-Everprop-Tenant' => $tenant->public_id,
            'Origin' => 'http://localhost:5173',
        ];
    }
}
