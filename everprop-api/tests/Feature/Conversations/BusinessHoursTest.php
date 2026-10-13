<?php

namespace Tests\Feature\Conversations;

use App\Console\Commands\ConversationKpis;
use App\Domain\Conversations\Services\BusinessHours;
use App\Domain\Conversations\Services\ConversationControl;
use App\Domain\CRM\Notifications\LeadAssignedNotification;
use App\Domain\Identity\Enums\RoleCode;
use App\Domain\Tenancy\Models\Tenant;
use App\Jobs\SendWebPush;
use Carbon\CarbonImmutable;
use GuzzleHttp\Psr7\Request;
use GuzzleHttp\Psr7\Response;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Queue;
use Illuminate\Support\Str;
use Minishlink\WebPush\MessageSentReport;
use Minishlink\WebPush\VAPID;
use Minishlink\WebPush\WebPush;
use Mockery\Expectation;
use Tests\TestCase;

/** EVP-L02: tenant business hours, the away notice for visitors and each advisor's out-of-hours push choice. */
final class BusinessHoursTest extends TestCase
{
    use ConversationTestSupport, DatabaseTransactions;

    /** Weekdays 9–18 and Saturday 9–13, tenant clock America/Argentina/Salta (UTC−3). */
    private const WEEK = ['mon' => [['09:00', '18:00']], 'tue' => [['09:00', '18:00']], 'wed' => [['09:00', '18:00']],
        'thu' => [['09:00', '18:00']], 'fri' => [['09:00', '18:00']], 'sat' => [['09:00', '13:00']], 'sun' => []];

    protected function setUp(): void
    {
        parent::setUp();
        config(['conversations.web_rate_limit_per_minute' => 10_000, 'conversations.ai_enabled' => false]);
    }

    /** @param array<string, mixed>|null $hours */
    private function tenant(?array $hours = self::WEEK, ?string $away = null): Tenant
    {
        return Tenant::factory()->create(['timezone' => 'America/Argentina/Salta',
            'settings_json' => $hours === null ? null : ['conversations' => ['business_hours' => $hours, 'away_message' => $away]]]);
    }

    private function at(string $localDateTime): void
    {
        $this->travelTo(CarbonImmutable::parse($localDateTime, 'America/Argentina/Salta'));
    }

    /** Opens a web chat and sends $messages visitor messages; returns the conversation id. */
    private function visitor(Tenant $tenant, int $messages = 1): int
    {
        $integration = (int) DB::table('integration_connections')->insertGetId([
            'tenant_id' => $tenant->id, 'public_id' => (string) Str::uuid(), 'provider' => 'WEB', 'name' => 'Web', 'status' => 'ACTIVE',
        ]);
        $widget = $this->webChannel($tenant->id, $integration);
        $token = (string) $this->withHeaders($this->tenantHeaders($tenant))
            ->postJson('/api/v1/public/chat/sessions', ['widget_id' => $widget['public_id']])->assertCreated()->json('data.token');
        for ($i = 0; $i < $messages; $i++) {
            $this->withToken($token)->postJson('/api/v1/public/chat/messages', ['client_message_id' => (string) Str::uuid(), 'text' => "Hola $i"])->assertCreated();
        }

        return (int) DB::table('conversations')->where('tenant_id', $tenant->id)->value('id');
    }

    /** @return list<string> */
    private function botTexts(int $conversationId): array
    {
        return DB::table('messages')->where('conversation_id', $conversationId)->where('direction', 'OUTBOUND')->where('sender_type', 'BOT')
            ->orderBy('sequence')->pluck('text_body')->all();
    }

    public function test_open_and_next_opening_follow_the_tenant_clock(): void
    {
        $tenant = $this->tenant();
        $hours = app(BusinessHours::class);

        $this->assertTrue($hours->isOpen($tenant->id, CarbonImmutable::parse('2026-10-12 09:00', 'America/Argentina/Salta')));
        $this->assertFalse($hours->isOpen($tenant->id, CarbonImmutable::parse('2026-10-12 18:00', 'America/Argentina/Salta')), 'the end is exclusive');
        // 20:30 UTC on Monday = 17:30 in Salta: open, whatever the server clock.
        $this->assertTrue($hours->isOpen($tenant->id, CarbonImmutable::parse('2026-10-12 20:30', 'UTC')));
        $this->assertFalse($hours->isOpen($tenant->id, CarbonImmutable::parse('2026-10-11 10:00', 'America/Argentina/Salta')), 'Sunday is closed');

        $next = $hours->nextOpening($tenant->id, CarbonImmutable::parse('2026-10-10 14:00', 'America/Argentina/Salta'));
        $this->assertSame('2026-10-12 09:00', $next?->format('Y-m-d H:i'), 'Saturday afternoon opens on Monday');
        $this->assertSame('lunes a viernes de 9:00 a 18:00 y sábado de 9:00 a 13:00', $hours->describe($tenant->id));
    }

