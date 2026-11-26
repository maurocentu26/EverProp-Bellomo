<?php

namespace Tests\Feature\Conversations;

use App\Domain\Identity\Enums\RoleCode;
use App\Domain\Tenancy\Models\Tenant;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Queue;
use Illuminate\Support\Str;
use Tests\TestCase;

/** EVP-207: admin-only assistant test sessions with per-message reviews and closing notes. */
final class AssistantTestSessionTest extends TestCase
{
    use ConversationTestSupport, DatabaseTransactions;

    protected function setUp(): void
    {
        parent::setUp();
        config([
            'conversations.ai_enabled' => true,
            'conversations.copilot_enabled' => true,
            'agent.llm_provider' => 'anthropic',
        ]);
        Queue::fake();
    }

    private function provisionWebChannel(Tenant $tenant): void
    {
        $integration = (int) DB::table('integration_connections')->insertGetId([
            'tenant_id' => $tenant->id,
            'public_id' => (string) Str::uuid(),
            'provider' => 'WEB',
            'name' => 'Web',
            'status' => 'ACTIVE',
        ]);
        $this->webChannel($tenant->id, $integration);
    }

    public function test_admin_can_run_session_rate_messages_finish_and_export_trace(): void
    {
        $tenant = Tenant::factory()->create(['settings_json' => ['conversations' => ['ai_enabled' => true]]]);
        $this->provisionWebChannel($tenant);
        $admin = $this->user($tenant, RoleCode::TENANT_ADMIN);

        $created = $this->actingAs($admin)->withHeaders($this->tenantHeaders($tenant))
            ->postJson('/api/v1/admin/assistant/test-sessions', ['title' => 'Prueba loteos'])
            ->assertCreated()
            ->assertJsonPath('data.title', 'Prueba loteos')
            ->assertJsonPath('data.status', 'OPEN');

        $sessionId = (string) $created->json('data.id');
        $conversationPublicId = (string) $created->json('data.conversation_id');
        $conversationDbId = (int) DB::table('conversations')->where('tenant_id', $tenant->id)->where('public_id', $conversationPublicId)->value('id');

        // Send a visitor test message through the real inbound pipeline.
        $clientMsgId = (string) Str::uuid();
        $this->actingAs($admin)->withHeaders($this->tenantHeaders($tenant))
            ->postJson("/api/v1/admin/assistant/test-sessions/{$sessionId}/messages", [
                'client_message_id' => $clientMsgId,
                'text' => 'Quiero info sobre Loteo San Pablo',
            ])
            ->assertCreated()
            ->assertJsonPath('data.sequence', 1);

        // Simulate a delivered assistant reply in the conversation.
        DB::table('messages')->insert([
            'tenant_id' => $tenant->id,
            'conversation_id' => $conversationDbId,
            'sequence' => 2,
            'direction' => 'OUTBOUND',
            'sender_type' => 'BOT',
            'message_type' => 'TEXT',
            'text_body' => 'Loteo San Pablo está en Barrio Coronel Arias.',
            'delivery_status' => 'SENT',
            'occurred_at' => now('UTC')->format('Y-m-d H:i:s.v'),
        ]);

        // Rate the assistant reply and add a note.
        $this->actingAs($admin)->withHeaders($this->tenantHeaders($tenant))
            ->putJson("/api/v1/admin/assistant/test-sessions/{$sessionId}/messages/2/review", [
                'rating' => 'BAD',
                'note' => 'Faltó aclarar que no se informan precios por chat.',
            ])
            ->assertOk()
            ->assertJsonPath('data.rating', 'BAD')
            ->assertJsonPath('data.note', 'Faltó aclarar que no se informan precios por chat.');

        // Finish session with closing note.
        $this->actingAs($admin)->withHeaders($this->tenantHeaders($tenant))
            ->postJson("/api/v1/admin/assistant/test-sessions/{$sessionId}/finish", [
                'closing_note' => 'En general bien, ajustar respuestas sobre ubicación.',
            ])
            ->assertOk()
            ->assertJsonPath('data.status', 'FINISHED')
            ->assertJsonPath('data.closing_note', 'En general bien, ajustar respuestas sobre ubicación.');

        // Finished session rejects new messages with 409.
        $this->actingAs($admin)->withHeaders($this->tenantHeaders($tenant))
            ->postJson("/api/v1/admin/assistant/test-sessions/{$sessionId}/messages", [
                'client_message_id' => (string) Str::uuid(),
                'text' => 'Otro mensaje',
            ])
            ->assertConflict();

        // Another admin of the same tenant can read the full annotated session.
        $reviewer = $this->user($tenant, RoleCode::TENANT_ADMIN);
        $this->actingAs($reviewer)->withHeaders($this->tenantHeaders($tenant))
            ->getJson("/api/v1/admin/assistant/test-sessions/{$sessionId}")
            ->assertOk()
            ->assertJsonPath('data.status', 'FINISHED')
            ->assertJsonPath('data.closing_note', 'En general bien, ajustar respuestas sobre ubicación.')
            ->assertJsonPath('data.messages.1.review.rating', 'BAD')
            ->assertJsonPath('data.messages.1.review.note', 'Faltó aclarar que no se informan precios por chat.');

        // Index returns summary counts.
        $this->actingAs($reviewer)->withHeaders($this->tenantHeaders($tenant))
            ->getJson('/api/v1/admin/assistant/test-sessions')
            ->assertOk()
            ->assertJsonPath('data.0.id', $sessionId)
            ->assertJsonPath('data.0.bad_count', 1)
            ->assertJsonPath('data.0.noted_count', 1)
            ->assertJsonPath('data.0.message_count', 2);
    }

