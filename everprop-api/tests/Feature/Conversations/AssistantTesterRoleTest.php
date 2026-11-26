<?php

namespace Tests\Feature\Conversations;

use App\Domain\Identity\Enums\RoleCode;
use App\Domain\Tenancy\Models\Tenant;
use App\Models\User;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Queue;
use Illuminate\Support\Str;
use Tests\TestCase;

/** EVP-212: the client's QA account only reaches its own test sessions and reads their conversations. */
final class AssistantTesterRoleTest extends TestCase
{
    use ConversationTestSupport, DatabaseTransactions;

    protected function setUp(): void
    {
        parent::setUp();
        config(['conversations.ai_enabled' => true, 'agent.llm_provider' => 'anthropic']);
        Queue::fake();
    }

    private function tenantWithWeb(): Tenant
    {
        $tenant = Tenant::factory()->create(['settings_json' => ['conversations' => ['ai_enabled' => true]]]);
        $integration = (int) DB::table('integration_connections')->insertGetId([
            'tenant_id' => $tenant->id, 'public_id' => (string) Str::uuid(), 'provider' => 'WEB', 'name' => 'Web', 'status' => 'ACTIVE',
        ]);
        $this->webChannel($tenant->id, $integration);

        return $tenant;
    }

    /** @return array{0: string, 1: string} session and conversation public ids */
    private function newSession(Tenant $tenant, User $user, string $title): array
    {
        $created = $this->actingAs($user)->withHeaders($this->tenantHeaders($tenant))
            ->postJson('/api/v1/admin/assistant/test-sessions', ['title' => $title])->assertCreated();

        return [(string) $created->json('data.id'), (string) $created->json('data.conversation_id')];
    }

    /** A delivered bot message; with $handoff it is the notice queued by ConversationControl::requestHuman. */
    private function botMessage(Tenant $tenant, string $conversationPublicId, int $sequence, bool $handoff): void
    {
        $conversation = DB::table('conversations')->where('tenant_id', $tenant->id)->where('public_id', $conversationPublicId)->first(['id', 'channel_account_id']);
        $now = now('UTC')->format('Y-m-d H:i:s.v');
        $messageId = (int) DB::table('messages')->insertGetId([
            'tenant_id' => $tenant->id, 'conversation_id' => $conversation->id, 'channel_account_id' => $conversation->channel_account_id,
            'sequence' => $sequence, 'direction' => 'OUTBOUND', 'sender_type' => 'BOT', 'message_type' => 'TEXT',
            'text_body' => $handoff ? 'Te derivo con un asesor.' : 'Hola, ¿en qué te ayudo?', 'delivery_status' => 'SENT', 'occurred_at' => $now,
        ]);
        DB::table('outbound_jobs')->insert([
            'tenant_id' => $tenant->id, 'channel_account_id' => $conversation->channel_account_id, 'conversation_id' => $conversation->id,
            'message_id' => $messageId, 'control_epoch' => 1, 'idempotency_key' => 'test:'.Str::uuid(), 'job_type' => 'SEND_MESSAGE',
            'payload_json' => json_encode(['text_sha256' => str_repeat('a', 64)] + ($handoff ? ['handoff_notice' => true] : [])),
            'status' => 'SENT', 'scheduled_at' => $now,
        ]);
    }

