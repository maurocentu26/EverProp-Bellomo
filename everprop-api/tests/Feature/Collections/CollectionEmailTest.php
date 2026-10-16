<?php

namespace Tests\Feature\Collections;

use App\Domain\Identity\Enums\RoleCode;
use App\Domain\Tenancy\Models\Tenant;
use App\Models\User;
use Carbon\CarbonImmutable;
use Illuminate\Database\QueryException;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Mail\Message;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Str;
use Mockery;
use Mockery\Expectation;
use Symfony\Component\Mime\Email;
use Tests\TestCase;

final class CollectionEmailTest extends TestCase
{
    use DatabaseTransactions;

    /** @return array{Tenant, User, string} */
    private function fixture(): array
    {
        self::assertSame('mysql', DB::connection()->getDriverName());
        self::assertStringContainsString('test', DB::connection()->getDatabaseName());
        $tenant = Tenant::factory()->create();
        $user = User::factory()->for($tenant)->create(['role_code' => RoleCode::TENANT_ADMIN->value]);
        $contact = DB::table('contacts')->insertGetId([
            'tenant_id' => $tenant->id, 'public_id' => (string) Str::uuid(), 'display_name' => 'Cliente de prueba',
            'email' => 'client@example.test', 'first_seen_at' => now(), 'last_seen_at' => now(),
        ]);
        $stage = DB::table('pipeline_stages')->insertGetId([
            'tenant_id' => $tenant->id, 'code' => 'NEW', 'name' => 'New', 'category' => 'OPEN', 'position' => 1,
        ]);
        $lead = (string) Str::uuid();
        DB::table('leads')->insert([
            'tenant_id' => $tenant->id, 'public_id' => $lead, 'contact_id' => $contact, 'stage_id' => $stage,
            'assigned_user_id' => $user->id, 'source_channel' => 'WEB_FORM', 'source_kind' => 'CONTACT_FORM',
            'title' => 'Mail test', 'first_touch_at' => now(), 'last_touch_at' => now(),
        ]);
        $this->login($tenant, $user);
        $this->postJson('/api/v1/admin/payment-agreements', [
            'leadId' => $lead, 'currency' => 'ARS', 'modality' => 'FIXED', 'totalPrice' => '100.00',
            'downPayment' => '0.00', 'totalInstallments' => 1, 'dayOfMonthDue' => 10,
            'startDate' => '2026-01-01', 'idempotencyKey' => (string) Str::uuid(),
        ])->assertCreated();
        $installment = $this->getJson('/api/v1/admin/installments')->json('data.0.id');

        return [$tenant, $user, $installment];
    }

    private function login(Tenant $tenant, User $user): void
    {
        $this->actingAs($user)->withHeaders(['X-Everprop-Tenant' => $tenant->public_id, 'Origin' => 'http://localhost:5173']);
    }

    private function provision(Tenant $tenant): void
    {
        config(['collections_mail.enabled' => true, 'collections_mail.tenant' => $tenant->slug,
            'collections_mail.from_address' => 'billing@example.test', 'collections_mail.reply_to' => 'billing@example.test',
            'mail.mailers.collections.host' => 'smtp.example.test',
            'collections_mail.payment_instructions' => 'Transferencia al alias BELLOMO.PRUEBA',
            'collections_mail.upcoming_days' => 5, 'collections_mail.upcoming_hour' => 9]);
    }

