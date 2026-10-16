<?php

namespace Tests\Feature\Conversations;

use App\Domain\Conversations\Jobs\ProcessMetaWebhookReceipt;
use App\Domain\Conversations\Services\MetaWebhookProcessor;
use Illuminate\Database\Events\QueryExecuted;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Queue;
use Tests\TestCase;

/** Plan W6: every WhatsApp "messages" change is durable before the 200 and applied once by the worker. */
final class WhatsAppWebhookReceiptTest extends TestCase
{
    use ConversationTestSupport, DatabaseTransactions;

    protected function setUp(): void
    {
        parent::setUp();
        config(['services.meta.app_secret' => self::APP_SECRET, 'conversations.ai_enabled' => false]);
    }

    /** @return array{0: int, 1: int} tenant id, channel id */
    private function channel(string $phoneNumberId): array
    {
        ['tenant' => $tenant, 'integration' => $integration] = $this->tenantWithIntegration();

        return [$tenant->id, $this->whatsappChannel($tenant->id, $integration, $phoneNumberId)];
    }

    public function test_the_change_is_stored_before_the_200_and_applied_later(): void
    {
        Queue::fake([ProcessMetaWebhookReceipt::class]);
        [$tenantId] = $this->channel('PN-RCPT');

        $this->postWebhook($this->waPayload('PN-RCPT', [$this->waText('wamid.R1', 'Hola')]))->assertOk();

        $this->assertDatabaseHas('webhook_receipts', ['tenant_id' => $tenantId, 'provider' => 'META', 'processing_status' => 'RECEIVED', 'provider_object_id' => 'PN-RCPT']);
        $this->assertDatabaseMissing('messages', ['tenant_id' => $tenantId, 'provider_message_id' => 'wamid.R1']);
        Queue::assertPushed(ProcessMetaWebhookReceipt::class, fn (ProcessMetaWebhookReceipt $job) => $job->tenantId === $tenantId);
    }

    public function test_redeliveries_share_one_receipt_and_the_message_is_applied_once(): void
    {
        [$tenantId] = $this->channel('PN-DUP');
        $raw = $this->waPayload('PN-DUP', [$this->waText('wamid.D1', 'Hola')]);

        $this->postWebhook($raw)->assertOk();
        $this->postWebhook($raw)->assertOk();

        $this->assertSame(1, DB::table('webhook_receipts')->where('tenant_id', $tenantId)->count());
        $this->assertSame(1, DB::table('messages')->where('tenant_id', $tenantId)->where('provider_message_id', 'wamid.D1')->count());
        $receipt = DB::table('webhook_receipts')->where('tenant_id', $tenantId)->first(['id', 'processing_status']);
        $this->assertSame('PROCESSED', $receipt->processing_status);

        // A late requeue of an already processed receipt is a no-op.
        (new ProcessMetaWebhookReceipt($tenantId, (int) $receipt->id))->handle(app(MetaWebhookProcessor::class));
        $this->assertSame(1, DB::table('messages')->where('tenant_id', $tenantId)->where('provider_message_id', 'wamid.D1')->count());
    }

    public function test_a_failing_change_goes_to_retry_then_dead_letter(): void
    {
        Queue::fake([ProcessMetaWebhookReceipt::class]);
        [$tenantId] = $this->channel('PN-FAIL');
        $this->postWebhook($this->waPayload('PN-FAIL', [$this->waText('wamid.F1', 'Hola')]))->assertOk();
        $id = (int) DB::table('webhook_receipts')->where('tenant_id', $tenantId)->value('id');
        DB::table('webhook_receipts')->where('id', $id)->update(['raw_payload' => json_encode('not-an-object')]);
        $job = new ProcessMetaWebhookReceipt($tenantId, $id);

        try {
            $job->handle(app(MetaWebhookProcessor::class));
        } catch (\Throwable) {
            // expected: the queue retries it
        }
        $this->assertDatabaseHas('webhook_receipts', ['id' => $id, 'processing_status' => 'RETRY', 'attempt_count' => 1]);
        $this->assertNotNull(DB::table('webhook_receipts')->where('id', $id)->value('next_attempt_at'));

        $job->failed(new \RuntimeException('boom'));
        $this->assertDatabaseHas('webhook_receipts', ['id' => $id, 'processing_status' => 'DEAD_LETTER']);
    }

