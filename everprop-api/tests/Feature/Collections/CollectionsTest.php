<?php

namespace Tests\Feature\Collections;

use App\Domain\Identity\Enums\RoleCode;
use App\Domain\Tenancy\Models\Tenant;
use App\Models\User;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Tests\TestCase;

final class CollectionsTest extends TestCase
{
    use DatabaseTransactions;

    /** @return array{Tenant, User, string} */
    private function identity(RoleCode $role = RoleCode::TENANT_ADMIN): array
    {
        self::assertSame('mysql', DB::connection()->getDriverName(), 'Collections contract requires MySQL.');
        $tenant = Tenant::factory()->create();
        $user = User::factory()->for($tenant)->create(['role_code' => $role->value]);
        $contact = DB::table('contacts')->insertGetId([
            'tenant_id' => $tenant->id, 'public_id' => (string) Str::uuid(), 'display_name' => 'Collections client',
            'first_seen_at' => now(), 'last_seen_at' => now(),
        ]);
        $stage = DB::table('pipeline_stages')->insertGetId([
            'tenant_id' => $tenant->id, 'code' => 'NEW', 'name' => 'New', 'category' => 'OPEN', 'position' => 1,
        ]);
        $lead = (string) Str::uuid();
        DB::table('leads')->insert([
            'tenant_id' => $tenant->id, 'public_id' => $lead, 'contact_id' => $contact, 'stage_id' => $stage,
            'assigned_user_id' => $user->id, 'source_channel' => 'WEB_FORM', 'source_kind' => 'CONTACT_FORM',
            'title' => 'Collections test', 'first_touch_at' => now(), 'last_touch_at' => now(),
        ]);

        return [$tenant, $user, $lead];
    }

    /** @return array<string, mixed> */
    private function payload(string $lead): array
    {
        return ['leadId' => $lead, 'currency' => 'ARS', 'modality' => 'FIXED', 'totalPrice' => '100.00',
            'downPayment' => '0.00', 'monthlyRatePct' => '0', 'totalInstallments' => 1,
            'dayOfMonthDue' => 31, 'startDate' => '2026-01-31', 'idempotencyKey' => (string) Str::uuid()];
    }

    private function login(Tenant $tenant, User $user): void
    {
        $this->actingAs($user)->withHeaders(['X-Everprop-Tenant' => $tenant->public_id, 'Origin' => 'http://localhost:5173']);
    }

    public function test_partial_payments_retries_overpayment_completion_and_reversal(): void
    {
        [$tenant, $user, $lead] = $this->identity();
        $this->login($tenant, $user);
        $payload = $this->payload($lead);
        $agreement = $this->postJson('/api/v1/admin/payment-agreements', $payload)->assertCreated()->json('data.id');
        $this->postJson('/api/v1/admin/payment-agreements', $payload)->assertCreated()->assertJsonPath('data.id', $agreement);
        $this->postJson('/api/v1/admin/payment-agreements', array_replace($payload, ['totalPrice' => '200.00']))->assertConflict();
        $installment = $this->getJson('/api/v1/admin/installments')->assertOk()->json('data.0.id');
        $payment = ['amountPaid' => '40.00', 'paymentMethod' => 'TRANSFER', 'paymentReceiptNumber' => 'REAL-001',
            'paidAt' => '2026-02-01', 'idempotencyKey' => (string) Str::uuid()];
        $endpoint = '/api/v1/admin/installments/'.$installment.'/payments';
        $paymentId = $this->postJson($endpoint, $payment)->assertCreated()->json('data.0.id');
        $this->postJson($endpoint, $payment)->assertCreated()->assertJsonCount(1, 'data');
        $this->getJson('/api/v1/admin/installments')->assertOk()->assertJsonPath('data.0.amountRemaining', 60);
        $this->postJson($endpoint, array_replace($payment, ['amountPaid' => '41.00']))->assertConflict();
        $this->postJson($endpoint, array_replace($payment, ['amountPaid' => '61.00', 'idempotencyKey' => (string) Str::uuid()]))->assertUnprocessable();
        $this->postJson($endpoint, array_replace($payment, ['amountPaid' => '60.00', 'idempotencyKey' => (string) Str::uuid()]))->assertCreated();
        $this->getJson('/api/v1/admin/payment-agreements/'.$agreement)->assertOk()->assertJsonPath('data.status', 'COMPLETED');
        $this->postJson('/api/v1/admin/payments/'.$paymentId.'/reverse', ['reason' => 'Incorrect receipt'])->assertOk();
        $this->postJson('/api/v1/admin/payments/'.$paymentId.'/reverse', ['reason' => 'Repeat reversal'])->assertOk();
        $this->getJson('/api/v1/admin/installments')->assertOk()->assertJsonPath('data.0.amountRemaining', 40);
        $this->getJson('/api/v1/admin/payment-agreements/'.$agreement)->assertJsonPath('data.status', 'ACTIVE');
        $this->getJson($endpoint)->assertJsonCount(2, 'data');
    }

