<?php

namespace Tests\Feature;

use App\Domain\Tenancy\Models\Tenant;
use Illuminate\Console\Scheduling\Schedule;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Tests\TestCase;

/** EVP-148: the outbox stays bounded without losing recent idempotency keys or anything in flight. */
final class PruneDomainOutboxTest extends TestCase
{
    use DatabaseTransactions;

    public function test_old_settled_events_are_pruned_and_recent_or_in_flight_ones_stay(): void
    {
        $tenants = [Tenant::factory()->create()->id, Tenant::factory()->create()->id];
        $event = function (int $tenant, int $daysAgo, string $status) {
            $at = now('UTC')->subDays($daysAgo)->format('Y-m-d H:i:s.v');

            return DB::table('domain_outbox')->insertGetId(['tenant_id' => $tenant, 'aggregate_type' => 'CONVERSATION', 'aggregate_id' => 1,
                'event_type' => 'QA', 'idempotency_key' => 'evp148:'.Str::uuid(), 'payload_json' => '{}', 'status' => $status,
                'available_at' => $at, 'created_at' => $at]);
        };
        $gone = [$event($tenants[0], 40, 'PENDING'), $event($tenants[1], 31, 'PUBLISHED'), $event($tenants[0], 90, 'DEAD_LETTER')];
        $kept = [$event($tenants[0], 29, 'PENDING'), $event($tenants[1], 1, 'PENDING'), $event($tenants[0], 40, 'PROCESSING'), $event($tenants[1], 40, 'RETRY')];

        // Inserted last with the highest ids, so they sit below the old rows' boundary: the date must still protect them.
        $kept[] = $event($tenants[1], 2, 'PENDING');

        $this->artisan('everprop:outbox:prune')->expectsOutputToContain('older than 30 days.')->assertSuccessful();

        $this->assertSame(0, DB::table('domain_outbox')->whereIn('id', $gone)->count());
        $this->assertSame(count($kept), DB::table('domain_outbox')->whereIn('id', $kept)->count());
        $this->artisan('everprop:outbox:prune')->expectsOutputToContain('Deleted 0')->assertSuccessful(); // idempotent
    }

    public function test_a_retention_that_would_reopen_idempotency_windows_is_refused_and_the_job_is_scheduled(): void
    {
        $this->artisan('everprop:outbox:prune --days=3')->assertFailed();
        config(['conversations.outbox_retention_days' => 6]);
        $this->artisan('everprop:outbox:prune')->assertFailed();

        $scheduled = collect(app(Schedule::class)->events())->contains(fn ($e) => str_contains((string) $e->command, 'everprop:outbox:prune'));
        $this->assertTrue($scheduled, 'the prune runs daily');
    }
}