    public function test_the_reconciler_requeues_stale_receipts_and_parks_exhausted_ones(): void
    {
        Queue::fake([ProcessMetaWebhookReceipt::class]);
        [$tenantId] = $this->channel('PN-REC');
        $this->postWebhook($this->waPayload('PN-REC', [$this->waText('wamid.S1', 'Uno')]))->assertOk();
        $this->postWebhook($this->waPayload('PN-REC', [$this->waText('wamid.S2', 'Dos')]))->assertOk();
        [$stale, $exhausted] = DB::table('webhook_receipts')->where('tenant_id', $tenantId)->orderBy('id')->pluck('id')->all();
        DB::table('webhook_receipts')->where('id', $stale)->update(['received_at' => now()->subMinutes(5)]);
        DB::table('webhook_receipts')->where('id', $exhausted)->update(['received_at' => now()->subMinutes(5), 'attempt_count' => 10]);
        Queue::fake([ProcessMetaWebhookReceipt::class]);

        $this->artisan('everprop:conversations:reconcile')->assertSuccessful();

        Queue::assertPushed(ProcessMetaWebhookReceipt::class, fn (ProcessMetaWebhookReceipt $job) => $job->receiptId === (int) $stale);
        Queue::assertNotPushed(ProcessMetaWebhookReceipt::class, fn (ProcessMetaWebhookReceipt $job) => $job->receiptId === (int) $exhausted);
        $this->assertDatabaseHas('webhook_receipts', ['id' => $exhausted, 'processing_status' => 'DEAD_LETTER']);
    }

    public function test_a_receipt_is_never_applied_after_its_number_moved_to_another_tenant(): void
    {
        Queue::fake([ProcessMetaWebhookReceipt::class]);
        [$tenantA, $channelA] = $this->channel('PN-MOVE');
        $this->postWebhook($this->waPayload('PN-MOVE', [$this->waText('wamid.M1', 'Dato de A')]))->assertOk();
        $id = (int) DB::table('webhook_receipts')->where('tenant_id', $tenantA)->value('id');
        // A disconnects; B onboards the same number before the receipt is processed.
        DB::table('channel_accounts')->where('id', $channelA)->update(['provider_account_id' => 'PN-OLD-A']);
        [$tenantB] = $this->channel('PN-MOVE');

        (new ProcessMetaWebhookReceipt($tenantA, $id))->handle(app(MetaWebhookProcessor::class));

        $this->assertDatabaseHas('webhook_receipts', ['id' => $id, 'processing_status' => 'REJECTED', 'last_error_code' => 'CHANNEL_CHANGED']);
        $this->assertDatabaseMissing('messages', ['tenant_id' => $tenantB, 'provider_message_id' => 'wamid.M1']);
        $this->assertDatabaseMissing('messages', ['provider_message_id' => 'wamid.M1']);
    }

    public function test_moving_a_number_between_validation_and_use_cannot_leak_the_receipt(): void
    {
        Queue::fake([ProcessMetaWebhookReceipt::class]);
        [$tenantA, $channelA] = $this->channel('PN-RACE');
        ['tenant' => $tenantB, 'integration' => $integrationB] = $this->tenantWithIntegration();
        $this->postWebhook($this->waPayload('PN-RACE', [$this->waText('wamid.RACE', 'Dato privado de A')]))->assertOk();
        $id = (int) DB::table('webhook_receipts')->where('tenant_id', $tenantA)->value('id');
        $moved = false;
        DB::listen(function (QueryExecuted $query) use (&$moved, $channelA, $tenantB, $integrationB): void {
            if ($moved || ! str_contains($query->sql, '`channel_accounts` as `ca`')) {
                return;
            }
            $moved = true; // The first lookup has fetched A; move the mapping before the second lookup.
            DB::table('channel_accounts')->where('id', $channelA)->update(['provider_account_id' => 'PN-ARCHIVED']);
            $this->whatsappChannel($tenantB->id, $integrationB, 'PN-RACE');
        });

        (new ProcessMetaWebhookReceipt($tenantA, $id))->handle(app(MetaWebhookProcessor::class));

        $this->assertTrue($moved);
        $this->assertDatabaseHas('webhook_receipts', ['id' => $id, 'processing_status' => 'REJECTED']);
        $this->assertDatabaseMissing('messages', ['provider_message_id' => 'wamid.RACE']);
    }

