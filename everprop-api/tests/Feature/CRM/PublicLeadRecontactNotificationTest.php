<?php

namespace Tests\Feature\CRM;

use App\Domain\Identity\Enums\RoleCode;
use App\Domain\Tenancy\Models\Tenant;
use App\Models\User;
use Illuminate\Http\Response;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Illuminate\Testing\TestResponse;
use Tests\TestCase;

/**
 * EVP-140: the first web form of a contact tells its advisor "new lead"; the same contact writing again while its
 * lead is still open tells the advisor about a new inquiry, not about a new lead. Commits: the lead procedure
 * refuses to run inside a transaction.
 */
final class PublicLeadRecontactNotificationTest extends TestCase
{
    /** @var list<int> */
    private array $tenants = [];

    protected function tearDown(): void
    {
        $this->deleteSyntheticTenants($this->tenants);
        parent::tearDown();
    }

    /**
     * Same cleanup as DeletedLeadReentryTest: main has no ConversationTestSupport (EVP-174).
     *
     * @param  list<int>  $tenantIds
     */
    private function deleteSyntheticTenants(array $tenantIds): void
    {
        if ($tenantIds === []) {
            return;
        }
        $tables = DB::table('information_schema.COLUMNS')->where('COLUMNS.TABLE_SCHEMA', DB::getDatabaseName())
            ->where('COLUMNS.COLUMN_NAME', 'tenant_id')->join('information_schema.TABLES as t', fn ($j) => $j
            ->on('t.TABLE_NAME', '=', 'COLUMNS.TABLE_NAME')->on('t.TABLE_SCHEMA', '=', 'COLUMNS.TABLE_SCHEMA'))
            ->where('t.TABLE_TYPE', 'BASE TABLE')->pluck('COLUMNS.TABLE_NAME');
        DB::statement('SET FOREIGN_KEY_CHECKS=0');
        foreach ($tables as $table) {
            DB::table($table)->whereIn('tenant_id', $tenantIds)->delete();
        }
        DB::table('tenants')->whereIn('id', $tenantIds)->delete();
        DB::statement('SET FOREIGN_KEY_CHECKS=1');
    }

    public function test_a_resubmitted_form_notifies_a_new_inquiry_not_a_new_lead(): void
    {
        $tenant = Tenant::factory()->create();
        $this->tenants[] = (int) $tenant->id;
        DB::table('pipeline_stages')->insert(['tenant_id' => $tenant->id, 'code' => 'NEW', 'name' => 'New', 'category' => 'OPEN', 'position' => 1, 'is_active' => true]);
        $advisor = User::factory()->for($tenant)->create(['role_code' => RoleCode::SALES_ADVISOR->value]);
        $pool = DB::table('assignment_pools')->insertGetId(['tenant_id' => $tenant->id, 'name' => 'Default Pool',
            'purpose_code' => 'NEW_LEADS', 'strategy' => 'ROUND_ROBIN', 'is_default' => 1, 'status' => 'ACTIVE']);
        DB::table('assignment_pool_members')->insert(['tenant_id' => $tenant->id, 'pool_id' => $pool, 'user_id' => $advisor->id, 'position' => 1, 'status' => 'ACTIVE']);

        $first = $this->submit($tenant)->assertCreated()->assertJsonPath('data.lead_created', true)->json('data.lead_id');
        $again = $this->submit($tenant)->assertCreated()->assertJsonPath('data.lead_created', false)->json('data.lead_id');
        $this->assertSame($first, $again);

        // Both rows can share the same created_at second, so the order comes from the event type, not the clock.
        $sent = $advisor->notifications()->get()->mapWithKeys(fn ($n) => [$n->data['event_type'] => $n->data])->all();
        $this->assertEqualsCanonicalizing(['LEAD_CREATED', 'LEAD_RECONTACT'], array_keys($sent));
        $this->assertSame('Nuevo lead web asignado', $sent['LEAD_CREATED']['title']);
        $this->assertSame('Nueva consulta web de un lead', $sent['LEAD_RECONTACT']['title']);
        $this->assertStringContainsString('volvió a escribir', $sent['LEAD_RECONTACT']['message']);
        $this->assertSame("/admin/leads/$first", $sent['LEAD_RECONTACT']['action_url']);
    }

    /** @return TestResponse<Response> */
    private function submit(Tenant $tenant): TestResponse
    {
        return $this->withHeaders(['X-Everprop-Tenant' => $tenant->public_id, 'Idempotency-Key' => 'evp140-'.Str::random(12)])
            ->postJson('/api/v1/public/leads', [
                'contact' => ['display_name' => 'Recontacto', 'email' => 'evp140@example.test', 'locale' => 'es-AR'],
                'identity' => ['channel_type' => 'EMAIL', 'provider_user_id' => 'evp140@example.test'],
                'consent' => ['purpose_code' => 'COMMERCIAL_CONTACT', 'status' => 'GRANTED', 'legal_text_version' => 'test-v1'],
                'lead' => ['source_channel' => 'WEB_FORM', 'source_kind' => 'CONTACT_FORM', 'priority' => 'NORMAL'],
                'touchpoint' => ['type' => 'WEB_FORM', 'summary' => 'EVP-140'],
            ]);
    }
}
