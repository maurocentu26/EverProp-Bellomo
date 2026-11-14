<?php

namespace Tests\Feature\CRM;

use App\Domain\Identity\Enums\RoleCode;
use App\Domain\Tenancy\Models\Tenant;
use App\Models\User;
use Illuminate\Http\Response;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Illuminate\Testing\TestResponse;
use Tests\Feature\Conversations\ConversationTestSupport;
use Tests\TestCase;

/**
 * EVP-124: deleting a lead frees the contact's open slot, so the same person can come back (201, new lead),
 * and cancels its pending visits. Commits (no DatabaseTransactions): the lead procedure refuses to run inside one.
 */
final class DeletedLeadReentryTest extends TestCase
{
    use ConversationTestSupport;

    /** @var list<int> */
    private array $tenants = [];

    protected function tearDown(): void
    {
        $this->deleteSyntheticTenants($this->tenants);
        parent::tearDown();
    }

    public function test_the_same_contact_can_come_back_after_its_lead_is_deleted(): void
    {
        $tenant = Tenant::factory()->create();
        $this->tenants[] = (int) $tenant->id;
        DB::table('pipeline_stages')->insert(['tenant_id' => $tenant->id, 'code' => 'NEW', 'name' => 'New', 'category' => 'OPEN', 'position' => 1, 'is_active' => true]);
        $admin = User::factory()->for($tenant)->create(['role_code' => RoleCode::TENANT_ADMIN->value]);
        $advisor = User::factory()->for($tenant)->create(['role_code' => RoleCode::SALES_ADVISOR->value]);

        $first = $this->submit($tenant, 'evp124-first')->assertCreated()->json('data.lead_id');
        $lead = DB::table('leads')->where('tenant_id', $tenant->id)->where('public_id', $first)->first();
        $visit = fn (string $status) => DB::table('visits')->insertGetId(['tenant_id' => $tenant->id, 'public_id' => (string) Str::uuid(),
            'lead_id' => $lead->id, 'scheduled_at' => now()->addDay(), 'status' => $status]);
        $pending = $visit('SCHEDULED');
        $done = $visit('COMPLETED');

        $this->as($advisor, $tenant)->deleteJson("/api/v1/admin/leads/$first")->assertForbidden();
        $this->as($admin, $tenant)->deleteJson("/api/v1/admin/leads/$first")->assertOk();
        $this->as($admin, $tenant)->deleteJson("/api/v1/admin/leads/$first")->assertNotFound();

        $deleted = DB::table('leads')->where('id', $lead->id)->first();
        $this->assertNotNull($deleted->deleted_at);
        $this->assertSame(0, (int) $deleted->is_open);
        $this->assertSame('CANCELLED', DB::table('visits')->where('id', $pending)->value('status'));
        $this->assertNotNull(DB::table('visits')->where('id', $pending)->value('cancelled_at'));
        $this->assertSame('COMPLETED', DB::table('visits')->where('id', $done)->value('status'));
        $audit = DB::table('audit_logs')->where('tenant_id', $tenant->id)->where('action_code', 'LEAD_DELETED')->sole();
        $this->assertSame([(int) $admin->id, 'LEAD', (int) $lead->id], [(int) $audit->actor_user_id, $audit->entity_type, (int) $audit->entity_id]);
        $this->assertSame(1, json_decode($audit->after_json, true)['cancelled_visits']);

        $second = $this->submit($tenant, 'evp124-second')->assertCreated()->json('data.lead_id');
        $this->assertNotSame($first, $second);
        $this->assertSame((int) $lead->contact_id, (int) DB::table('leads')->where('public_id', $second)->value('contact_id'));
        $this->assertSame(1, DB::table('leads')->where('tenant_id', $tenant->id)->where('is_open', 1)->whereNull('deleted_at')->count());
    }

    public function test_an_admin_cannot_delete_another_tenants_lead(): void
    {
        [$a, $b] = [$this->tenant(), $this->tenant()];
        $adminB = User::factory()->for($b)->create(['role_code' => RoleCode::TENANT_ADMIN->value]);
        [$leadA, $publicA] = $this->lead($a, deleted: false);
        $visitA = $this->visit($a, $leadA, '+1 day');

        $this->as($adminB, $b)->deleteJson("/api/v1/admin/leads/$publicA")->assertNotFound();

        $row = DB::table('leads')->where('id', $leadA)->first();
        $this->assertNull($row->deleted_at);
        $this->assertSame(1, (int) $row->is_open);
        $this->assertSame('SCHEDULED', DB::table('visits')->where('id', $visitA)->value('status'));
        $this->assertSame(0, DB::table('audit_logs')->whereIn('tenant_id', [$a->id, $b->id])->count());
    }

