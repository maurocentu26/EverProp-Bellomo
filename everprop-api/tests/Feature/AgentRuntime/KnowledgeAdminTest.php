<?php

namespace Tests\Feature\AgentRuntime;

use App\Domain\Identity\Enums\RoleCode;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\DB;
use Tests\Feature\Conversations\ConversationTestSupport;
use Tests\TestCase;

/** S09 admin: only admins/managers write what the assistant may tell any visitor. */
final class KnowledgeAdminTest extends TestCase
{
    use ConversationTestSupport, DatabaseTransactions;

    public function test_managers_write_and_approve_advisors_only_read_and_tenants_are_isolated(): void
    {
        ['tenant' => $tenant] = $this->tenantWithIntegration();
        ['tenant' => $other] = $this->tenantWithIntegration();
        $manager = $this->user($tenant, RoleCode::SALES_MANAGER);
        $advisor = $this->user($tenant, RoleCode::SALES_ADVISOR);
        $outsider = $this->user($other, RoleCode::TENANT_ADMIN);
        $body = ['title' => 'Financiación', 'body' => "## Cuotas\n\nHasta 36 cuotas fijas en pesos."];

        $this->actingAs($advisor)->withHeaders($this->tenantHeaders($tenant))->postJson('/api/v1/admin/knowledge', $body)->assertForbidden();
        $id = $this->actingAs($manager)->withHeaders($this->tenantHeaders($tenant))->postJson('/api/v1/admin/knowledge', $body)
            ->assertCreated()->assertJsonPath('data.status', 'DRAFT')->json('data.id');
        $this->actingAs($advisor)->withHeaders($this->tenantHeaders($tenant))->postJson("/api/v1/admin/knowledge/$id/approve")->assertForbidden();

        $this->actingAs($outsider)->withHeaders($this->tenantHeaders($other))->postJson("/api/v1/admin/knowledge/$id/approve")->assertNotFound();
        $this->actingAs($outsider)->withHeaders($this->tenantHeaders($other))->getJson('/api/v1/admin/knowledge')->assertOk()->assertJsonCount(0, 'data');

        $this->actingAs($manager)->withHeaders($this->tenantHeaders($tenant))->postJson("/api/v1/admin/knowledge/$id/approve")->assertOk();
        $this->assertSame(1, DB::table('knowledge_chunks')->where('tenant_id', $tenant->id)->count());
        $this->assertSame('Financiación — Cuotas', DB::table('knowledge_chunks')->where('tenant_id', $tenant->id)->value('heading'));
        $this->actingAs($advisor)->withHeaders($this->tenantHeaders($tenant))->getJson('/api/v1/admin/knowledge')->assertOk()
            ->assertJsonPath('data.0.status', 'APPROVED');

        $this->actingAs($manager)->withHeaders($this->tenantHeaders($tenant))->postJson('/api/v1/admin/knowledge', $body + ['valid_until' => '2020-01-01'])
            ->assertUnprocessable();
    }
}