    public function test_tester_runs_its_own_sessions_and_sees_which_reply_handed_off(): void
    {
        $tenant = $this->tenantWithWeb();
        $tester = $this->user($tenant, RoleCode::ASSISTANT_TESTER);
        $otherTester = $this->user($tenant, RoleCode::ASSISTANT_TESTER);
        $admin = $this->user($tenant, RoleCode::TENANT_ADMIN);
        $headers = $this->tenantHeaders($tenant);

        [$own, $ownConversation] = $this->newSession($tenant, $tester, 'Mía');
        [$others] = $this->newSession($tenant, $otherTester, 'Del otro tester');
        [$admins, $adminConversation] = $this->newSession($tenant, $admin, 'Del admin');
        // A handoff in another conversation never marks the tester's messages.
        $this->botMessage($tenant, $adminConversation, 1, true);

        $this->actingAs($tester)->withHeaders($headers)->postJson("/api/v1/admin/assistant/test-sessions/{$own}/messages", [
            'client_message_id' => (string) Str::uuid(), 'text' => 'Busco un lote',
        ])->assertCreated();
        $this->botMessage($tenant, $ownConversation, 2, false);
        $this->botMessage($tenant, $ownConversation, 3, true);

        $this->actingAs($tester)->withHeaders($headers)->getJson("/api/v1/admin/assistant/test-sessions/{$own}")
            ->assertOk()
            ->assertJsonPath('data.messages.1.handoff', false)
            ->assertJsonPath('data.messages.2.handoff', true);
        $this->actingAs($tester)->withHeaders($headers)->putJson("/api/v1/admin/assistant/test-sessions/{$own}/messages/3/review", [
            'rating' => 'BAD', 'note' => 'Derivación: muy temprana. Podía seguir preguntando la zona.',
        ])->assertOk()->assertJsonPath('data.note', 'Derivación: muy temprana. Podía seguir preguntando la zona.');
        $this->actingAs($tester)->withHeaders($headers)->postJson("/api/v1/admin/assistant/test-sessions/{$own}/finish", ['closing_note' => 'Ok'])->assertOk();

        // Only its own sessions: the list has one row and the others are 404 for every verb.
        $this->actingAs($tester)->withHeaders($headers)->getJson('/api/v1/admin/assistant/test-sessions')
            ->assertOk()->assertJsonCount(1, 'data')->assertJsonPath('data.0.id', $own);
        foreach ([$others, $admins] as $foreign) {
            $this->actingAs($tester)->withHeaders($headers)->getJson("/api/v1/admin/assistant/test-sessions/{$foreign}")->assertNotFound();
            $this->actingAs($tester)->withHeaders($headers)->postJson("/api/v1/admin/assistant/test-sessions/{$foreign}/messages", [
                'client_message_id' => (string) Str::uuid(), 'text' => 'x',
            ])->assertNotFound();
            $this->actingAs($tester)->withHeaders($headers)->putJson("/api/v1/admin/assistant/test-sessions/{$foreign}/messages/1/review", ['rating' => 'BAD'])->assertNotFound();
            $this->actingAs($tester)->withHeaders($headers)->postJson("/api/v1/admin/assistant/test-sessions/{$foreign}/finish", [])->assertNotFound();
        }

        // Eversys admins still review every session, the tester's included.
        $this->actingAs($admin)->withHeaders($headers)->getJson('/api/v1/admin/assistant/test-sessions')->assertOk()->assertJsonCount(3, 'data');
        $this->actingAs($admin)->withHeaders($headers)->getJson("/api/v1/admin/assistant/test-sessions/{$own}")
            ->assertOk()->assertJsonPath('data.messages.2.review.note', 'Derivación: muy temprana. Podía seguir preguntando la zona.');
    }

    public function test_tester_reads_only_its_conversations_and_cannot_write(): void
    {
        $tenant = $this->tenantWithWeb();
        $tester = $this->user($tenant, RoleCode::ASSISTANT_TESTER);
        $admin = $this->user($tenant, RoleCode::TENANT_ADMIN);
        $headers = $this->tenantHeaders($tenant);
        [, $ownConversation] = $this->newSession($tenant, $tester, 'Mía');
        [, $adminConversation] = $this->newSession($tenant, $admin, 'Del admin');
        $this->botMessage($tenant, $ownConversation, 1, false);

        $this->actingAs($tester)->withHeaders($headers)->getJson('/api/v1/admin/conversations')
            ->assertOk()->assertJsonCount(1, 'data')->assertJsonPath('data.0.id', $ownConversation);
        $this->actingAs($tester)->withHeaders($headers)->getJson("/api/v1/admin/conversations/{$ownConversation}/messages")
            ->assertOk()->assertJsonPath('data.0.text', 'Hola, ¿en qué te ayudo?');
        $this->actingAs($tester)->withHeaders($headers)->getJson("/api/v1/admin/conversations/{$adminConversation}/messages")->assertNotFound();
        $this->actingAs($tester)->withHeaders($headers)->getJson("/api/v1/admin/conversations/{$adminConversation}/media/1")->assertNotFound();
        $this->actingAs($admin)->withHeaders($headers)->getJson('/api/v1/admin/conversations')->assertOk()->assertJsonCount(2, 'data');

        foreach (['takeover', 'resume', 'messages', 'notes', 'close', 'reopen', 'lead', 'suggestion', 'resolve-unknown'] as $action) {
            $this->actingAs($tester)->withHeaders($headers)->postJson("/api/v1/admin/conversations/{$ownConversation}/{$action}", [])->assertForbidden();
        }
        $this->actingAs($tester)->withHeaders($headers)->getJson("/api/v1/admin/conversations/{$ownConversation}/trace")->assertForbidden();
        $this->actingAs($tester)->withHeaders($headers)->getJson('/api/v1/admin/conversations/possible-leads/count')->assertForbidden();
    }

