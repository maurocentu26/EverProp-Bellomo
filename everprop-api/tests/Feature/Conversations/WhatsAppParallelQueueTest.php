<?php

namespace Tests\Feature\Conversations;

use App\Domain\Integrations\Services\IntegrationTokens;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Str;
use Symfony\Component\Process\Process;
use Tests\TestCase;

/** Commits synthetic fixtures so independent PHP workers can see them; removes only its own tenants. */
final class WhatsAppParallelQueueTest extends TestCase
{
    use ConversationTestSupport;

    public function test_four_workers_drain_two_hundred_conversations_without_crossing_or_duplicating_replies(): void
    {
        $database = DB::getDatabaseName();
        $this->assertTrue(app()->environment('testing') && ($database === 'bellomo_crm_test'
            || preg_match('/^bellomo_crm_evp[0-9]+_qa$/D', $database) === 1), 'Refusing committed fixtures outside an explicit test database.');
        $queue = 'qa-parallel-'.Str::uuid();
        $tenants = $workers = [];
        $script = tempnam(sys_get_temp_dir(), 'evp86-worker-');
        $this->assertNotFalse($script);
        config(['queue.default' => 'database', 'queue.connections.database.queue' => $queue,
            'services.meta.app_secret' => self::APP_SECRET, 'conversations.ai_enabled' => true]);
        Http::preventStrayRequests();
        Http::fake();

        try {
            $fixtures = [];
            foreach (['Alfa', 'Beta'] as $prefix) {
                ['tenant' => $tenant, 'integration' => $integration] = $this->tenantWithIntegration();
                $tenants[] = (int) $tenant->id;
                $phone = 'QA-PARALLEL-'.$prefix.'-'.Str::random(8);
                app(IntegrationTokens::class)->store($tenant->id, $integration, 'synthetic-token');
                $this->whatsappChannel($tenant->id, $integration, $phone);
                $fixtures[$prefix] = ['tenant' => (int) $tenant->id, 'phone' => $phone];
                for ($n = 0; $n < 100; $n++) {
                    $marker = $prefix.'-'.chr(97 + intdiv($n, 26)).chr(97 + $n % 26);
                    $raw = $this->waPayload($phone, [$this->waText('wamid.qa-parallel-'.$n, $marker, (string) (5493810000000 + $n))]);
                    $this->postWebhook($raw)->assertOk();
                    $this->postWebhook($raw)->assertOk();
                }
            }
            Http::assertNothingSent();
            file_put_contents($script, <<<'PHP'
<?php
require $argv[1].'/vendor/autoload.php';
$app = require $argv[1].'/bootstrap/app.php';
$app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();
if (! $app->environment('testing') || Illuminate\Support\Facades\DB::getDatabaseName() !== $argv[3]) {
    exit(2);
}
config(['queue.default' => 'database', 'queue.connections.database.queue' => $argv[2], 'cache.default' => 'redis',
    'conversations.ai_enabled' => true, 'services.meta.send_enabled' => true,
    'services.meta.whatsapp_sandbox_phone_number_id' => null,
    'services.gemini.railway_environment' => 'staging', 'services.gemini.staging_enabled' => true]);
$app->instance(App\Domain\AgentRuntime\Llm\LlmClient::class, new App\Domain\AgentRuntime\Llm\GeminiChatClient('synthetic-key', 'test-model', 5));
Illuminate\Support\Facades\Http::preventStrayRequests();
Illuminate\Support\Facades\Http::fake([
    'generativelanguage.googleapis.com/*' => fn ($r) => Illuminate\Support\Facades\Http::response([
        'candidates' => [['finishReason' => 'STOP', 'content' => ['parts' => [['text' => 'Recibido: '.$r['contents'][0]['parts'][0]['text']]]]]],
        'usageMetadata' => ['promptTokenCount' => 100, 'candidatesTokenCount' => 20],
    ]),
    'graph.facebook.com/*' => fn () => Illuminate\Support\Facades\Http::response(['messages' => [['id' => 'wamid.qa-parallel-'.Illuminate\Support\Str::uuid()]]]),
]);
$processed = 0;
Illuminate\Support\Facades\Event::listen(Illuminate\Queue\Events\JobProcessed::class, function () use (&$processed) { $processed++; });
$exit = Illuminate\Support\Facades\Artisan::call('queue:work', ['connection' => 'database', '--queue' => $argv[2],
    '--stop-when-empty' => true, '--sleep' => 0, '--tries' => 1, '--max-jobs' => 1000]);
echo json_encode(['processed' => $processed]);
exit($exit);
PHP);
            for ($n = 0; $n < 4; $n++) {
                $worker = new Process([PHP_BINARY, $script, base_path(), $queue, DB::getDatabaseName()], base_path(), [
                    'APP_ENV' => 'testing', 'DB_DATABASE' => DB::getDatabaseName(),
                ]);
                $worker->setTimeout(60);
                $worker->start();
                $workers[] = $worker;
            }
            $activeWorkers = 0;
            foreach ($workers as $worker) {
                $this->assertSame(0, $worker->wait(), $worker->getErrorOutput());
                $activeWorkers += json_decode($worker->getOutput(), true, 512, JSON_THROW_ON_ERROR)['processed'] > 0 ? 1 : 0;
            }
            $this->assertGreaterThanOrEqual(2, $activeWorkers, 'multiple independent workers must actually consume this queue');
            $this->assertSame(0, DB::table('jobs')->where('queue', $queue)->count());
            $this->assertSame(0, DB::table('failed_jobs')->where('queue', $queue)->count());
            foreach ($fixtures as $prefix => $f) {
                $this->assertSame(100, DB::table('chatbot_runs')->where('tenant_id', $f['tenant'])->where('status', 'SUCCEEDED')->count());
                $this->assertSame(100, DB::table('messages')->where('tenant_id', $f['tenant'])->where('direction', 'OUTBOUND')->where('delivery_status', 'SENT')->count());
                foreach (DB::table('conversations')->where('tenant_id', $f['tenant'])->get(['id']) as $conversation) {
                    $messages = DB::table('messages')->where('tenant_id', $f['tenant'])->where('conversation_id', $conversation->id)
                        ->orderBy('sequence')->pluck('text_body')->all();
                    $this->assertCount(2, $messages);
                    $this->assertStringStartsWith($prefix.'-', $messages[0]);
                    $this->assertSame('Recibido: '.$messages[0], $messages[1]);
                }
            }
        } finally {
            foreach ($workers as $worker) {
                if ($worker->isRunning()) {
                    $worker->stop(1);
                }
            }
            unlink($script);
            DB::table('jobs')->where('queue', $queue)->delete();
            DB::table('failed_jobs')->where('queue', $queue)->delete();
            $this->deleteSyntheticTenants($tenants);
        }
    }
}
