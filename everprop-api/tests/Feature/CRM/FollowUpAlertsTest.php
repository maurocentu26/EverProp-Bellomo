<?php

namespace Tests\Feature\CRM;

use App\Console\Commands\SendFollowUpAlerts;
use App\Domain\Identity\Enums\RoleCode;
use App\Domain\Tenancy\Models\Tenant;
use App\Jobs\SendWebPush;
use App\Models\User;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Tests\TestCase;

final class FollowUpAlertsTest extends TestCase
{
    use DatabaseTransactions;

    private int $stageId;

    private function lead(Tenant $tenant, ?User $advisor, int $daysQuiet, bool $open = true, string $name = 'Juan Pérez'): int
    {
        $this->stageId ??= DB::table('pipeline_stages')->insertGetId(['tenant_id' => $tenant->id, 'code' => 'NEW', 'name' => 'Nuevo', 'category' => 'OPEN', 'position' => 1]);
        $touch = now('UTC')->subDays($daysQuiet)->subMinutes(5);
        $contactId = DB::table('contacts')->insertGetId(['tenant_id' => $tenant->id, 'public_id' => (string) Str::uuid(),
            'display_name' => $name, 'first_seen_at' => $touch, 'last_seen_at' => $touch]);

        return DB::table('leads')->insertGetId([
            'tenant_id' => $tenant->id, 'public_id' => (string) Str::uuid(), 'contact_id' => $contactId, 'stage_id' => $this->stageId,
            'assigned_user_id' => $advisor?->id, 'source_channel' => 'WEB', 'source_kind' => 'FORM', 'title' => 'Consulta',
            'is_open' => $open ? 1 : 0, 'first_touch_at' => $touch, 'last_touch_at' => $touch, 'created_at' => $touch,
        ]);
    }

    private function followUp(Tenant $tenant, User $advisor, int $lead, string $type, int $daysAgo): void
    {
        DB::table('lead_follow_ups')->insert(['tenant_id' => $tenant->id, 'lead_id' => $lead, 'user_id' => $advisor->id,
            'public_id' => (string) Str::uuid(), 'type' => $type, 'occurred_at' => now('UTC')->subDays($daysAgo)->subMinute(),
            'summary' => 'Seguimiento', 'result' => 'Contactado', 'created_at' => now(), 'updated_at' => now()]);
    }

    /** @return list<string> */
    private function events(User $user): array
    {
        return $user->notifications()->get()->map(fn ($n) => (string) $n->data['event_type'])->sort()->values()->all();
    }

    private function runAlerts(): void
    {
        $this->artisan('everprop:leads:follow-up-alerts')->assertSuccessful();
    }

    public function test_each_lead_gets_only_its_highest_pending_level_once(): void
    {
        $tenant = Tenant::factory()->create();
        $advisor = User::factory()->for($tenant)->create(['role_code' => RoleCode::SALES_ADVISOR->value, 'last_active_at' => now()]);
        $this->lead($tenant, $advisor, 1);
        $this->lead($tenant, $advisor, 3);
        $this->lead($tenant, $advisor, 9);

        $this->runAlerts();
        $this->runAlerts();

        $this->assertSame(['FOLLOW_UP_DAY2', 'FOLLOW_UP_DAY8'], $this->events($advisor));
        $message = $advisor->notifications()->get()->firstWhere('data.event_type', 'FOLLOW_UP_DAY2')->data;
        $this->assertStringContainsString('Juan Pérez', $message['message']);
        $this->assertStringNotContainsString('Juan', $message['push_body']);
    }

    public function test_new_contact_restarts_the_cycle_and_closed_or_old_leads_are_ignored(): void
    {
        $tenant = Tenant::factory()->create();
        $advisor = User::factory()->for($tenant)->create(['role_code' => RoleCode::SALES_ADVISOR->value, 'last_active_at' => now()]);
        $lead = $this->lead($tenant, $advisor, 2);
        $this->lead($tenant, $advisor, 6, open: false);
        $this->lead($tenant, $advisor, 40);
        $this->lead($tenant, null, 6);

        $this->runAlerts();
        $this->assertSame(['FOLLOW_UP_DAY2'], $this->events($advisor));

        // A client writing again moves last_touch_at but is not a follow-up: no new cycle.
        DB::table('leads')->where('id', $lead)->update(['last_touch_at' => now('UTC')]);
        $this->runAlerts();
        $this->assertCount(1, $this->events($advisor));

        // A logged call restarts the cycle; a note does not.
        $this->followUp($tenant, $advisor, $lead, 'note', 0);
        $this->runAlerts();
        $this->assertCount(1, $this->events($advisor));
        $this->followUp($tenant, $advisor, $lead, 'call', 3);
        $this->runAlerts();
        $this->assertCount(2, $this->events($advisor));
    }

