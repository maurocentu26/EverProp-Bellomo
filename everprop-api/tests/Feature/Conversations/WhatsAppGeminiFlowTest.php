<?php

namespace Tests\Feature\Conversations;

use App\Console\Commands\ConversationKpis;
use App\Domain\AgentRuntime\Llm\GeminiChatClient;
use App\Domain\AgentRuntime\Llm\LlmClient;
use App\Domain\Conversations\Services\OutboundDispatcher;
use App\Domain\Integrations\Services\IntegrationTokens;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Http\Client\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Str;
use Tests\TestCase;

/** Real database queue and application flow; both external providers are fake and cannot receive traffic. */
final class WhatsAppGeminiFlowTest extends TestCase
{
    use ConversationTestSupport, DatabaseTransactions;

    private string $queue;

    protected function setUp(): void
    {
        parent::setUp();
        $this->queue = 'qa-conversations-'.Str::uuid();
        config([
            'queue.default' => 'database', 'queue.connections.database.queue' => $this->queue,
            'services.meta.app_secret' => self::APP_SECRET, 'services.meta.send_enabled' => true,
            'services.meta.whatsapp_sandbox_phone_number_id' => null,
            'services.gemini.railway_environment' => 'staging', 'services.gemini.staging_enabled' => true,
            'conversations.ai_enabled' => true,
            'agent.input_micros_per_token' => 0.25, 'agent.output_micros_per_token' => 1.5,
        ]);
        $this->app->instance(LlmClient::class, new GeminiChatClient('synthetic-key', 'test-model', 5));
        Http::preventStrayRequests();
    }

    /** @return array{tenant: int, phone: string} */
    private function channel(string $phone): array
    {
        ['tenant' => $tenant, 'integration' => $integration] = $this->tenantWithIntegration();
        app(IntegrationTokens::class)->store($tenant->id, $integration, 'synthetic-whatsapp-token');
        $this->whatsappChannel($tenant->id, $integration, $phone);

        return ['tenant' => (int) $tenant->id, 'phone' => $phone];
    }

    /** @param list<array<string, mixed>> $parts
     * @return array<string, mixed>
     */
    private function response(array $parts): array
    {
        return [
            'candidates' => [['finishReason' => 'STOP', 'content' => ['role' => 'model', 'parts' => $parts]]],
            'usageMetadata' => ['promptTokenCount' => 100, 'candidatesTokenCount' => 20],
        ];
    }

    private function drain(): void
    {
        $this->artisan('queue:work', [
            'connection' => 'database', '--queue' => $this->queue, '--stop-when-empty' => true,
            '--sleep' => 0, '--tries' => 1, '--max-jobs' => 500,
        ])->assertSuccessful();
        $this->assertSame(0, DB::table('jobs')->where('queue', $this->queue)->count());
    }

    public function test_signed_webhook_queue_gemini_tool_retry_and_delivery_are_idempotent(): void
    {
        $f = $this->channel('QA-PHONE');
        $gemini = Http::sequence()
            ->push(['error' => ['status' => 'UNAVAILABLE']], 503)
            ->push($this->response([['functionCall' => ['name' => 'buscar_propiedades', 'args' => (object) []], 'thoughtSignature' => 'synthetic-signature']]))
            ->push($this->response([['text' => 'Puedo ayudarte a buscar un terreno. ¿En qué zona te interesa?']]));
        Http::fake([
            'generativelanguage.googleapis.com/*' => $gemini,
            'graph.facebook.com/*' => Http::response(['messages' => [['id' => 'wamid.qa-out']]]),
        ]);
        $raw = $this->waPayload($f['phone'], [$this->waText('wamid.qa-in', 'Quiero conocer los terrenos disponibles')]);
        $this->postWebhook($raw)->assertOk();
        $this->postWebhook($raw)->assertOk();
        Http::assertNothingSent();
        $this->assertDatabaseMissing('messages', ['tenant_id' => $f['tenant']]);

        $this->drain();

        $run = DB::table('chatbot_runs')->where('tenant_id', $f['tenant'])->sole();
        $this->assertSame(['gemini', 'SUCCEEDED', 'REPLY'], [$run->model_provider, $run->status, $run->decision]);
        $this->assertSame(3, json_decode($run->trace_json, true)['calls']);
        $this->assertSame(1, DB::table('usage_ledger')->where('tenant_id', $f['tenant'])->where('status', 'UNKNOWN')->count());
        $this->assertSame(2, DB::table('usage_ledger')->where('tenant_id', $f['tenant'])->where('status', 'COMMITTED')->count());
        $this->assertSame(2, DB::table('messages')->where('tenant_id', $f['tenant'])->count());
        $this->assertDatabaseHas('messages', ['id' => $run->output_message_id, 'tenant_id' => $f['tenant'], 'delivery_status' => 'SENT']);
        Http::assertSent(fn (Request $r) => str_contains($r->url(), 'generativelanguage')
            && isset($r['contents'][2]['parts'][0]['functionResponse'])
            && $r['contents'][1]['parts'][0]['thoughtSignature'] === 'synthetic-signature');

        // Duplicated inbound and late/out-of-order status deliveries must not cause another answer.
        $this->postWebhook($raw)->assertOk();
        foreach (['read', 'delivered', 'sent', 'read'] as $status) {
            $this->postWebhook($this->waPayload($f['phone'], statuses: [[
                'id' => 'wamid.qa-out', 'status' => $status, 'timestamp' => (string) now()->timestamp,
                'recipient_id' => '5493881111111',
            ]]))->assertOk();
        }
        $this->drain();
        $this->assertDatabaseHas('messages', ['id' => $run->output_message_id, 'delivery_status' => 'READ']);
        $this->assertSame(1, DB::table('chatbot_runs')->where('tenant_id', $f['tenant'])->count());
        $automatic = app(ConversationKpis::class)->compute($f['tenant'], now()->toImmutable()->startOfDay(), now()->toImmutable()->addDay())['automatic'];
        $this->assertSame(1, $automatic['runs']);
        $this->assertSame(['SUCCEEDED' => 1], $automatic['by_status']);
        $this->assertSame(['READ' => 1], $automatic['reply_delivery']);
        $this->assertSame('0.00011000', $automatic['estimated_cost_usd']);
        DB::table('chatbot_runs')->where('tenant_id', $f['tenant'])->where('id', $run->id)->update(['provider_run_id' => 'suggest:qa']);
        $this->assertSame(0, app(ConversationKpis::class)->compute($f['tenant'], now()->toImmutable()->startOfDay(), now()->toImmutable()->addDay())['automatic']['runs']);
        DB::table('chatbot_runs')->where('tenant_id', $f['tenant'])->where('id', $run->id)->update([
            'provider_run_id' => $run->provider_run_id, 'started_at' => now()->subDays(2),
        ]);
        $this->assertSame(0, app(ConversationKpis::class)->compute($f['tenant'], now()->toImmutable()->startOfDay(), now()->toImmutable()->addDay())['automatic']['runs']);
        Http::assertSentCount(4);
    }

