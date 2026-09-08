<?php

namespace Tests\Feature\CRM;

use App\Domain\Identity\Enums\RoleCode;
use App\Domain\Tenancy\Models\Tenant;
use App\Models\User;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Tests\TestCase;

final class AdminLeadPaginationTest extends TestCase
{
    use DatabaseTransactions;

    public function test_leads_and_follow_ups_return_stable_pagination_metadata(): void
    {
        [$tenant, $admin] = $this->identity();
        $stageId = $this->stage($tenant->id);
        $leadIds = [];

        foreach (range(1, 3) as $index) {
            $leadIds[] = $this->lead($tenant->id, $admin->id, $stageId, $index);
        }

        foreach (range(1, 3) as $index) {
            $occurredAt = Carbon::now('UTC')->subMinutes($index);
            DB::table('lead_follow_ups')->insert([
                'tenant_id' => $tenant->id,
                'public_id' => (string) Str::uuid(),
                'lead_id' => $leadIds[0]['id'],
                'user_id' => $admin->id,
                'type' => 'note',
                'occurred_at' => $occurredAt,
                'summary' => "QA follow-up {$index}",
                'result' => 'Recorded',
                'created_at' => $occurredAt,
                'updated_at' => $occurredAt,
            ]);
        }

        $this->actingAs($admin);
        $headers = $this->tenantHeaders($tenant);

        $leadPageOne = $this->withHeaders($headers)->getJson('/api/v1/admin/leads?per_page=2&page=1');
        $leadPageTwo = $this->withHeaders($headers)->getJson('/api/v1/admin/leads?per_page=2&page=2');

        $leadPageOne->assertOk()
            ->assertJsonCount(2, 'data')
            ->assertJsonPath('meta.current_page', 1)
            ->assertJsonPath('meta.last_page', 2)
            ->assertJsonPath('meta.per_page', 2)
            ->assertJsonPath('meta.total', 3);
        $leadPageTwo->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('meta.current_page', 2);

        /** @var list<array{id: string}> $leadPageOneData */
        $leadPageOneData = $leadPageOne->json('data');
        /** @var list<array{id: string}> $leadPageTwoData */
        $leadPageTwoData = $leadPageTwo->json('data');
        $pageOneIds = collect($leadPageOneData)->pluck('id');
        $pageTwoIds = collect($leadPageTwoData)->pluck('id');
        self::assertCount(3, $pageOneIds->merge($pageTwoIds)->unique());

        $allFollowUps = $this->withHeaders($headers)->getJson('/api/v1/admin/follow-ups?per_page=2&page=2');
        $leadFollowUps = $this->withHeaders($headers)->getJson(
            '/api/v1/admin/leads/'.$leadIds[0]['public_id'].'/follow-ups?per_page=2&page=1'
        );

        $allFollowUps->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('meta.current_page', 2)
            ->assertJsonPath('meta.total', 3);
        $leadFollowUps->assertOk()
            ->assertJsonCount(2, 'data')
            ->assertJsonPath('meta.last_page', 2)
            ->assertJsonPath('meta.total', 3);
    }

    public function test_pagination_rejects_oversized_pages(): void
    {
        [$tenant, $admin] = $this->identity();
        $this->actingAs($admin);
        $headers = $this->tenantHeaders($tenant);

        $this->withHeaders($headers)
            ->getJson('/api/v1/admin/leads?per_page=101')
            ->assertUnprocessable()
            ->assertJsonValidationErrors('per_page');

        $this->withHeaders($headers)
            ->getJson('/api/v1/admin/follow-ups?page=0')
            ->assertUnprocessable()
            ->assertJsonValidationErrors('page');
    }

    /** @return array{Tenant, User} */
    private function identity(): array
    {
        $tenant = Tenant::factory()->create();
        $admin = User::factory()->for($tenant)->create(['role_code' => RoleCode::TENANT_ADMIN->value]);

        return [$tenant, $admin];
    }

    private function stage(int $tenantId): int
    {
        return (int) DB::table('pipeline_stages')->insertGetId([
            'tenant_id' => $tenantId,
            'code' => 'QA_PAGE',
            'name' => 'QA Pagination',
            'category' => 'OPEN',
            'position' => 999,
        ]);
    }

    /** @return array{id: int, public_id: string} */
    private function lead(int $tenantId, int $assignedUserId, int $stageId, int $index): array
    {
        $timestamp = Carbon::now('UTC')->subSeconds($index);
        $contactId = (int) DB::table('contacts')->insertGetId([
            'tenant_id' => $tenantId,
            'public_id' => (string) Str::uuid(),
            'display_name' => "QA Contact {$index}",
            'first_seen_at' => $timestamp,
            'last_seen_at' => $timestamp,
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
            'title' => "QA Lead {$index}",
            'first_touch_at' => $timestamp,
            'last_touch_at' => $timestamp,
            'created_at' => $timestamp,
            'updated_at' => $timestamp,
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