    public function test_a_receipt_held_by_another_worker_is_not_processed_twice_until_its_lease_expires(): void
    {
        Queue::fake([ProcessMetaWebhookReceipt::class]);
        [$tenantId] = $this->channel('PN-LEASE');
        $this->postWebhook($this->waPayload('PN-LEASE', [$this->waText('wamid.L1', 'Hola')]))->assertOk();
        $id = (int) DB::table('webhook_receipts')->where('tenant_id', $tenantId)->value('id');
        DB::table('webhook_receipts')->where('id', $id)->update(['processing_status' => 'PROCESSING', 'attempt_count' => 1, 'next_attempt_at' => now()->addMinutes(10)]);

        (new ProcessMetaWebhookReceipt($tenantId, $id))->handle(app(MetaWebhookProcessor::class));
        $this->assertDatabaseMissing('messages', ['tenant_id' => $tenantId, 'provider_message_id' => 'wamid.L1']);
        Queue::fake([ProcessMetaWebhookReceipt::class]);
        $this->artisan('everprop:conversations:reconcile')->assertSuccessful();
        Queue::assertNotPushed(ProcessMetaWebhookReceipt::class);

        DB::table('webhook_receipts')->where('id', $id)->update(['next_attempt_at' => now()->subMinute()]);
        $this->artisan('everprop:conversations:reconcile')->assertSuccessful();
        $this->assertDatabaseHas('webhook_receipts', ['id' => $id, 'processing_status' => 'RETRY', 'last_error_code' => 'LEASE_EXPIRED']);
        Queue::assertPushed(ProcessMetaWebhookReceipt::class, fn (ProcessMetaWebhookReceipt $job) => $job->receiptId === $id);
    }

    public function test_client_text_is_dropped_once_processed_and_after_retention_for_failures(): void
    {
        [$tenantId] = $this->channel('PN-PII');
        $this->postWebhook($this->waPayload('PN-PII', [$this->waText('wamid.P1', 'Mi DNI es 12345678')]))->assertOk();
        $processed = DB::table('webhook_receipts')->where('tenant_id', $tenantId)->first(['raw_payload', 'processing_status', 'expires_at']);
        $this->assertSame('PROCESSED', $processed->processing_status);
        $this->assertStringNotContainsString('12345678', (string) $processed->raw_payload);
        $this->assertNotNull($processed->expires_at);

        Queue::fake([ProcessMetaWebhookReceipt::class]);
        $this->postWebhook($this->waPayload('PN-PII', [$this->waText('wamid.P2', 'Mi teléfono 3884000000')]))->assertOk();
        $failed = (int) DB::table('webhook_receipts')->where('tenant_id', $tenantId)->where('processing_status', 'RECEIVED')->value('id');
        DB::table('webhook_receipts')->where('id', $failed)->update(['processing_status' => 'DEAD_LETTER', 'expires_at' => now()->subDay()]);
        $this->artisan('everprop:conversations:reconcile')->assertSuccessful();
        $this->assertStringNotContainsString('3884000000', (string) DB::table('webhook_receipts')->where('id', $failed)->value('raw_payload'));
    }

    public function test_an_unknown_number_leaves_no_receipt(): void
    {
        Queue::fake([ProcessMetaWebhookReceipt::class]);

        $this->postWebhook($this->waPayload('PN-NOBODY', [$this->waText('wamid.N1', 'Hola')]))->assertOk();

        $this->assertDatabaseMissing('webhook_receipts', ['provider_object_id' => 'PN-NOBODY']);
        Queue::assertNothingPushed();
    }
}
