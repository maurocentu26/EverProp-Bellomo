<?php

namespace Tests\Feature\Collections;

use App\Domain\Identity\Enums\RoleCode;
use App\Domain\Tenancy\Models\Tenant;
use App\Models\User;
use Carbon\CarbonImmutable;
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

        // A fully paid installment is never notified.
        [$other, $otherAdmin, $otherId] = $this->fixture();
        $this->provision($other);
        $this->postJson("/api/v1/admin/installments/{$otherId}/payments", [
            'amountPaid' => '100.00', 'paymentMethod' => 'CASH', 'paymentReceiptNumber' => 'TEST',
            'paidAt' => '2026-02-01', 'idempotencyKey' => (string) Str::uuid(),
        ])->assertCreated();
        $this->artisan('everprop:collections:notify-upcoming')->assertSuccessful();
        self::assertSame(0, DB::table('collection_email_attempts')->where('tenant_id', $other->id)->count());
    }

    public function test_nothing_is_sent_without_approved_payment_instructions_or_for_another_tenant(): void
    {
        Mail::shouldReceive('mailer')->never();
        [$tenant, $admin, $id] = $this->fixture();
        [$other, $otherAdmin, $otherId] = $this->fixture();
        $this->provision($tenant);
        config(['collections_mail.payment_instructions' => '   ']);
        $this->at($tenant, '2026-02-06 10:00');
        $this->artisan('everprop:collections:notify-upcoming')->assertSuccessful()->expectsOutputToContain('Faltan los datos de pago');
        $this->artisan('everprop:collections:email', ['tenant' => $tenant->slug, 'installment' => $id, '--send' => true])->assertFailed();

        // Provisioned for this tenant only: the other tenant's due installment is never touched.
        config(['collections_mail.payment_instructions' => 'Transferencia al alias BELLOMO.PRUEBA', 'collections_mail.enabled' => false]);
        $this->artisan('everprop:collections:notify-upcoming')->assertSuccessful();
        self::assertSame(0, DB::table('collection_email_attempts')->whereIn('tenant_id', [$tenant->id, $other->id])->count());
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
