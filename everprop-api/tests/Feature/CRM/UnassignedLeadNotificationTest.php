<?php

namespace Tests\Feature\CRM;

use App\Domain\Conversations\Services\ConversationControl;
use App\Domain\CRM\Notifications\LeadAssignedNotification;
use App\Domain\Identity\Enums\RoleCode;
use App\Domain\Tenancy\Models\Tenant;
use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Notification;
use Illuminate\Support\Str;
use Tests\Feature\Conversations\ConversationTestSupport;
use Tests\TestCase;

/**
 * EVP-136: a new lead nobody follows (manual, web with an empty rotation, chatbot) told nobody.
 * Committed rows (the web form runs sp_create_or_get_open_lead, which refuses an open transaction), cleaned up after.
 */
final class UnassignedLeadNotificationTest extends TestCase
{
    use ConversationTestSupport;

    private Tenant $tenant;

    private int $integrationId;

    private User $admin;

    private User $manager;

    private User $advisor;

    private User $disabledAdmin;

    protected function setUp(): void
    {
        parent::setUp();
        Notification::fake();
        ['tenant' => $this->tenant, 'integration' => $this->integrationId] = $this->tenantWithIntegration('WEB');
        $this->admin = $this->user($this->tenant, RoleCode::TENANT_ADMIN);
        $this->manager = $this->user($this->tenant, RoleCode::SALES_MANAGER);
        $this->advisor = $this->user($this->tenant, RoleCode::SALES_ADVISOR);
        $this->disabledAdmin = User::factory()->for($this->tenant)->disabled()->create(['role_code' => RoleCode::TENANT_ADMIN->value]);
        DB::table('pipeline_stages')->insert(['tenant_id' => $this->tenant->id, 'code' => 'NEW', 'name' => 'Nuevo', 'category' => 'OPEN', 'position' => 1, 'is_active' => true]);
        $this->withHeaders(['X-Everprop-Tenant' => $this->tenant->public_id, 'Origin' => 'http://localhost:5173']);
    }

    protected function tearDown(): void
    {
        $this->deleteSyntheticTenants([(int) $this->tenant->id]);
        parent::tearDown();
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
        $id = $this->actingAs($this->admin)->postJson('/api/v1/admin/leads', ['name' => 'Laura Gómez'])->assertCreated()->json('data.id');

        $this->assertManagersToldOnce($id, "/admin/leads/{$id}");
    }

    public function test_an_assigned_manual_lead_only_tells_its_advisor(): void
    {
        $this->actingAs($this->admin)->postJson('/api/v1/admin/leads', ['name' => 'Laura Gómez', 'agent_id' => $this->advisor->public_id])->assertCreated();

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

    public function test_a_chatbot_lead_without_advisor_tells_admins_and_managers_with_the_conversation_link(): void
    {
        $now = now();
        $contactId = (int) DB::table('contacts')->insertGetId(['tenant_id' => $this->tenant->id, 'public_id' => (string) Str::uuid(), 'display_name' => 'Visitante Web',
            'first_seen_at' => $now, 'last_seen_at' => $now, 'created_at' => $now, 'updated_at' => $now]);
        $channel = $this->webChannel((int) $this->tenant->id, $this->integrationId);
        $conversationPublicId = (string) Str::uuid();
        $conversationId = (int) DB::table('conversations')->insertGetId(['tenant_id' => $this->tenant->id, 'public_id' => $conversationPublicId, 'contact_id' => $contactId,
            'channel_account_id' => $channel['id'], 'provider_thread_id' => 'web:'.$conversationPublicId, 'status' => 'OPEN', 'bot_mode' => 'BOT_FIRST',
            'control_state' => 'AI_ACTIVE', 'control_epoch' => 1, 'next_sequence' => 1, 'last_activity_at' => $now]);
        $leadPublicId = (string) Str::uuid();
        $stageId = (int) DB::table('pipeline_stages')->where('tenant_id', $this->tenant->id)->value('id');
        $leadId = (int) DB::table('leads')->insertGetId(['tenant_id' => $this->tenant->id, 'public_id' => $leadPublicId, 'contact_id' => $contactId, 'stage_id' => $stageId,
            'source_channel' => 'WEB_CHAT', 'source_kind' => 'CHATBOT', 'title' => 'Consulta por asistente', 'priority' => 'NORMAL', 'is_open' => true, 'assignment_method' => 'UNASSIGNED', 'first_touch_at' => $now, 'last_touch_at' => $now,
            'created_at' => $now, 'updated_at' => $now]);

        $control = app(ConversationControl::class);
        $this->assertNull($control->assignLead((int) $this->tenant->id, $conversationId, ['lead_id' => $leadId, 'assigned_user_id' => null, 'created' => false]));
        Notification::assertNothingSent();

        $this->assertNull($control->assignLead((int) $this->tenant->id, $conversationId, ['lead_id' => $leadId, 'assigned_user_id' => null, 'created' => true]));
        $this->assertManagersToldOnce($leadPublicId, "/admin/conversaciones?c={$conversationPublicId}");
    }
}