    public function test_billing_export_preserves_payment_history_and_denies_advisors_and_other_tenants(): void
    {
        [$tenant, $admin, $id] = $this->fixture();
        $payment = $this->postJson("/api/v1/admin/installments/{$id}/payments", [
            'amountPaid' => '40.00', 'paymentMethod' => 'CASH', 'paymentReceiptNumber' => '=TEST-REFERENCE',
            'paidAt' => '2026-02-01', 'idempotencyKey' => (string) Str::uuid(),
        ])->assertCreated()->json('data.0.id');
        $url = '/api/v1/admin/collections/billing-export?paidFrom=2026-02-01&paidTo=2026-02-28';
        $this->getJson($url)->assertOk()->assertJsonCount(1, 'data')->assertJsonPath('data.0.amount', '40.00')
            ->assertJsonPath('data.0.currency', 'ARS')->assertJsonPath('data.0.status', 'RECORDED')
            ->assertJsonPath('data.0.receiptReference', '=TEST-REFERENCE')->assertHeader('Cache-Control', 'no-store, private');
        $this->postJson('/api/v1/admin/payments/'.$payment.'/reverse', ['reason' => 'Wrong reference'])->assertOk();
        $this->getJson($url)->assertJsonPath('data.0.status', 'REVERSED')->assertJsonPath('data.0.reversalReason', 'Wrong reference');
        $this->getJson('/api/v1/admin/collections/billing-export?paidFrom=2026-03-01&paidTo=2026-03-31')->assertJsonCount(0, 'data');
        $this->getJson('/api/v1/admin/collections/billing-export?paidFrom=2026-03-01&paidTo=2026-02-01')->assertUnprocessable();
        $this->getJson($url.'&tenant_id=123')->assertUnprocessable();
        $this->login($tenant, User::factory()->for($tenant)->create(['role_code' => RoleCode::SALES_ADVISOR->value]));
        $this->getJson($url)->assertForbidden();
        $this->login($tenant, User::factory()->for($tenant)->create(['role_code' => RoleCode::READ_ONLY->value]));
        $this->getJson($url)->assertForbidden();
        $other = Tenant::factory()->create();
        $this->login($other, User::factory()->for($other)->create(['role_code' => RoleCode::TENANT_ADMIN->value]));
        $this->getJson($url)->assertOk()->assertJsonCount(0, 'data');
    }

    public function test_preview_is_read_only_uses_remaining_balance_and_obeys_roles_and_tenants(): void
    {
        Mail::shouldReceive('mailer')->never();
        [$tenant, $admin, $id] = $this->fixture();
        $url = "/api/v1/admin/installments/{$id}/email-preview";
        $this->postJson("/api/v1/admin/installments/{$id}/payments", [
            'amountPaid' => '40.00', 'paymentMethod' => 'CASH', 'paymentReceiptNumber' => 'TEST',
            'paidAt' => '2026-02-01', 'idempotencyKey' => (string) Str::uuid(),
        ])->assertCreated();
        $this->getJson($url)->assertOk()->assertJsonPath('data.amountRemaining', '60.00')
            ->assertJsonPath('data.eligible', true)->assertHeader('Cache-Control', 'no-store, private');
        $this->login($tenant, User::factory()->for($tenant)->create(['role_code' => RoleCode::SALES_ADVISOR->value]));
        $this->getJson($url)->assertNotFound();
        DB::table('leads')->where('tenant_id', $tenant->id)->update(['assigned_user_id' => auth()->id()]);
        $this->getJson($url)->assertOk();
        $this->login($tenant, User::factory()->for($tenant)->create(['role_code' => RoleCode::READ_ONLY->value]));
        $this->getJson($url)->assertForbidden();
        $other = Tenant::factory()->create();
        $this->login($other, User::factory()->for($other)->create(['role_code' => RoleCode::TENANT_ADMIN->value]));
        $this->getJson($url)->assertNotFound();
    }

    public function test_paid_future_cancelled_deleted_and_missing_email_are_not_eligible(): void
    {
        [$tenant, $admin, $id] = $this->fixture();
        $url = "/api/v1/admin/installments/{$id}/email-preview";
        DB::table('contacts')->where('tenant_id', $tenant->id)->update(['email' => null]);
        $this->getJson($url)->assertOk()->assertJsonPath('data.eligible', false);
        DB::table('contacts')->where('tenant_id', $tenant->id)->update(['email' => 'client@example.test']);
        DB::table('installments')->where('public_id', $id)->update(['due_date' => '2099-01-01']);
        $this->getJson($url)->assertJsonPath('data.eligible', false);
        DB::table('installments')->where('public_id', $id)->update(['due_date' => '2026-02-10', 'cancelled_at' => now()]);
        $this->getJson($url)->assertJsonPath('data.eligible', false);
        DB::table('installments')->where('public_id', $id)->update(['cancelled_at' => null]);
        $this->postJson("/api/v1/admin/installments/{$id}/payments", [
            'amountPaid' => '100.00', 'paymentMethod' => 'CASH', 'paymentReceiptNumber' => 'TEST',
            'paidAt' => '2026-02-01', 'idempotencyKey' => (string) Str::uuid(),
        ])->assertCreated();
        $this->getJson($url)->assertJsonPath('data.eligible', false);
        DB::table('contacts')->where('tenant_id', $tenant->id)->update(['deleted_at' => now()]);
        $this->getJson($url)->assertNotFound();
    }

