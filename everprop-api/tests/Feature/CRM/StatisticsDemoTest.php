<?php

namespace Tests\Feature\CRM;

use App\Domain\Identity\Enums\RoleCode;
use App\Domain\Tenancy\Models\Tenant;
use App\Models\User;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\Notification;
use Illuminate\Support\Facades\Queue;
use Illuminate\Support\Str;
use Tests\TestCase;

final class StatisticsDemoTest extends TestCase
{
    use DatabaseTransactions;

    public function test_simulation_requires_local_mysql_and_existing_inventory_and_is_idempotent(): void
    {
        $this->artisan('everprop:statistics-demo', ['--tenant' => 'missing'])->assertFailed();
        Queue::fake();
        Mail::fake();
        Notification::fake();
        $this->app->instance('env', 'local');
        $tenant = Tenant::factory()->create();
        User::factory()->for($tenant)->create(['role_code' => RoleCode::SALES_ADVISOR->value]);
        $this->artisan('everprop:statistics-demo', ['--tenant' => $tenant->slug])->assertFailed();
        DB::table('properties')->insert(['tenant_id' => $tenant->id, 'public_id' => (string) Str::uuid(), 'code' => 'REAL-TEST', 'title' => 'Existing property', 'operation' => 'SALE', 'category' => 'LOT', 'status' => 'AVAILABLE', 'city' => 'Test', 'province' => 'Test']);
        $this->artisan('everprop:statistics-demo', ['--tenant' => $tenant->slug])->assertSuccessful();
        $this->artisan('everprop:statistics-demo', ['--tenant' => $tenant->slug])->assertSuccessful();
        $this->assertSame(1500, DB::table('leads')->where('tenant_id', $tenant->id)->where('source_kind', 'EVP52_SIMULATION_V1')->count());
        $this->assertSame(1500, DB::table('conversations')->where('tenant_id', $tenant->id)->count());
        $this->assertSame(450, DB::table('conversations')->where('tenant_id', $tenant->id)->where('status', 'RESOLVED')->count());
        $this->assertSame(1, DB::table('properties')->where('tenant_id', $tenant->id)->count());
        $this->assertSame(1500, DB::table('lead_properties')->where('tenant_id', $tenant->id)->count());
        $admin = User::factory()->for($tenant)->create(['role_code' => RoleCode::TENANT_ADMIN->value]);
        $from = now('America/Argentina/Buenos_Aires')->subDays(100)->toDateString();
        $to = now('America/Argentina/Buenos_Aires')->toDateString();
        $response = $this->actingAs($admin)->withHeaders(['X-Everprop-Tenant' => $tenant->public_id, 'Origin' => 'http://localhost:5173'])
            ->getJson('/api/v1/admin/commercial-statistics?from='.$from.'&to='.$to)->assertOk()
            ->assertJsonPath('data.has_simulated_data', true)->assertJsonPath('data.total.leads', 1500)->assertJsonPath('data.total.simulated_leads', 1500)->assertJsonPath('data.total.won', 300)->assertJsonPath('data.total.lost', 150)
            ->assertJsonPath('data.total.active', 1050)->assertJsonPath('data.total.answered', 1200)->assertJsonPath('data.total.resolved', 450);
        $this->assertSame(1500, array_sum(array_column($response->json('data.series'), 'leads')));
        $this->assertSame(300, array_sum(array_column($response->json('data.series'), 'period_won')));
        Queue::assertNothingPushed();
        Mail::assertNothingSent();
        Notification::assertNothingSent();
    }
}