    public function test_a_tenant_without_hours_is_always_open_and_never_sends_an_away_notice(): void
    {
        $tenant = $this->tenant(null);
        $this->at('2026-10-11 03:00'); // Sunday night

        $this->assertTrue(app(BusinessHours::class)->isOpen($tenant->id));
        $this->assertSame([], $this->botTexts($this->visitor($tenant)));
    }

    public function test_out_of_hours_the_visitor_gets_one_fixed_notice_per_wait(): void
    {
        $tenant = $this->tenant();
        $this->at('2026-10-10 14:00'); // Saturday after closing

        $conversation = $this->visitor($tenant, 2);

        $texts = $this->botTexts($conversation);
        $this->assertCount(1, $texts, 'a second message in the same wait gets no second notice');
        $this->assertSame('Gracias por escribirnos. Ahora estamos fuera del horario de atención (lunes a viernes de 9:00 a 18:00 y sábado de 9:00 a 13:00). '
            .'Un asesor te responde por este chat a partir del lunes a las 9:00.', $texts[0]);
        $job = DB::table('outbound_jobs')->where('conversation_id', $conversation)->first(['payload_json']);
        $this->assertTrue(json_decode((string) $job?->payload_json, true)['handoff_notice'] ?? false, 'sent as a notice, not as a bot reply');
        $this->assertSame('WAITING_HUMAN', DB::table('conversations')->where('id', $conversation)->value('control_state'));
    }

    public function test_in_hours_there_is_no_notice_and_the_tenant_text_wins_when_closed(): void
    {
        $open = $this->tenant();
        $this->at('2026-10-12 10:00');
        $this->assertSame([], $this->botTexts($this->visitor($open)));

        $custom = $this->tenant(self::WEEK, 'Hola, ya cerramos. Mañana te escribimos.');
        $this->at('2026-10-12 22:00');
        $this->assertSame(['Hola, ya cerramos. Mañana te escribimos.'], $this->botTexts($this->visitor($custom)));
    }

    public function test_the_admin_sets_the_hours_with_validation_and_audit_and_nobody_else_can(): void
    {
        [$a, $b] = [$this->tenant(null), $this->tenant(null)];
        $admin = $this->user($a, RoleCode::TENANT_ADMIN);
        $put = fn ($user, Tenant $host, array $body) => $this->actingAs($user)->withHeaders($this->tenantHeaders($host))->putJson('/api/v1/admin/business-hours', $body);

        $put($admin, $a, ['business_hours' => ['mon' => [['18:00', '09:00']]]])->assertStatus(422)->assertJsonPath('error.code', 'INVALID_SCHEDULE');
        $put($admin, $a, ['business_hours' => ['mon' => [['09:00', '13:00'], ['12:00', '18:00']]]])->assertStatus(422);
        $put($admin, $a, ['business_hours' => ['lunes' => [['09:00', '18:00']]]])->assertStatus(422);
        $put($admin, $a, ['business_hours' => self::WEEK, 'away_message' => '  Volvemos el lunes.  '])->assertOk()
            ->assertJsonPath('data.summary', 'lunes a viernes de 9:00 a 18:00 y sábado de 9:00 a 13:00')
            ->assertJsonPath('data.away_message', 'Volvemos el lunes.')->assertJsonPath('data.timezone', 'America/Argentina/Salta');

        $audit = DB::table('audit_logs')->where('tenant_id', $a->id)->where('action_code', 'CONVERSATIONS_BUSINESS_HOURS_UPDATED')->get();
        $this->assertCount(1, $audit, 'invalid attempts write nothing');
        $this->assertSame($admin->id, (int) $audit[0]->actor_user_id);
        $this->assertNull(app(BusinessHours::class)->settings($b->id)['schedule'], 'another tenant is untouched');

        foreach ([RoleCode::SALES_MANAGER, RoleCode::SALES_ADVISOR, RoleCode::READ_ONLY] as $role) {
            $put($this->user($a, $role), $a, ['business_hours' => null])->assertForbidden();
        }
        $put($admin, $b, ['business_hours' => self::WEEK])->assertNotFound();
        $this->assertNull(app(BusinessHours::class)->settings($b->id)['schedule']);

        // Clearing the hours means always open again.
        $put($admin, $a, ['business_hours' => null])->assertOk()->assertJsonPath('data.business_hours', null)->assertJsonPath('data.open_now', true);
    }