    public function test_delivery_requires_explicit_configuration_and_send_option(): void
    {
        Mail::shouldReceive('mailer')->never();
        [$tenant, $admin, $id] = $this->fixture();
        $args = ['tenant' => $tenant->slug, 'installment' => $id];
        $this->artisan('everprop:collections:email', $args)->assertSuccessful();
        $this->artisan('everprop:collections:email', $args + ['--send' => true])->assertFailed();
        $this->provision($tenant);
        config(['collections_mail.tenant' => 'another-tenant']);
        $this->artisan('everprop:collections:email', $args + ['--send' => true])->assertFailed();
        self::assertSame(0, DB::table('collection_email_attempts')->where('tenant_id', $tenant->id)->count());
    }

    public function test_send_is_audited_once_and_transport_failure_is_not_retried(): void
    {
        [$tenant, $admin, $id] = $this->fixture();
        $this->provision($tenant);
        $mailer = Mockery::mock();
        Mail::shouldReceive('mailer')->with('collections')->once()->andReturn($mailer);
        /** @var Expectation $raw */
        $raw = $mailer->shouldReceive('raw');
        $raw->once()->andReturnUsing(function ($body, $callback) {
            $message = new Email;
            $callback(new Message($message));
            self::assertSame('client@example.test', $message->getTo()[0]->getAddress());
            self::assertSame('billing@example.test', $message->getFrom()[0]->getAddress());
            self::assertStringContainsString('ARS 100.00', $body);

            return new \stdClass;
        });
        $args = ['tenant' => $tenant->slug, 'installment' => $id, '--send' => true];
        $this->artisan('everprop:collections:email', $args)->assertSuccessful();
        $this->artisan('everprop:collections:email', $args)->assertSuccessful();
        self::assertSame('SENT', DB::table('collection_email_attempts')->where('tenant_id', $tenant->id)->value('status'));
    }

    public function test_ambiguous_transport_outcome_stays_unknown_and_no_retry_occurs(): void
    {
        [$tenant, $admin, $id] = $this->fixture();
        $this->provision($tenant);
        $mailer = Mockery::mock();
        Mail::shouldReceive('mailer')->with('collections')->once()->andReturn($mailer);
        /** @var Expectation $raw */
        $raw = $mailer->shouldReceive('raw');
        $raw->once()->andThrow(new \RuntimeException('Timeout'));
        $args = ['tenant' => $tenant->slug, 'installment' => $id, '--send' => true];
        $this->artisan('everprop:collections:email', $args)->assertFailed();
        $this->artisan('everprop:collections:email', $args)->assertSuccessful();
        $this->travel(1)->days();
        $this->artisan('everprop:collections:email', $args)->assertSuccessful();
        self::assertSame('UNKNOWN', DB::table('collection_email_attempts')->where('tenant_id', $tenant->id)->value('status'));
    }

    /** The fixture's only installment falls due on 2026-02-10; this sets the clock in the tenant's own zone. */
    private function at(Tenant $tenant, string $local): void
    {
        $this->travelTo(CarbonImmutable::parse($local, $tenant->timezone));
    }