    public function test_non_admins_and_other_tenants_cannot_access_test_sessions(): void
    {
        $tenantA = Tenant::factory()->create();
        $tenantB = Tenant::factory()->create();
        $this->provisionWebChannel($tenantA);
        $adminA = $this->user($tenantA, RoleCode::TENANT_ADMIN);
        $adminB = $this->user($tenantB, RoleCode::TENANT_ADMIN);

        // Unauthenticated -> 401 (before actingAs binds a user on the guard)
        $this->withHeaders($this->tenantHeaders($tenantA))
            ->getJson('/api/v1/admin/assistant/test-sessions')
            ->assertUnauthorized();

        $sessionId = (string) $this->actingAs($adminA)->withHeaders($this->tenantHeaders($tenantA))
            ->postJson('/api/v1/admin/assistant/test-sessions', ['title' => 'Privada A'])
            ->assertCreated()
            ->json('data.id');

        // Non-admins -> 403
        foreach ([RoleCode::SALES_ADVISOR, RoleCode::SALES_MANAGER, RoleCode::BOT_OPERATOR, RoleCode::ROTATOR, RoleCode::READ_ONLY] as $role) {
            $user = $this->user($tenantA, $role);
            $this->actingAs($user)->withHeaders($this->tenantHeaders($tenantA))
                ->getJson('/api/v1/admin/assistant/test-sessions')->assertForbidden();
            $this->actingAs($user)->withHeaders($this->tenantHeaders($tenantA))
                ->postJson('/api/v1/admin/assistant/test-sessions', ['title' => 'No'])->assertForbidden();
        }

        // Cross-tenant: admin B never sees A's sessions and gets 404 on direct access.
        $this->actingAs($adminB)->withHeaders($this->tenantHeaders($tenantB))
            ->getJson('/api/v1/admin/assistant/test-sessions')
            ->assertOk()
            ->assertJsonCount(0, 'data');
        $this->actingAs($adminB)->withHeaders($this->tenantHeaders($tenantB))
            ->getJson("/api/v1/admin/assistant/test-sessions/{$sessionId}")
            ->assertNotFound();
        $this->actingAs($adminB)->withHeaders($this->tenantHeaders($tenantB))
            ->postJson("/api/v1/admin/assistant/test-sessions/{$sessionId}/messages", [
                'client_message_id' => (string) Str::uuid(),
                'text' => 'hack',
            ])
            ->assertNotFound();
        $this->actingAs($adminB)->withHeaders($this->tenantHeaders($tenantB))
            ->putJson("/api/v1/admin/assistant/test-sessions/{$sessionId}/messages/1/review", ['rating' => 'BAD'])
            ->assertNotFound();
        $this->actingAs($adminB)->withHeaders($this->tenantHeaders($tenantB))
            ->postJson("/api/v1/admin/assistant/test-sessions/{$sessionId}/finish", ['closing_note' => 'hack'])
            ->assertNotFound();
        $this->actingAs($adminA)->withHeaders($this->tenantHeaders($tenantB))
            ->getJson("/api/v1/admin/assistant/test-sessions/{$sessionId}")
            ->assertNotFound();
    }
}