    public function test_each_device_chooses_whether_alerts_arrive_out_of_hours(): void
    {
        $keys = VAPID::createVapidKeys();
        config(['webpush.public_key' => $keys['publicKey'], 'webpush.private_key' => $keys['privateKey'], 'webpush.subject' => 'mailto:qa@example.invalid']);
        Queue::fake();
        $tenant = $this->tenant();
        $advisor = $this->user($tenant, RoleCode::SALES_ADVISOR);
        $device = fn (string $name) => ['endpoint' => "https://fcm.googleapis.com/fcm/send/$name", 'keys' => ['p256dh' => $keys['publicKey'], 'auth' => base64_encode(str_repeat('a', 16))]];
        foreach (['phone', 'desktop'] as $name) {
            $this->actingAs($advisor)->withHeaders($this->tenantHeaders($tenant))->postJson('/api/v1/admin/push/subscriptions', $device($name))->assertOk();
        }
        $this->actingAs($advisor)->withHeaders($this->tenantHeaders($tenant))
            ->putJson('/api/v1/admin/push/subscriptions/preferences', ['endpoint' => $device('phone')['endpoint'], 'out_of_hours' => false])->assertOk();
        $this->actingAs($advisor)->withHeaders($this->tenantHeaders($tenant))->getJson('/api/v1/admin/push/config')->assertOk()
            ->assertJsonPath('outOfHours.'.hash('sha256', $device('phone')['endpoint']), false)
            ->assertJsonPath('outOfHours.'.hash('sha256', $device('desktop')['endpoint']), true);
        // Another advisor cannot change this device.
        $this->actingAs($this->user($tenant, RoleCode::SALES_ADVISOR))->withHeaders($this->tenantHeaders($tenant))
            ->putJson('/api/v1/admin/push/subscriptions/preferences', ['endpoint' => $device('desktop')['endpoint'], 'out_of_hours' => false])->assertNotFound();

        $advisor->notify(new LeadAssignedNotification('qa-id', 'QA', 'LEAD_CREATED', 'QA', 'QA'));
        $notificationId = $advisor->notifications()->firstOrFail()->id;
        $delivered = [];
        $sender = \Mockery::mock(WebPush::class);
        /** @var Expectation $expectation */
        $expectation = $sender->shouldReceive('sendOneNotification');
        $expectation->andReturnUsing(function ($subscription) use (&$delivered) {
            $delivered[] = $subscription->getEndpoint();

            return new MessageSentReport(new Request('POST', $subscription->getEndpoint()), new Response(201), true);
        });
        $this->app->instance(WebPush::class, $sender);

        $this->at('2026-10-11 22:00'); // Sunday night: only the desktop still wants alerts
        (new SendWebPush($tenant->id, $advisor->id, $notificationId))->handle();
        $this->assertSame([$device('desktop')['endpoint']], $delivered);

        $delivered = [];
        $this->at('2026-10-12 10:00'); // in hours: both devices
        (new SendWebPush($tenant->id, $advisor->id, $notificationId))->handle();
        $this->assertEqualsCanonicalizing([$device('phone')['endpoint'], $device('desktop')['endpoint']], $delivered);
    }

    public function test_kpis_split_the_first_response_by_business_hours(): void
    {
        $tenant = $this->tenant();
        $this->at('2026-10-12 10:00');
        $this->visitor($tenant);
        $kpis = app(ConversationKpis::class)->compute($tenant->id, CarbonImmutable::parse('2026-10-12', 'UTC'), CarbonImmutable::parse('2026-10-13', 'UTC'));

        $this->assertSame(1, $kpis['by_channel']['WEB_CHAT']['by_business_hours']['in_hours']['conversations']);
        $this->assertSame(0, $kpis['by_channel']['WEB_CHAT']['by_business_hours']['out_of_hours']['conversations']);
    }