    /** The forward repairs only rows still broken, in their own tenant, audits first and is re-runnable. */
    public function test_the_forward_closes_deleted_open_leads_only_and_is_rerunnable(): void
    {
        [$a, $b] = [$this->tenant(), $this->tenant()];
        [$leadA] = $this->lead($a, deleted: true);
        $upcoming = $this->visit($a, $leadA, '+1 day');
        $kept = $this->visit($a, $leadA, '+2 days', outcome: 'Nota previa');
        $past = $this->visit($a, $leadA, '-1 day');
        [$leadB] = $this->lead($b, deleted: false);
        $visitB = $this->visit($b, $leadB, '+1 day');
        $script = (string) file_get_contents(base_path('database/schema/forward/2026-11-14.001_close_deleted_open_leads.sql'));

        DB::unprepared($script);
        $state = fn () => [
            DB::table('leads')->whereIn('id', [$leadA, $leadB])->orderBy('id')->pluck('is_open')->map(fn ($v) => (int) $v)->all(),
            DB::table('visits')->whereIn('id', [$upcoming, $kept, $past, $visitB])->orderBy('id')->pluck('status')->all(),
            DB::table('audit_logs')->whereIn('tenant_id', [$a->id, $b->id])->orderBy('id')->get(['tenant_id', 'entity_type', 'entity_id', 'metadata_json'])
                ->map(fn ($r) => [(int) $r->tenant_id, $r->entity_type, (int) $r->entity_id, json_decode($r->metadata_json, true)['lead_id'] ?? null])->all(),
        ];
        $expected = [
            [0, 1],
            ['CANCELLED', 'CANCELLED', 'SCHEDULED', 'SCHEDULED'],
            [[(int) $a->id, 'LEAD', $leadA, null], [(int) $a->id, 'VISIT', $upcoming, $leadA], [(int) $a->id, 'VISIT', $kept, $leadA]],
        ];
        $this->assertSame($expected, $state());
        $this->assertSame('Cancelada: se eliminó el lead.', DB::table('visits')->where('id', $upcoming)->value('outcome'));
        $this->assertSame('Nota previa', DB::table('visits')->where('id', $kept)->value('outcome'));

        DB::unprepared($script);
        $this->assertSame($expected, $state());
    }

    private function tenant(): Tenant
    {
        $tenant = Tenant::factory()->create();
        $this->tenants[] = (int) $tenant->id;
        DB::table('pipeline_stages')->insert(['tenant_id' => $tenant->id, 'code' => 'NEW', 'name' => 'New', 'category' => 'OPEN', 'position' => 1, 'is_active' => true]);

        return $tenant;
    }

    /**
     * Same email in every tenant; a deleted lead keeps is_open = 1 as it did before the fix.
     *
     * @return array{int, string}
     */
    private function lead(Tenant $tenant, bool $deleted): array
    {
        $contact = DB::table('contacts')->insertGetId(['tenant_id' => $tenant->id, 'public_id' => (string) Str::uuid(),
            'display_name' => 'Mismo email', 'email' => 'evp124-shared@example.test', 'first_seen_at' => now(), 'last_seen_at' => now()]);
        $publicId = (string) Str::uuid();
        $id = (int) DB::table('leads')->insertGetId(['tenant_id' => $tenant->id, 'public_id' => $publicId, 'contact_id' => $contact,
            'stage_id' => DB::table('pipeline_stages')->where('tenant_id', $tenant->id)->value('id'), 'source_channel' => 'WEB_FORM',
            'source_kind' => 'CONTACT_FORM', 'title' => 'EVP-124', 'first_touch_at' => now(), 'last_touch_at' => now(),
            'deleted_at' => $deleted ? now() : null]);

        return [$id, $publicId];
    }

    private function visit(Tenant $tenant, int $leadId, string $when, ?string $outcome = null): int
    {
        return (int) DB::table('visits')->insertGetId(['tenant_id' => $tenant->id, 'public_id' => (string) Str::uuid(),
            'lead_id' => $leadId, 'scheduled_at' => now('UTC')->modify($when), 'status' => 'SCHEDULED', 'outcome' => $outcome]);
    }

    /** @return TestResponse<Response> */
    private function submit(Tenant $tenant, string $key): TestResponse
    {
        return $this->withHeaders(['X-Everprop-Tenant' => $tenant->public_id, 'Idempotency-Key' => $key.'-'.Str::random(8)])
            ->postJson('/api/v1/public/leads', [
                'contact' => ['display_name' => 'Reingreso', 'email' => 'evp124@example.test', 'locale' => 'es-AR'],
                'identity' => ['channel_type' => 'EMAIL', 'provider_user_id' => 'evp124@example.test'],
                'consent' => ['purpose_code' => 'COMMERCIAL_CONTACT', 'status' => 'GRANTED', 'legal_text_version' => 'test-v1'],
                'lead' => ['source_channel' => 'WEB_FORM', 'source_kind' => 'CONTACT_FORM', 'priority' => 'NORMAL'],
                'touchpoint' => ['type' => 'WEB_FORM', 'summary' => 'EVP-124'],
            ]);
    }

    private function as(User $user, Tenant $tenant): self
    {
        return $this->actingAs($user)->withHeaders(['X-Everprop-Tenant' => $tenant->public_id, 'Origin' => 'http://localhost:5173']);
    }
}
