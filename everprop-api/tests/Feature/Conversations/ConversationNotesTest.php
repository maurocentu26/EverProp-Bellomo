<?php

namespace Tests\Feature\Conversations;

use App\Domain\Identity\Enums\RoleCode;
use App\Domain\Tenancy\Models\Tenant;
use App\Models\User;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Http\Response;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Illuminate\Testing\TestResponse;
use Tests\TestCase;

/** S04 internal notes: team-only, idempotent, never reach the visitor, the provider or the inbox order. */
final class ConversationNotesTest extends TestCase
{
    use ConversationTestSupport, DatabaseTransactions;

    protected function setUp(): void
    {
        parent::setUp();
        config(['conversations.web_rate_limit_per_minute' => 10_000, 'conversations.ai_enabled' => false]);
    }

    /** @return array{tenant: Tenant, conversation: string, token: string} */
    private function webConversation(): array
    {
        ['tenant' => $tenant, 'integration' => $integration] = $this->tenantWithIntegration('WEB');
        $widget = $this->webChannel($tenant->id, $integration);
        $token = (string) $this->withHeaders($this->tenantHeaders($tenant))
            ->postJson('/api/v1/public/chat/sessions', ['widget_id' => $widget['public_id']])->json('data.token');
        $this->withToken($token)->postJson('/api/v1/public/chat/messages', ['client_message_id' => (string) Str::uuid(), 'text' => 'Hola'])->assertCreated();

        return ['tenant' => $tenant, 'conversation' => (string) DB::table('conversations')->where('tenant_id', $tenant->id)->value('public_id'), 'token' => $token];
    }

    /** @return TestResponse<Response> */
    private function note(User $user, Tenant $tenant, string $conversation, string $text, string $key = 'note-key-0000000001'): TestResponse
    {
        return $this->actingAs($user)->withHeaders($this->tenantHeaders($tenant))
            ->postJson("/api/v1/admin/conversations/$conversation/notes", ['text' => $text, 'idempotency_key' => $key]);
    }

    public function test_the_team_sees_the_note_and_the_visitor_never_does(): void
    {
        ['tenant' => $tenant, 'conversation' => $conversation, 'token' => $token] = $this->webConversation();
        $manager = $this->user($tenant, RoleCode::SALES_MANAGER);
        $before = DB::table('conversations')->where('public_id', $conversation)->first(['last_activity_at', 'unread_count']);

        $this->note($manager, $tenant, $conversation, 'Ojo: ya consultó por el lote 12B')->assertCreated()->assertJsonPath('data.sequence', 2);
        $this->note($manager, $tenant, $conversation, 'Ojo: ya consultó por el lote 12B')->assertOk()->assertJsonPath('data.replayed', true);
        $this->note($manager, $tenant, $conversation, 'otro texto')->assertStatus(409)->assertJsonPath('error.code', 'IDEMPOTENCY_CONFLICT');

        $this->actingAs($manager)->withHeaders($this->tenantHeaders($tenant))->getJson("/api/v1/admin/conversations/$conversation/messages")
            ->assertOk()->assertJsonPath('data.1.direction', 'INTERNAL')->assertJsonPath('data.1.author', $manager->display_name);
        $this->actingAs($manager)->withHeaders($this->tenantHeaders($tenant))->getJson('/api/v1/admin/conversations')
            ->assertOk()->assertJsonPath('data.0.last_message.text', 'Hola');
        $this->withToken($token)->getJson('/api/v1/public/chat/messages')->assertOk()->assertJsonCount(1, 'data')
            ->assertJsonMissing(['text' => 'Ojo: ya consultó por el lote 12B'])->assertJsonPath('next_after', 1);
        $this->assertSame(0, DB::table('outbound_jobs')->where('tenant_id', $tenant->id)->count(), 'a note is never sent');
        $this->assertEquals($before, DB::table('conversations')->where('public_id', $conversation)->first(['last_activity_at', 'unread_count']));
        // The visitor's next message keeps the thread's sequence intact.
        $this->withToken($token)->postJson('/api/v1/public/chat/messages', ['client_message_id' => (string) Str::uuid(), 'text' => 'Sigo acá'])->assertCreated();
        $this->assertDatabaseHas('messages', ['text_body' => 'Sigo acá', 'sequence' => 3]);
    }

    public function test_only_people_who_can_write_on_a_visible_conversation_add_notes(): void
    {
        ['tenant' => $tenant, 'conversation' => $conversation] = $this->webConversation();
        $advisor = $this->user($tenant, RoleCode::SALES_ADVISOR);
        DB::table('conversations')->where('public_id', $conversation)->update(['control_state' => 'HUMAN_ACTIVE', 'assigned_user_id' => $this->user($tenant, RoleCode::SALES_ADVISOR)->id]);
        ['tenant' => $other] = $this->tenantWithIntegration('WEB');

        $this->note($this->user($tenant, RoleCode::READ_ONLY), $tenant, $conversation, 'x')->assertForbidden();
        $this->note($advisor, $tenant, $conversation, 'x')->assertNotFound(); // assigned to someone else
        $this->note($this->user($other, RoleCode::TENANT_ADMIN), $other, $conversation, 'x')->assertNotFound();
        $this->assertDatabaseMissing('messages', ['direction' => 'INTERNAL']);
    }
}
