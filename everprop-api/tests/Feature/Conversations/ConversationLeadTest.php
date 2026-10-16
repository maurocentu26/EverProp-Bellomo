<?php

namespace Tests\Feature\Conversations;

use App\Domain\Identity\Enums\RoleCode;
use App\Domain\Tenancy\Models\Tenant;
use App\Models\User;
use Illuminate\Http\Response;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Illuminate\Testing\TestResponse;
use Tests\TestCase;

/**
 * From a conversation to its lead: one open lead per contact (same procedure as the assistant), assigned to the
 * advisor who opens it when nobody has it. Commits (the lead procedure refuses transactions); tenants removed after.
 */
final class ConversationLeadTest extends TestCase
{
    use ConversationTestSupport;

    /** @var list<int> */
    private array $tenants = [];

    protected function setUp(): void
    {
        parent::setUp();
        config(['conversations.web_rate_limit_per_minute' => 10_000, 'conversations.ai_enabled' => false]);
    }

    protected function tearDown(): void
    {
        $this->deleteSyntheticTenants($this->tenants);
        parent::tearDown();
    }

    /** @return array{tenant: Tenant, conversation: string} */
    private function conversation(): array
    {
        ['tenant' => $tenant, 'integration' => $integration] = $this->tenantWithIntegration('WEB');
        $this->tenants[] = (int) $tenant->id;
        DB::table('pipeline_stages')->insert(['tenant_id' => $tenant->id, 'code' => 'NEW', 'name' => 'New', 'category' => 'OPEN', 'position' => 1, 'is_active' => true]);
        $widget = $this->webChannel($tenant->id, $integration);
        $token = (string) $this->withHeaders($this->tenantHeaders($tenant))
            ->postJson('/api/v1/public/chat/sessions', ['widget_id' => $widget['public_id']])->json('data.token');
        $this->withToken($token)->postJson('/api/v1/public/chat/messages', ['client_message_id' => (string) Str::uuid(), 'text' => 'Hola, me interesa un lote'])->assertCreated();
        $this->flushHeaders();

        return ['tenant' => $tenant, 'conversation' => (string) DB::table('conversations')->where('tenant_id', $tenant->id)->value('public_id')];
    }

    /** @return TestResponse<Response> */
    private function openLead(User $user, Tenant $tenant, string $conversation): TestResponse
    {
        return $this->actingAs($user)->withHeaders($this->tenantHeaders($tenant))->postJson("/api/v1/admin/conversations/$conversation/lead");
    }

    public function test_one_open_lead_per_conversation_contact_assigned_to_the_advisor_who_opens_it(): void
    {
        ['tenant' => $tenant, 'conversation' => $conversation] = $this->conversation();
        $advisor = $this->user($tenant, RoleCode::SALES_ADVISOR);
        // From the shared queue the advisor must take the conversation first: nothing is created or assigned.
        $this->openLead($advisor, $tenant, $conversation)->assertStatus(409)->assertJsonPath('error.code', 'NOT_IN_CONTROL');
        $this->assertSame(0, DB::table('leads')->where('tenant_id', $tenant->id)->count());
        DB::table('conversations')->where('public_id', $conversation)->update(['control_state' => 'HUMAN_ACTIVE',
            'assigned_user_id' => $advisor->id, 'controlled_by_user_id' => $advisor->id]);

        $first = $this->openLead($advisor, $tenant, $conversation)->assertCreated()->assertJsonPath('data.created', true)->json('data.lead_id');
        $this->openLead($advisor, $tenant, $conversation)->assertOk()->assertJsonPath('data.lead_id', $first)->assertJsonPath('data.created', false);

        $lead = DB::table('leads')->where('tenant_id', $tenant->id)->sole();
        $contact = DB::table('conversations')->where('tenant_id', $tenant->id)->value('contact_id');
        $this->assertSame([$first, (int) $contact, (int) $advisor->id], [$lead->public_id, (int) $lead->contact_id, (int) $lead->assigned_user_id]);
        // The advisor can open the lead page it was sent to.
        $this->actingAs($advisor)->withHeaders($this->tenantHeaders($tenant))->getJson("/api/v1/admin/leads/$first")->assertOk();
    }

    public function test_a_lead_another_advisor_follows_is_never_taken(): void
    {
        ['tenant' => $tenant, 'conversation' => $conversation] = $this->conversation();
        $manager = $this->user($tenant, RoleCode::SALES_MANAGER);
        $lead = $this->openLead($manager, $tenant, $conversation)->assertCreated()->json('data.lead_id');
        $other = $this->user($tenant, RoleCode::SALES_ADVISOR);
        DB::table('leads')->where('public_id', $lead)->update(['assigned_user_id' => $other->id]);
        $advisor = $this->user($tenant, RoleCode::SALES_ADVISOR);
        DB::table('conversations')->where('public_id', $conversation)->update(['control_state' => 'HUMAN_ACTIVE',
            'assigned_user_id' => $advisor->id, 'controlled_by_user_id' => $advisor->id]);

        $this->openLead($advisor, $tenant, $conversation)->assertStatus(409)
            ->assertJsonPath('error.code', 'LEAD_OF_ANOTHER_ADVISOR')->assertJsonMissingPath('data');
        $this->assertSame((int) $other->id, (int) DB::table('leads')->where('public_id', $lead)->value('assigned_user_id'));
        $this->openLead($manager, $tenant, $conversation)->assertOk()->assertJsonPath('data.lead_id', $lead); // managers see it
    }

    public function test_only_writers_who_see_the_conversation_can_open_its_lead(): void
    {
        ['tenant' => $tenant, 'conversation' => $conversation] = $this->conversation();
        DB::table('conversations')->where('public_id', $conversation)->update(['control_state' => 'HUMAN_ACTIVE',
            'assigned_user_id' => $this->user($tenant, RoleCode::SALES_ADVISOR)->id]);
        ['tenant' => $other] = $this->tenantWithIntegration('WEB');
        $this->tenants[] = (int) $other->id;

        $this->openLead($this->user($tenant, RoleCode::READ_ONLY), $tenant, $conversation)->assertForbidden();
        $this->openLead($this->user($tenant, RoleCode::SALES_ADVISOR), $tenant, $conversation)->assertNotFound(); // someone else's
        $this->openLead($this->user($other, RoleCode::TENANT_ADMIN), $other, $conversation)->assertNotFound();
        $this->assertSame(0, DB::table('leads')->whereIn('tenant_id', [$tenant->id, $other->id])->count());
    }
}