    public function test_persistent_provider_failure_sends_one_handoff_and_preserves_unknown_cost(): void
    {
        $f = $this->channel('QA-FAIL');
        Http::fake([
            'generativelanguage.googleapis.com/*' => Http::response(['error' => ['status' => 'UNAVAILABLE']], 503),
            'graph.facebook.com/*' => Http::response(['messages' => [['id' => 'wamid.qa-handoff']]]),
        ]);
        $raw = $this->waPayload($f['phone'], [$this->waText('wamid.qa-fail', 'Hola')]);
        $this->postWebhook($raw)->assertOk();
        $this->drain();
        $this->postWebhook($raw)->assertOk();
        $this->drain();

        $this->assertDatabaseHas('chatbot_runs', ['tenant_id' => $f['tenant'], 'status' => 'FAILED', 'error_code' => 'PROVIDER_ERROR']);
        $this->assertDatabaseHas('conversations', ['tenant_id' => $f['tenant'], 'control_state' => 'WAITING_HUMAN']);
        $this->assertSame(1, DB::table('messages')->where('tenant_id', $f['tenant'])->where('direction', 'OUTBOUND')->where('delivery_status', 'SENT')->count());
        $this->assertSame(2, DB::table('usage_ledger')->where('tenant_id', $f['tenant'])->where('status', 'UNKNOWN')->count());
        $automatic = app(ConversationKpis::class)->compute($f['tenant'], now()->toImmutable()->startOfDay(), now()->toImmutable()->addDay())['automatic'];
        $this->assertSame(['PROVIDER_ERROR' => 1], $automatic['errors']);
        $this->assertSame([], $automatic['reply_delivery'], 'the fixed handoff is not counted as a generated reply');
        Http::assertSentCount(3);
    }

    public function test_a_turn_waits_for_the_redis_lock_then_answers_only_once(): void
    {
        $f = $this->channel('QA-LOCK');
        config(['cache.default' => 'redis']);
        Http::fake([
            'generativelanguage.googleapis.com/*' => Http::response($this->response([['text' => 'Hola, ¿en qué zona buscás?']])),
            'graph.facebook.com/*' => Http::response(['messages' => [['id' => 'wamid.qa-lock-out']]]),
        ]);
        $this->postWebhook($this->waPayload($f['phone'], [$this->waText('wamid.qa-lock-in', 'Hola')]))->assertOk();
        $this->artisan('queue:work', ['connection' => 'database', '--queue' => $this->queue, '--once' => true])->assertSuccessful();
        $conversationId = (int) DB::table('conversations')->where('tenant_id', $f['tenant'])->value('id');
        $lock = Cache::lock('agent-turn:'.$f['tenant'].':'.$conversationId, 180);
        $this->assertTrue($lock->get());
        try {
            $this->artisan('queue:work', ['connection' => 'database', '--queue' => $this->queue, '--once' => true])->assertSuccessful();
            Http::assertNothingSent();
            $this->assertDatabaseMissing('chatbot_runs', ['tenant_id' => $f['tenant']]);
            $this->assertSame(1, DB::table('jobs')->where('queue', $this->queue)->count());
        } finally {
            $lock->release();
        }
        $this->travel(11)->seconds();
        $this->drain();
        $this->assertSame(1, DB::table('chatbot_runs')->where('tenant_id', $f['tenant'])->where('status', 'SUCCEEDED')->count());
        $this->assertSame(1, DB::table('messages')->where('tenant_id', $f['tenant'])->where('direction', 'OUTBOUND')->where('delivery_status', 'SENT')->count());
        Http::assertSentCount(2);
    }