    /**
     * An unpaid installment due 2026-02-10 for another tenant, written straight to the database: a second fixture()
     * would go through the API in the same test and reuse the first tenant's request context.
     */
    private function seedOtherTenantDue(string $email): Tenant
    {
        $tenant = Tenant::factory()->create();
        $user = User::factory()->for($tenant)->create(['role_code' => RoleCode::TENANT_ADMIN->value]);
        $contact = DB::table('contacts')->insertGetId(['tenant_id' => $tenant->id, 'public_id' => (string) Str::uuid(),
            'display_name' => 'Cliente de otra empresa', 'email' => $email, 'first_seen_at' => now(), 'last_seen_at' => now()]);
        $stage = DB::table('pipeline_stages')->insertGetId(['tenant_id' => $tenant->id, 'code' => 'NEW', 'name' => 'New', 'category' => 'OPEN', 'position' => 1]);
        $lead = DB::table('leads')->insertGetId(['tenant_id' => $tenant->id, 'public_id' => (string) Str::uuid(), 'contact_id' => $contact,
            'stage_id' => $stage, 'assigned_user_id' => $user->id, 'source_channel' => 'WEB_FORM', 'source_kind' => 'CONTACT_FORM',
            'title' => 'Otra empresa', 'first_touch_at' => now(), 'last_touch_at' => now()]);
        $agreement = DB::table('payment_agreements')->insertGetId(['tenant_id' => $tenant->id, 'public_id' => (string) Str::uuid(),
            'lead_id' => $lead, 'created_by' => $user->id, 'currency' => 'ARS', 'total_price' => '100.00', 'down_payment' => '0.00',
            'financed_balance' => '100.00', 'total_installments' => 1, 'day_of_month_due' => 10, 'start_date' => '2026-01-01',
            'idempotency_key' => (string) Str::uuid(), 'request_hash' => str_repeat('0', 64)]);
        DB::table('installments')->insert(['tenant_id' => $tenant->id, 'public_id' => (string) Str::uuid(), 'agreement_id' => $agreement,
            'installment_number' => 1, 'due_date' => '2026-02-10', 'amount_expected' => '100.00']);

        return $tenant;
    }

    public function test_upcoming_notice_goes_out_once_within_the_window_with_amount_due_date_and_how_to_pay(): void
    {
        [$tenant, $admin, $id] = $this->fixture();
        $this->provision($tenant);
        $sent = [];
        $mailer = Mockery::mock();
        Mail::shouldReceive('mailer')->with('collections')->once()->andReturn($mailer);
        /** @var Expectation $raw */
        $raw = $mailer->shouldReceive('raw');
        $raw->once()->andReturnUsing(function ($body, $callback) use (&$sent) {
            $message = new Email;
            $callback(new Message($message));
            $sent[] = ['to' => $message->getTo()[0]->getAddress(), 'subject' => (string) $message->getSubject(), 'body' => $body];

            return new \stdClass;
        });

        $this->at($tenant, '2026-02-04 10:00'); // six days before: not yet
        $this->artisan('everprop:collections:notify-upcoming')->assertSuccessful();
        $this->at($tenant, '2026-02-05 08:00'); // inside the window but before the sending hour
        $this->artisan('everprop:collections:notify-upcoming')->assertSuccessful();
        $this->at($tenant, '2026-02-05 09:30');
        $this->artisan('everprop:collections:notify-upcoming')->assertSuccessful();
        $this->at($tenant, '2026-02-08 09:30'); // later runs never repeat it
        $this->artisan('everprop:collections:notify-upcoming')->assertSuccessful();

        self::assertCount(1, $sent);
        self::assertSame('client@example.test', $sent[0]['to']);
        self::assertStringContainsString('cuota 1 de 1 vence el 10/02/2026', $sent[0]['subject']);
        self::assertStringContainsString('ARS 100.00', $sent[0]['body']);
        self::assertStringContainsString('Transferencia al alias BELLOMO.PRUEBA', $sent[0]['body']);
        $attempt = DB::table('collection_email_attempts')->where('tenant_id', $tenant->id)->first();
        self::assertSame(['UPCOMING', 'SENT'], [$attempt->kind, $attempt->status]);
    }