    public function test_tester_is_kept_out_of_the_rest_of_the_panel(): void
    {
        $tenant = $this->tenantWithWeb();
        $tester = $this->user($tenant, RoleCode::ASSISTANT_TESTER);
        $headers = $this->tenantHeaders($tenant);

        foreach (['/api/v1/admin/properties', '/api/v1/admin/projects', '/api/v1/admin/leads', '/api/v1/admin/payment-agreements',
            '/api/v1/admin/installments', '/api/v1/admin/visits', '/api/v1/admin/visit-requests', '/api/v1/admin/users',
            '/api/v1/admin/conversations-ai', '/api/v1/admin/assistant/widget', '/api/v1/admin/knowledge', '/api/v1/admin/web/projects',
            '/api/v1/admin/business-hours', '/api/v1/admin/commercial-statistics', '/api/v1/admin/notifications',
            '/api/v1/admin/integrations/whatsapp/config', '/api/v1/admin/assistant/usage'] as $url) {
            $this->actingAs($tester)->withHeaders($headers)->getJson($url)->assertForbidden();
        }
        $this->actingAs($tester)->withHeaders($headers)->postJson('/api/v1/admin/users', [])->assertForbidden();
        $this->actingAs($tester)->withHeaders($headers)->getJson('/api/v1/auth/me')->assertOk();
    }

    public function test_tester_of_another_tenant_sees_nothing(): void
    {
        $tenantA = $this->tenantWithWeb();
        $tenantB = $this->tenantWithWeb();
        $testerA = $this->user($tenantA, RoleCode::ASSISTANT_TESTER);
        $testerB = $this->user($tenantB, RoleCode::ASSISTANT_TESTER);
        [$sessionA, $conversationA] = $this->newSession($tenantA, $testerA, 'A');

        $this->actingAs($testerB)->withHeaders($this->tenantHeaders($tenantB))->getJson('/api/v1/admin/assistant/test-sessions')
            ->assertOk()->assertJsonCount(0, 'data');
        $this->actingAs($testerB)->withHeaders($this->tenantHeaders($tenantB))->getJson("/api/v1/admin/assistant/test-sessions/{$sessionA}")->assertNotFound();
        $this->actingAs($testerB)->withHeaders($this->tenantHeaders($tenantB))->getJson("/api/v1/admin/conversations/{$conversationA}/messages")->assertNotFound();
        $this->actingAs($testerB)->withHeaders($this->tenantHeaders($tenantB))->getJson('/api/v1/admin/conversations')->assertOk()->assertJsonCount(0, 'data');
        $this->actingAs($testerB)->withHeaders($this->tenantHeaders($tenantB))->getJson('/api/v1/admin/conversations?q=Prueba')->assertOk()->assertJsonCount(0, 'data');
        // A tester of B pointed at A's host is not a user of A.
        $status = $this->actingAs($testerB)->withHeaders($this->tenantHeaders($tenantA))->getJson("/api/v1/admin/assistant/test-sessions/{$sessionA}")->status();
        $this->assertContains($status, [401, 403, 404]);
    }

    public function test_admin_can_create_a_tester_without_price_access(): void
    {
        $tenant = $this->tenantWithWeb();
        $admin = $this->user($tenant, RoleCode::TENANT_ADMIN);

        $id = $this->actingAs($admin)->withHeaders($this->tenantHeaders($tenant))->postJson('/api/v1/admin/users', [
            'firstName' => 'Cliente', 'lastName' => 'Prueba', 'email' => 'tester@example.invalid', 'phone' => '+5493881234567', 'role' => 'ASSISTANT_TESTER',
        ])->assertCreated()->json('data.id');

        $user = DB::table('users')->where('tenant_id', $tenant->id)->where('public_id', $id)->first(['id', 'role_code']);
        $this->assertSame('ASSISTANT_TESTER', $user->role_code);
        $this->assertSame(0, (int) DB::table('user_inventory_settings')->where('tenant_id', $tenant->id)->where('user_id', $user->id)->value('can_view_prices'));

        // Moving an existing advisor to the tester role also drops price access.
        $advisor = $this->user($tenant, RoleCode::SALES_ADVISOR);
        $this->actingAs($admin)->withHeaders($this->tenantHeaders($tenant))
            ->patchJson("/api/v1/admin/users/{$advisor->public_id}/role", ['role' => 'ASSISTANT_TESTER'])->assertOk();
        $this->assertSame(0, (int) DB::table('user_inventory_settings')->where('tenant_id', $tenant->id)->where('user_id', $advisor->id)->value('can_view_prices'));
    }
}