    public function test_uncertain_meta_delivery_is_not_resent_by_requeue_or_reconciliation(): void
    {
        $f = $this->channel('QA-UNKNOWN');
        $attempts = 0;
        Http::fake([
            'generativelanguage.googleapis.com/*' => Http::response($this->response([['text' => 'Hola, ¿en qué zona buscás?']])),
            'graph.facebook.com/*' => function () use (&$attempts) {
                $attempts++;
                throw new ConnectionException('synthetic timeout after write');
            },
        ]);
        $this->postWebhook($this->waPayload($f['phone'], [$this->waText('wamid.qa-unknown-in', 'Hola')]))->assertOk();
        $this->drain();
        $job = DB::table('outbound_jobs')->where('tenant_id', $f['tenant'])->sole();
        $this->assertSame('UNKNOWN', $job->status);
        $this->assertSame('UNKNOWN', app(OutboundDispatcher::class)->dispatch($f['tenant'], (int) $job->id));
        $this->artisan('everprop:conversations:reconcile')->assertSuccessful();
        $this->drain();

        $this->assertDatabaseHas('messages', ['tenant_id' => $f['tenant'], 'direction' => 'OUTBOUND', 'delivery_status' => 'UNKNOWN']);
        $this->assertSame(1, $attempts);
        Http::assertSentCount(1); // Laravel records responses, not the request that threw.
    }

    public function test_burst_of_fifty_conversations_keeps_tenants_contacts_and_replies_separate(): void
    {
        $a = $this->channel('QA-BURST-A');
        $b = $this->channel('QA-BURST-B');
        $sent = 0;
        Http::fake([
            'generativelanguage.googleapis.com/*' => function (Request $r) {
                $input = $r['contents'][0]['parts'][0]['text'];
                $this->assertCount(1, $r['contents'], 'history must contain only this contact');

                return Http::response($this->response([['text' => 'Recibido: '.$input]]));
            },
            'graph.facebook.com/*' => function () use (&$sent) {
                return Http::response(['messages' => [['id' => 'wamid.qa-burst-out-'.++$sent]]]);
            },
        ]);
        foreach (range('a', 'y') as $n => $letter) {
            $from = (string) (5493810000000 + $n);
            foreach (['Alfa' => $a, 'Beta' => $b] as $marker => $f) {
                $raw = $this->waPayload($f['phone'], [$this->waText('wamid.qa-burst-'.$letter, 'qa-'.$marker.'-'.$letter, $from)]);
                $this->postWebhook($raw)->assertOk();
                $this->postWebhook($raw)->assertOk();
            }
        }
        Http::assertNothingSent();
        $this->drain();

        foreach (['Alfa' => $a, 'Beta' => $b] as $marker => $f) {
            $this->assertSame(25, DB::table('conversations')->where('tenant_id', $f['tenant'])->count());
            $this->assertSame(25, DB::table('contacts')->where('tenant_id', $f['tenant'])->count());
            $this->assertSame(25, DB::table('chatbot_runs')->where('tenant_id', $f['tenant'])->where('status', 'SUCCEEDED')->count());
            $this->assertSame(25, DB::table('messages')->where('tenant_id', $f['tenant'])->where('direction', 'OUTBOUND')->where('delivery_status', 'SENT')->count());
            $this->assertSame(25, app(ConversationKpis::class)->compute($f['tenant'], now()->toImmutable()->startOfDay(), now()->toImmutable()->addDay())['automatic']['runs']);
            foreach (range('a', 'y') as $n => $letter) {
                $from = (string) (5493810000000 + $n);
                $conversation = DB::table('conversations')->where('tenant_id', $f['tenant'])->where('provider_thread_id', 'wa:'.$from)->sole();
                $texts = DB::table('messages')->where('tenant_id', $f['tenant'])->where('conversation_id', $conversation->id)->orderBy('sequence')->pluck('text_body')->all();
                $this->assertSame(['qa-'.$marker.'-'.$letter, 'Recibido: qa-'.$marker.'-'.$letter], $texts);
                Http::assertSent(fn (Request $r) => str_ends_with($r->url(), '/'.$f['phone'].'/messages')
                    && $r['to'] === $from && $r['text']['body'] === 'Recibido: qa-'.$marker.'-'.$letter);
            }
        }
        Http::assertSentCount(100);
    }
}
