<?php

namespace Tests\Feature\CRM;

use App\Domain\Identity\Enums\RoleCode;
use App\Domain\Tenancy\Models\Tenant;
use App\Models\User;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Str;
use Tests\TestCase;

final class NotificationWorkflowTest extends TestCase
{
    use DatabaseTransactions;

    public function test_read_pagination_and_recipient_isolation(): void
    {
        $tenant = Tenant::factory()->create();
        $user = User::factory()->for($tenant)->create(['role_code' => RoleCode::SALES_ADVISOR->value]);
        $other = User::factory()->for($tenant)->create(['role_code' => RoleCode::SALES_ADVISOR->value]);
        $id = (string) Str::uuid();
        $user->notifications()->create(['id' => $id, 'type' => 'QA', 'data' => ['title' => 'QA', 'message' => 'Notification test']]);
        $this->actingAs($other)->withHeaders(['X-Everprop-Tenant' => $tenant->public_id, 'Origin' => 'http://localhost:5173']);
        $this->patchJson("/api/v1/admin/notifications/$id/read")->assertNotFound();
        $this->actingAs($user);
        $beforeRevision = $this->getJson('/api/v1/admin/notifications/count')->assertOk()->json('revision');
        $this->patchJson("/api/v1/admin/notifications/$id/read")->assertOk();
        $this->getJson('/api/v1/admin/notifications')->assertOk()->assertJsonPath('data.0.read', true);
        $afterRevision = $this->getJson('/api/v1/admin/notifications/count')->assertOk()->json('revision');
        $this->assertNotSame($beforeRevision, $afterRevision);
        for ($i = 0; $i < 100; $i++) {
            $user->notifications()->create(['id' => (string) Str::uuid(), 'type' => 'QA', 'data' => ['message' => 'Pagination test']]);
        }
        $this->getJson('/api/v1/admin/notifications')->assertOk()->assertJsonCount(100, 'data')->assertJsonPath('meta.next_page', 2);
        $this->getJson('/api/v1/admin/notifications?page=2')->assertOk()->assertJsonCount(1, 'data')->assertJsonPath('meta.next_page', null);
    }

    public function test_unread_and_archive_only_touch_the_recipients_own_notification(): void
    {
        $tenant = Tenant::factory()->create();
        $otherTenant = Tenant::factory()->create();
        $user = User::factory()->for($tenant)->create(['role_code' => RoleCode::SALES_ADVISOR->value]);
        $colleague = User::factory()->for($tenant)->create(['role_code' => RoleCode::SALES_ADVISOR->value]);
        $outsider = User::factory()->for($otherTenant)->create(['role_code' => RoleCode::TENANT_ADMIN->value]);
        $id = (string) Str::uuid();
        $notification = $user->notifications()->create(['id' => $id, 'type' => 'QA', 'data' => ['title' => 'QA', 'message' => 'Archive test'], 'read_at' => now()]);

        $this->actingAs($colleague)->withHeaders(['X-Everprop-Tenant' => $tenant->public_id, 'Origin' => 'http://localhost:5173']);
        $this->patchJson("/api/v1/admin/notifications/$id/unread")->assertNotFound();
        $this->deleteJson("/api/v1/admin/notifications/$id")->assertNotFound();

        $this->actingAs($outsider)->withHeaders(['X-Everprop-Tenant' => $otherTenant->public_id]);
        $this->patchJson("/api/v1/admin/notifications/$id/unread")->assertNotFound();
        $this->deleteJson("/api/v1/admin/notifications/$id")->assertNotFound();
        $this->assertNotNull($notification->fresh()?->read_at);

        $this->actingAs($user)->withHeaders(['X-Everprop-Tenant' => $tenant->public_id]);
        $this->patchJson("/api/v1/admin/notifications/$id/unread")->assertOk()->assertJsonPath('status', 'marked_unread');
        $this->getJson('/api/v1/admin/notifications')->assertOk()->assertJsonPath('data.0.read', false)->assertJsonPath('meta.unread_count', 1);
        $this->deleteJson("/api/v1/admin/notifications/$id")->assertOk()->assertJsonPath('status', 'deleted');
        $this->assertNull($notification->fresh());
        $this->deleteJson("/api/v1/admin/notifications/$id")->assertNotFound();
        $this->deleteJson('/api/v1/admin/notifications/not-a-uuid')->assertNotFound();
    }
}