    public function test_upcoming_notice_uses_the_remaining_balance_and_skips_paid_installments(): void
    {
        [$tenant, $admin, $id] = $this->fixture();
        $this->provision($tenant);
        $sent = [];
        $mailer = Mockery::mock();
        Mail::shouldReceive('mailer')->with('collections')->once()->andReturn($mailer);
        /** @var Expectation $raw */
        $raw = $mailer->shouldReceive('raw');
        $raw->once()->andReturnUsing(function ($body) use (&$sent) {
            $sent[] = $body;

            return new \stdClass;
        });
        $pay = fn (string $amount) => $this->postJson("/api/v1/admin/installments/{$id}/payments", [
            'amountPaid' => $amount, 'paymentMethod' => 'CASH', 'paymentReceiptNumber' => 'TEST',
            'paidAt' => '2026-02-01', 'idempotencyKey' => (string) Str::uuid(),
        ])->assertCreated();
        $pay('40.00');
        $this->at($tenant, '2026-02-06 10:00');
        $this->artisan('everprop:collections:notify-upcoming')->assertSuccessful();
        self::assertStringContainsString('ARS 60.00', $sent[0]);
    }

    public function test_a_fully_paid_installment_is_never_notified(): void
    {
        Mail::shouldReceive('mailer')->never();
        [$tenant, $admin, $id] = $this->fixture();
        $this->provision($tenant);
        $this->postJson("/api/v1/admin/installments/{$id}/payments", [
            'amountPaid' => '100.00', 'paymentMethod' => 'CASH', 'paymentReceiptNumber' => 'TEST',
            'paidAt' => '2026-02-01', 'idempotencyKey' => (string) Str::uuid(),
        ])->assertCreated();
        $this->at($tenant, '2026-02-06 10:00');
        $this->artisan('everprop:collections:notify-upcoming')->assertSuccessful();
        self::assertSame(0, DB::table('collection_email_attempts')->where('tenant_id', $tenant->id)->count());
    }

    public function test_nothing_is_sent_without_approved_payment_instructions(): void
    {
        Mail::shouldReceive('mailer')->never();
        [$tenant, $admin, $id] = $this->fixture();
        $this->provision($tenant);
        config(['collections_mail.payment_instructions' => '   ']);
        $this->at($tenant, '2026-02-06 10:00');
        $this->artisan('everprop:collections:notify-upcoming')->assertSuccessful()->expectsOutputToContain('Faltan los datos de pago');
        $this->artisan('everprop:collections:email', ['tenant' => $tenant->slug, 'installment' => $id, '--send' => true])->assertFailed();
        self::assertSame(0, DB::table('collection_email_attempts')->where('tenant_id', $tenant->id)->count());
    }

    public function test_only_the_provisioned_tenant_is_notified_even_with_the_same_client_email(): void
    {
        // Both tenants have an unpaid installment due in the window, for a contact with the same email address.
        $other = $this->seedOtherTenantDue('client@example.test');
        [$tenant, $admin, $id] = $this->fixture();
        $this->provision($tenant);
        $sent = [];
        $mailer = Mockery::mock();
        Mail::shouldReceive('mailer')->with('collections')->once()->andReturn($mailer);
        /** @var Expectation $raw */
        $raw = $mailer->shouldReceive('raw');
        $raw->once()->andReturnUsing(function ($body, $callback) use (&$sent) {
            $message = new Email;
            $callback(new Message($message));
            $sent[] = (string) $message->getSubject();

            return new \stdClass;
        });
        $this->at($tenant, '2026-02-06 10:00');
        $this->artisan('everprop:collections:notify-upcoming')->assertSuccessful();

        self::assertCount(1, $sent);
        self::assertStringContainsString($tenant->name, $sent[0]);
        self::assertSame(1, DB::table('collection_email_attempts')->where('tenant_id', $tenant->id)->count());
        self::assertSame(0, DB::table('collection_email_attempts')->where('tenant_id', $other->id)->count());
    }