    public function test_an_advisor_taking_over_cancels_a_pending_notice_and_none_is_queued_while_they_have_it(): void
    {
        Queue::fake(); // keep the notice PENDING
        $tenant = $this->tenant();
        $this->at('2026-10-10 14:00');
        $conversation = $this->visitor($tenant);
        $job = DB::table('outbound_jobs')->where('conversation_id', $conversation)->where('idempotency_key', 'like', 'away:%')->first(['id']);
        $this->assertNotNull($job);

        app(ConversationControl::class)->takeover($tenant->id, $conversation, $this->user($tenant, RoleCode::SALES_ADVISOR));
        $this->assertSame('CANCELLED', DB::table('outbound_jobs')->where('id', $job->id)->value('status'), 'the epoch fence drops it');

        DB::table('conversations')->where('id', $conversation)->update(['control_state' => 'HUMAN_ACTIVE']);
        $this->assertNull(app(ConversationControl::class)->queueAwayNotice($tenant->id, $conversation, 'x', 'manual'));
    }

    public function test_reading_the_chat_does_not_repeat_the_notice_within_12_hours(): void
    {
        $tenant = $this->tenant();
        $this->at('2026-10-10 14:00');
        $conversation = $this->visitor($tenant);
        DB::table('conversations')->where('id', $conversation)->update(['unread_count' => 0]); // the assignee read it
        $this->assertNull(app(ConversationControl::class)->queueAwayNotice($tenant->id, $conversation, 'x', 'second'));

        $this->at('2026-10-11 03:00');
        $this->assertNotNull(app(ConversationControl::class)->queueAwayNotice($tenant->id, $conversation, 'x', 'third'), 'a new night, a new notice');
    }

    public function test_a_failing_notice_never_turns_the_stored_message_into_an_error(): void
    {
        $tenant = $this->tenant();
        // The away notice cannot even resolve its dependency (final classes cannot be mocked).
        $this->app->bind(BusinessHours::class, fn () => throw new \RuntimeException('down'));
        $this->at('2026-10-10 14:00');

        $conversation = $this->visitor($tenant); // asserts 201
        $this->assertSame(1, DB::table('messages')->where('conversation_id', $conversation)->where('direction', 'INBOUND')->count());
    }

    public function test_a_mistyped_timezone_falls_back_instead_of_breaking_alerts(): void
    {
        $tenant = $this->tenant();
        DB::table('tenants')->where('id', $tenant->id)->update(['timezone' => 'Invalid/Zone']);

        $hours = app(BusinessHours::class);
        $this->assertSame('America/Argentina/Salta', $hours->settings($tenant->id)['timezone']);
        $hours->isOpen($tenant->id); // no exception: it reads the hours in the fallback zone
    }

    public function test_hours_and_device_choices_stay_inside_their_tenant(): void
    {
        $keys = VAPID::createVapidKeys();
        config(['webpush.public_key' => $keys['publicKey'], 'webpush.private_key' => $keys['privateKey'], 'webpush.subject' => 'mailto:qa@example.invalid']);
        [$a, $b] = [$this->tenant(), $this->tenant()];
        foreach ([RoleCode::SALES_ADVISOR, RoleCode::READ_ONLY, RoleCode::ROTATOR] as $role) {
            $this->actingAs($this->user($a, $role))->withHeaders($this->tenantHeaders($a))->getJson('/api/v1/admin/business-hours')->assertForbidden();
        }
        $owner = $this->user($a, RoleCode::SALES_ADVISOR);
        $device = ['endpoint' => 'https://fcm.googleapis.com/fcm/send/shared', 'keys' => ['p256dh' => $keys['publicKey'], 'auth' => base64_encode(str_repeat('a', 16))]];
        $this->actingAs($owner)->withHeaders($this->tenantHeaders($a))->postJson('/api/v1/admin/push/subscriptions', $device)->assertOk();

        $this->actingAs($this->user($b, RoleCode::SALES_ADVISOR))->withHeaders($this->tenantHeaders($b))
            ->putJson('/api/v1/admin/push/subscriptions/preferences', ['endpoint' => $device['endpoint'], 'out_of_hours' => false])->assertNotFound();
        $this->assertSame(1, (int) DB::table('web_push_subscriptions')->where('tenant_id', $a->id)->value('out_of_hours'));
    }
}
