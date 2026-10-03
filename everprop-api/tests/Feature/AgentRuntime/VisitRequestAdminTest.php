<?php

namespace Tests\Feature\AgentRuntime;

use App\Domain\AgentRuntime\Jobs\RunAgentJob;
use App\Domain\Identity\Enums\RoleCode;
use App\Domain\Tenancy\Models\Tenant;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Queue;
use Illuminate\Support\Str;
use Tests\Feature\Conversations\ConversationTestSupport;
use Tests\TestCase;

/** S13: only a human turns a REQUESTED visit into a SCHEDULED one. */
final class VisitRequestAdminTest extends TestCase
{
    use ConversationTestSupport, DatabaseTransactions;

    protected function setUp(): void
    {
        parent::setUp();
        config(['conversations.web_rate_limit_per_minute' => 10_000, 'conversations.ai_enabled' => false]);
        Queue::fake([RunAgentJob::class]);
    }

    public function test_confirm_creates_one_scheduled_visit_and_scopes_are_enforced(): void
    {
        [$tenant, $requestId, $conversationId] = $this->request();
        $manager = $this->user($tenant, RoleCode::SALES_MANAGER);
        $advisor = $this->user($tenant, RoleCode::SALES_ADVISOR);
        $otherAdvisor = $this->user($tenant, RoleCode::SALES_ADVISOR);
        $readOnly = $this->user($tenant, RoleCode::READ_ONLY);
        ['tenant' => $other] = $this->tenantWithIntegration();
        $outsider = $this->user($other, RoleCode::TENANT_ADMIN);
        $when = now()->addDays(2)->setTime(13, 0)->toIso8601String();
        $h = $this->tenantHeaders($tenant);

        $this->actingAs($advisor)->withHeaders($h)->getJson('/api/v1/admin/visit-requests')->assertOk()->assertJsonPath('data.0.id', $requestId)
            ->assertJsonPath('data.0.contact.phone', '+5493885550000');
        DB::table('conversations')->where('id', $conversationId)->update(['assigned_user_id' => $otherAdvisor->id]);
        $this->actingAs($advisor)->withHeaders($h)->getJson('/api/v1/admin/visit-requests')->assertOk()->assertJsonCount(0, 'data');
        $this->actingAs($advisor)->withHeaders($h)->postJson("/api/v1/admin/visit-requests/$requestId/confirm", ['scheduled_at' => $when])->assertNotFound();
        $this->actingAs($readOnly)->withHeaders($h)->postJson("/api/v1/admin/visit-requests/$requestId/confirm", ['scheduled_at' => $when])->assertForbidden();
        $this->actingAs($outsider)->withHeaders($this->tenantHeaders($other))->postJson("/api/v1/admin/visit-requests/$requestId/confirm", ['scheduled_at' => $when])->assertNotFound();

        $first = $this->actingAs($manager)->withHeaders($h)->postJson("/api/v1/admin/visit-requests/$requestId/confirm", ['scheduled_at' => $when])->assertOk();
        $again = $this->actingAs($manager)->withHeaders($h)->postJson("/api/v1/admin/visit-requests/$requestId/confirm", ['scheduled_at' => $when])->assertOk();
        $this->assertSame($first->json('data.visit_id'), $again->json('data.visit_id'));
        $this->assertSame(1, DB::table('visits')->where('tenant_id', $tenant->id)->where('status', 'SCHEDULED')->count());
        $this->assertSame('+5493885550000', DB::table('visits')->where('tenant_id', $tenant->id)->value('guest_phone'));
        $this->actingAs($manager)->withHeaders($h)->postJson("/api/v1/admin/visit-requests/$requestId/decline")->assertStatus(409);
    }

    public function test_provisioning_command_creates_the_widget_once_and_updates_origins(): void
    {
        $tenant = Tenant::factory()->create();

        $this->artisan('everprop:channels:web-chat', ['--tenant' => $tenant->slug, '--panel-origin' => ['https://panel.example']])->assertSuccessful();
        $this->artisan('everprop:channels:web-chat', ['--tenant' => $tenant->slug, '--panel-origin' => ['https://panel.example', 'https://www.panel.example'], '--site' => ['https://bellomo.example']])
            ->expectsOutputToContain("EVERSYS_WIDGET_FRAME_ANCESTORS=\"'self' https://bellomo.example\"")->assertSuccessful();
        $this->artisan('everprop:channels:web-chat', ['--tenant' => $tenant->slug, '--panel-origin' => ['https://bad.example/path']])->assertFailed();

        $channels = DB::table('channel_accounts')->where('tenant_id', $tenant->id)->where('channel_type', 'WEB_CHAT')->get();
        $this->assertCount(1, $channels);
        $this->assertSame(['https://panel.example', 'https://www.panel.example'], json_decode($channels[0]->metadata_json, true)['allowed_origins']);
    }

    /** @return array{0: Tenant, 1: string, 2: int} */
    private function request(): array
    {
        ['tenant' => $tenant, 'integration' => $integration] = $this->tenantWithIntegration('WEB');
        $channel = $this->webChannel($tenant->id, $integration);
        $token = $this->withHeaders($this->tenantHeaders($tenant))->postJson('/api/v1/public/chat/sessions', ['widget_id' => $channel['public_id']])->json('data.token');
        $this->withHeaders($this->tenantHeaders($tenant))->withToken($token)
            ->postJson('/api/v1/public/chat/messages', ['client_message_id' => (string) Str::uuid(), 'text' => 'Quiero visitar'])->assertCreated();
        $this->flushHeaders();
        $conversation = DB::table('conversations')->where('tenant_id', $tenant->id)->first(['id', 'contact_id']);
        DB::table('contacts')->where('id', $conversation->contact_id)->update(['phone_e164' => '+5493885550000', 'display_name' => 'Ana']);
        $propertyId = (int) DB::table('properties')->insertGetId(['tenant_id' => $tenant->id, 'public_id' => (string) Str::uuid(), 'code' => 'L-1',
            'title' => 'Lote 1', 'operation' => 'SALE', 'category' => 'LOT', 'city' => 'Jujuy', 'province' => 'Jujuy']);
        $publicId = (string) Str::uuid();
        DB::table('visit_requests')->insert(['tenant_id' => $tenant->id, 'public_id' => $publicId, 'conversation_id' => $conversation->id,
            'contact_id' => $conversation->contact_id, 'property_id' => $propertyId, 'status' => 'REQUESTED',
            'preferred_slots_json' => json_encode([['start_utc' => now()->addDay()->toIso8601String(), 'end_utc' => now()->addDay()->addHour()->toIso8601String(), 'timezone' => 'America/Argentina/Jujuy']])]);

        return [$tenant, $publicId, (int) $conversation->id];
    }
}