    public function test_many_alerts_become_one_summary_and_managers_get_a_team_digest(): void
    {
        $tenant = Tenant::factory()->create();
        $advisor = User::factory()->for($tenant)->create(['role_code' => RoleCode::SALES_ADVISOR->value, 'display_name' => 'Ana', 'last_active_at' => now()]);
        $manager = User::factory()->for($tenant)->create(['role_code' => RoleCode::SALES_MANAGER->value]);
        foreach ([2, 3, 8, 10] as $days) {
            $this->lead($tenant, $advisor, $days);
        }

        $this->runAlerts();
        $this->runAlerts();

        $this->assertSame(['FOLLOW_UP_SUMMARY'], $this->events($advisor));
        $this->assertSame(['FOLLOW_UP_TEAM'], $this->events($manager));
        $this->assertStringContainsString('Ana: 1 por vencer y 1 vencido', $manager->notifications()->first()->data['message']);
    }

    public function test_alerts_never_cross_tenants(): void
    {
        $tenant = Tenant::factory()->create();
        $other = Tenant::factory()->create();
        $advisor = User::factory()->for($tenant)->create(['role_code' => RoleCode::SALES_ADVISOR->value, 'last_active_at' => now()]);
        $foreignManager = User::factory()->for($other)->create(['role_code' => RoleCode::SALES_MANAGER->value]);
        $lead = $this->lead($tenant, $advisor, 9);
        // A follow-up row of another tenant pointing at this lead id must not count as its contact.
        $foreignAdvisor = User::factory()->for($other)->create(['role_code' => RoleCode::SALES_ADVISOR->value]);
        $this->followUp($other, $foreignAdvisor, $lead, 'call', 0);

        $this->runAlerts();

        $this->assertSame(['FOLLOW_UP_DAY8'], $this->events($advisor));
        $this->assertSame([], $this->events($foreignManager));
    }

    public function test_inactive_advisor_gets_one_warm_nudge_per_day_only_during_the_day(): void
    {
        $tenant = Tenant::factory()->create(['timezone' => 'America/Argentina/Salta']);
        $night = CarbonImmutable::now('America/Argentina/Salta')->setTime(23, 0);
        $morning = $night->addHours(12);
        $this->travelTo($night);
        $away = User::factory()->for($tenant)->create(['role_code' => RoleCode::SALES_ADVISOR->value, 'last_active_at' => $morning->subDays(2)->subHour()->utc()]);
        $active = User::factory()->for($tenant)->create(['role_code' => RoleCode::SALES_ADVISOR->value, 'last_active_at' => $night->utc()]);
        $gone = User::factory()->for($tenant)->create(['role_code' => RoleCode::SALES_ADVISOR->value, 'last_active_at' => $morning->subDays(9)->utc()]);
        foreach ([$away, $active, $gone] as $user) {
            $this->lead($tenant, $user, 0);
        }

        $this->runAlerts();
        $this->assertSame([], $this->events($away));

        $this->travelTo($morning);
        $this->runAlerts();
        $this->runAlerts();

        $this->assertSame(['REENGAGE'], $this->events($away));
        $this->assertSame([], $this->events($active));
        $this->assertSame([], $this->events($gone));
        $this->assertSame('Tu seguimiento se está enfriando', $away->notifications()->first()->data['title']);
    }

    public function test_panel_use_updates_last_active_at_at_most_hourly(): void
    {
        $tenant = Tenant::factory()->create();
        $advisor = User::factory()->for($tenant)->create(['role_code' => RoleCode::SALES_ADVISOR->value, 'last_active_at' => now('UTC')->subDays(3)]);

        $this->actingAs($advisor)->withHeaders(['X-Everprop-Tenant' => $tenant->public_id, 'Origin' => 'http://localhost:5173'])
            ->getJson('/api/v1/auth/me')->assertOk();

        $this->assertTrue(CarbonImmutable::parse(DB::table('users')->where('id', $advisor->id)->value('last_active_at'))->greaterThan(now()->subMinute()));
    }

    public function test_push_payload_never_carries_client_data_or_foreign_links(): void
    {
        $payload = (new SendWebPush(1, 1, 'n'))->payload('Bellomo', 'n', ['event_type' => 'FOLLOW_UP_DAY5', 'lead_id' => 'abc',
            'push_body' => 'Van 5 días sin seguimiento con un lead.', 'action_url' => '/admin/leads/abc']);
        $this->assertSame(['title' => 'Bellomo', 'body' => 'Van 5 días sin seguimiento con un lead.', 'tag' => 'follow-up-abc', 'url' => '/admin/leads/abc'], $payload);
        $this->assertSame('/admin/notifications', (new SendWebPush(1, 1, 'n'))->payload('B', 'n', ['event_type' => 'REENGAGE',
            'push_body' => 'x', 'action_url' => 'https://evil.example'])['url']);

        $this->assertSame(['Te espera 1 lead', 'Retomá donde lo dejaste. Son un par de minutos y tus clientes lo notan.'], SendFollowUpAlerts::nudgeCopy(1, 1));
    }
}