    public function test_cross_tenant_ids_and_client_tenant_are_rejected(): void
    {
        [$tenantA, $userA, $leadA] = $this->identity();
        [$tenantB, $userB, $leadB] = $this->identity();
        $this->login($tenantB, $userB);
        $agreement = $this->postJson('/api/v1/admin/payment-agreements', $this->payload($leadB))->assertCreated()->json('data.id');
        $installment = $this->getJson('/api/v1/admin/installments')->json('data.0.id');
        $this->login($tenantA, $userA);
        $this->getJson('/api/v1/admin/payment-agreements')->assertJsonCount(0, 'data');
        $this->getJson('/api/v1/admin/payment-agreements/'.$agreement)->assertNotFound();
        $this->getJson('/api/v1/admin/installments/'.$installment.'/payments')->assertNotFound();
        $this->postJson('/api/v1/admin/installments/'.$installment.'/payments', [
            'amountPaid' => '1.00', 'paymentMethod' => 'CASH', 'paymentReceiptNumber' => 'X',
            'paidAt' => '2026-02-01', 'idempotencyKey' => (string) Str::uuid(),
        ])->assertNotFound();
        $this->postJson('/api/v1/admin/payment-agreements', $this->payload($leadB))->assertNotFound();
        $this->postJson('/api/v1/admin/payment-agreements', $this->payload($leadA) + ['tenant_id' => $tenantB->id])->assertUnprocessable();
    }

    public function test_advisors_are_scoped_and_read_only_users_cannot_write(): void
    {
        [$tenant, $admin, $lead] = $this->identity();
        $this->login($tenant, $admin);
        $agreement = $this->postJson('/api/v1/admin/payment-agreements', $this->payload($lead))->assertCreated()->json('data.id');
        $advisor = User::factory()->for($tenant)->create(['role_code' => RoleCode::SALES_ADVISOR->value]);
        $this->login($tenant, $advisor);
        $this->getJson('/api/v1/admin/payment-agreements')->assertJsonCount(0, 'data');
        $this->getJson('/api/v1/admin/payment-agreements/'.$agreement)->assertNotFound();
        $this->postJson('/api/v1/admin/payment-agreements', $this->payload($lead))->assertNotFound();
        $viewer = User::factory()->for($tenant)->create(['role_code' => RoleCode::READ_ONLY->value]);
        $this->login($tenant, $viewer);
        $this->getJson('/api/v1/admin/payment-agreements')->assertJsonCount(1, 'data');
        $this->postJson('/api/v1/admin/payment-agreements', $this->payload($lead))->assertForbidden();
    }

    public function test_notifications_are_deduplicated_and_stop_after_payment(): void
    {
        [$tenant, $admin, $lead] = $this->identity();
        $this->login($tenant, $admin);
        $this->postJson('/api/v1/admin/payment-agreements', $this->payload($lead))->assertCreated();
        $this->artisan('everprop:collections:notify', ['tenant' => $tenant->slug])->assertSuccessful();
        $this->artisan('everprop:collections:notify', ['tenant' => $tenant->slug])->assertSuccessful();
        self::assertSame(1, DB::table('notifications')->where('notifiable_id', $admin->id)->count());
        $installment = $this->getJson('/api/v1/admin/installments')->json('data.0.id');
        $this->postJson('/api/v1/admin/installments/'.$installment.'/payments', [
            'amountPaid' => '100.00', 'paymentMethod' => 'CASH', 'paymentReceiptNumber' => 'X',
            'paidAt' => '2026-02-01', 'idempotencyKey' => (string) Str::uuid(),
        ])->assertCreated();
        DB::table('notifications')->where('notifiable_id', $admin->id)->delete();
        $this->artisan('everprop:collections:notify', ['tenant' => $tenant->slug])->assertSuccessful();
        self::assertSame(0, DB::table('notifications')->where('notifiable_id', $admin->id)->count());
    }

    public function test_import_previews_then_commits_once_and_rejects_schedule_mismatches(): void
    {
        [$tenant, $admin, $lead] = $this->identity();
        $file = storage_path('app/private/collections-import-'.Str::uuid().'.json');
        $document = [
            'approvedAgreementIds' => ['legacy-agreement'], 'leadMap' => ['legacy-lead' => $lead],
            'agreements' => [array_replace($this->payload('legacy-lead'), ['id' => 'legacy-agreement', 'status' => 'ACTIVE'])],
            'installments' => [[
                'agreementId' => 'legacy-agreement', 'installmentNumber' => 1, 'dueDate' => '2026-02-28',
                'amountExpected' => '100.00', 'amountPaid' => '40.00', 'paymentMethod' => 'CASH',
                'paymentReceiptNumber' => 'IMPORTED-001', 'paidAt' => '2026-02-01', 'status' => 'PARTIALLY_PAID',
            ]],
        ];
        file_put_contents($file, json_encode($document, JSON_THROW_ON_ERROR));
        $arguments = ['tenant' => $tenant->slug, 'file' => $file, 'admin' => $admin->public_id];
        try {
            $this->artisan('everprop:collections:import', $arguments)->assertSuccessful();
            self::assertSame(0, DB::table('payment_agreements')->where('tenant_id', $tenant->id)->count());
            $this->artisan('everprop:collections:import', $arguments + ['--apply' => true])->assertSuccessful();
            $this->artisan('everprop:collections:import', $arguments + ['--apply' => true])->assertSuccessful();
            self::assertSame(1, DB::table('payment_agreements')->where('tenant_id', $tenant->id)->count());
            self::assertSame(1, DB::table('installment_payments')->where('tenant_id', $tenant->id)->count());
            $document['installments'][0]['amountExpected'] = '101.00';
            file_put_contents($file, json_encode($document, JSON_THROW_ON_ERROR));
            $this->artisan('everprop:collections:import', $arguments + ['--apply' => true])->assertFailed();
            self::assertSame(1, DB::table('installment_payments')->where('tenant_id', $tenant->id)->count());
        } finally {
            unlink($file);
        }
    }
}