    public function test_installments_that_cannot_be_sent_never_use_up_the_cap(): void
    {
        [$tenant, $admin, $id] = $this->fixture();
        $this->provision($tenant);
        config(['collections_mail.max_per_run' => 1]);
        // A second agreement, due earlier in the window (06/02) and already paid: it must not take the only slot.
        $lead = (string) DB::table('leads')->where('tenant_id', $tenant->id)->value('public_id');
        $this->postJson('/api/v1/admin/payment-agreements', [
            'leadId' => $lead, 'currency' => 'ARS', 'modality' => 'FIXED', 'totalPrice' => '50.00',
            'downPayment' => '0.00', 'totalInstallments' => 1, 'dayOfMonthDue' => 6,
            'startDate' => '2026-01-01', 'idempotencyKey' => (string) Str::uuid(),
        ])->assertCreated();
        $paid = (string) DB::table('installments')->where('tenant_id', $tenant->id)->where('due_date', '2026-02-06')->value('public_id');
        $this->postJson("/api/v1/admin/installments/{$paid}/payments", [
            'amountPaid' => '50.00', 'paymentMethod' => 'CASH', 'paymentReceiptNumber' => 'TEST',
            'paidAt' => '2026-02-01', 'idempotencyKey' => (string) Str::uuid(),
        ])->assertCreated();
        $mailer = Mockery::mock();
        Mail::shouldReceive('mailer')->with('collections')->once()->andReturn($mailer);
        /** @var Expectation $raw */
        $raw = $mailer->shouldReceive('raw');
        $raw->once()->andReturn(new \stdClass);

        $this->at($tenant, '2026-02-06 10:00');
        $this->artisan('everprop:collections:notify-upcoming')->assertSuccessful();
        $installment = (int) DB::table('installments')->where('public_id', $id)->value('id');
        self::assertSame('SENT', DB::table('collection_email_attempts')->where('tenant_id', $tenant->id)->where('installment_id', $installment)->value('status'));
    }

    public function test_an_unresolved_attempt_blocks_the_notice_and_the_database_rejects_a_second_upcoming_row(): void
    {
        Mail::shouldReceive('mailer')->never();
        [$tenant, $admin, $id] = $this->fixture();
        $this->provision($tenant);
        $installment = (int) DB::table('installments')->where('public_id', $id)->value('id');
        $row = ['tenant_id' => $tenant->id, 'installment_id' => $installment, 'recipient' => 'client@example.test',
            'sender' => 'billing@example.test', 'remaining_amount' => '100.00'];
        DB::table('collection_email_attempts')->insert($row + ['kind' => 'OVERDUE', 'business_date' => '2026-02-01', 'status' => 'SENDING']);
        $this->at($tenant, '2026-02-06 10:00');
        $this->artisan('everprop:collections:notify-upcoming')->assertSuccessful();
        self::assertSame(0, DB::table('collection_email_attempts')->where('tenant_id', $tenant->id)->where('kind', 'UPCOMING')->count());

        // Once-per-installment is enforced by the schema too, not only by the code.
        DB::table('collection_email_attempts')->insert($row + ['kind' => 'UPCOMING', 'business_date' => '2026-02-02', 'status' => 'SENT']);
        $this->expectException(QueryException::class);
        DB::table('collection_email_attempts')->insert($row + ['kind' => 'UPCOMING', 'business_date' => '2026-02-03', 'status' => 'SENT']);
    }

    public function test_dry_run_lists_without_sending_and_an_unknown_outcome_is_never_retried(): void
    {
        [$tenant, $admin, $id] = $this->fixture();
        $this->provision($tenant);
        $this->at($tenant, '2026-02-06 10:00');
        $mailer = Mockery::mock();
        Mail::shouldReceive('mailer')->with('collections')->once()->andReturn($mailer);
        /** @var Expectation $raw */
        $raw = $mailer->shouldReceive('raw');
        $raw->once()->andThrow(new \RuntimeException('Timeout'));

        $this->artisan('everprop:collections:notify-upcoming', ['--dry-run' => true])->assertSuccessful()->expectsOutputToContain('would send');
        self::assertSame(0, DB::table('collection_email_attempts')->where('tenant_id', $tenant->id)->count());
        $this->artisan('everprop:collections:notify-upcoming')->assertFailed();
        $this->at($tenant, '2026-02-07 10:00');
        $this->artisan('everprop:collections:notify-upcoming')->assertSuccessful();
        self::assertSame('UNKNOWN', DB::table('collection_email_attempts')->where('tenant_id', $tenant->id)->value('status'));
    }
}
