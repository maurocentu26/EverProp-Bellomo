<?php

namespace Tests\Feature\Conversations;

use App\Domain\AgentRuntime\Jobs\RunAgentJob;
use App\Domain\Conversations\Jobs\ProcessMetaWebhookReceipt;
use App\Domain\Conversations\Services\MetaWebhookProcessor;
use App\Domain\Conversations\Support\DroppedMetaEvents;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Queue;
use Illuminate\Support\Str;
use Mockery\VerificationDirector;
use Tests\TestCase;

/** EVP-138: Meta events dropped on purpose (unmapped account, incomplete event, channel changed) are counted and alerted. */
final class MetaDroppedEventsTest extends TestCase
{
    use ConversationTestSupport, DatabaseTransactions;

    protected function setUp(): void
    {
        parent::setUp();
        config(['services.meta.app_secret' => self::APP_SECRET, 'conversations.ai_enabled' => false]);
        Queue::fake([RunAgentJob::class]);
        foreach (DroppedMetaEvents::REASONS as $reason) {
            Cache::forget("meta-webhook-dropped:{$reason}:".intdiv(time(), 3600));
        }
    }

    private function dropped(string $reason): int
    {
        return DroppedMetaEvents::counts()[$reason]['this_hour'];
    }

    private function socialChannel(int $tenantId, int $integrationId, string $accountId): int
    {
        return (int) DB::table('channel_accounts')->insertGetId(['tenant_id' => $tenantId, 'integration_id' => $integrationId, 'public_id' => (string) Str::uuid(),
            'channel_type' => 'INSTAGRAM_DM', 'provider_account_id' => $accountId, 'display_name' => 'IG '.$accountId, 'status' => 'ACTIVE']);
    }

    /** @param list<array<string, mixed>> $messaging */
    private function instagram(string $accountId, array $messaging): string
    {
        return json_encode(['object' => 'instagram', 'entry' => [['id' => $accountId, 'time' => now()->getTimestampMs(), 'messaging' => $messaging]]], JSON_THROW_ON_ERROR);
    }

    /** @return array<string, mixed> */
    private function dm(?string $sender, string $accountId, string $mid, bool $echo = false): array
    {
        return array_filter(['sender' => $sender === null ? null : ['id' => $sender], 'recipient' => ['id' => $accountId], 'timestamp' => now()->getTimestampMs(),
            'message' => array_filter(['mid' => $mid, 'text' => 'Hola', 'is_echo' => $echo ?: null])]);
    }

    public function test_unmapped_accounts_are_counted_and_the_fifth_in_an_hour_raises_one_alert(): void
    {
        $log = Log::spy();
        $this->postWebhook($this->waPayload('PHONE-NOT-MAPPED', [$this->waText('wamid.evp138', 'Hola')]))->assertOk();
        foreach (range(1, 5) as $i) {
            $this->postWebhook($this->instagram('IG-NOT-MAPPED', [$this->dm('IG-VISITOR', 'IG-NOT-MAPPED', 'mid.evp138.'.$i)]))->assertOk();
        }

        $this->assertSame(6, $this->dropped('UNMAPPED_ACCOUNT'));
        $this->assertSame(0, DB::table('webhook_receipts')->where('provider_object_id', 'IG-NOT-MAPPED')->count(), 'no tenant: nothing stored with client text');
        $warnings = $log->shouldHaveReceived('warning', ['meta.webhook.dropped_event', \Mockery::on(fn (array $c) => $c['reason'] === 'UNMAPPED_ACCOUNT'
            && $c['channel_type'] === 'INSTAGRAM_DM' && $c['account_id'] === 'IG-NOT-MAPPED')]);
        $this->assertInstanceOf(VerificationDirector::class, $warnings);
        $warnings->times(5);
        $alert = $log->shouldHaveReceived('error', ['meta.webhook.dropped_events_alert', \Mockery::on(fn (array $c) => $c['count_this_hour'] === DroppedMetaEvents::THRESHOLD)]);
        $this->assertInstanceOf(VerificationDirector::class, $alert);
        $alert->once();

        $this->artisan('everprop:meta:dropped-events')->expectsOutputToContain('UNMAPPED_ACCOUNT')->assertSuccessful();
    }

    public function test_an_event_without_sender_is_counted_as_incomplete_but_an_echo_is_not(): void
    {
        ['tenant' => $tenant, 'integration' => $integration] = $this->tenantWithIntegration();
        $this->socialChannel((int) $tenant->id, $integration, 'IG-EVP138');

        $this->postWebhook($this->instagram('IG-EVP138', [
            $this->dm(null, 'IG-EVP138', 'mid.no-sender'),
            $this->dm('IG-EVP138', 'IG-EVP138', 'mid.echo', echo: true),
            $this->dm('IG-VISITOR-138', 'IG-EVP138', 'mid.ok'),
        ]))->assertOk();

        $this->assertSame(1, $this->dropped('INCOMPLETE_EVENT'));
        $this->assertSame(['mid.ok'], DB::table('messages')->where('tenant_id', $tenant->id)->pluck('provider_message_id')->all());
        $this->assertSame('PROCESSED', DB::table('webhook_receipts')->where('tenant_id', $tenant->id)->value('processing_status'));
    }

    public function test_a_receipt_rejected_because_the_channel_changed_is_counted(): void
    {
        Queue::fake([ProcessMetaWebhookReceipt::class, RunAgentJob::class]);
        ['tenant' => $tenant, 'integration' => $integration] = $this->tenantWithIntegration();
        $channel = $this->socialChannel((int) $tenant->id, $integration, 'IG-MOVES-138');
        $this->postWebhook($this->instagram('IG-MOVES-138', [$this->dm('IG-VISITOR-138', 'IG-MOVES-138', 'mid.moves')]))->assertOk();
        DB::table('channel_accounts')->where('id', $channel)->update(['status' => 'DISCONNECTED']);

        (new ProcessMetaWebhookReceipt((int) $tenant->id, (int) DB::table('webhook_receipts')->where('tenant_id', $tenant->id)->value('id')))
            ->handle(app(MetaWebhookProcessor::class));

        $this->assertSame('CHANNEL_CHANGED', DB::table('webhook_receipts')->where('tenant_id', $tenant->id)->value('last_error_code'));
        $this->assertSame(1, $this->dropped('CHANNEL_CHANGED'));
    }
}
