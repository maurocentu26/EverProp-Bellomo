<?php

namespace Tests\Feature\Conversations;

use App\Domain\AgentRuntime\Jobs\RunAgentJob;
use App\Domain\Conversations\Jobs\DispatchOutboundJob;
use App\Domain\Conversations\Jobs\ProcessMetaWebhookReceipt;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Queue;
use Illuminate\Support\Str;
use Tests\TestCase;

/**
 * EVP-131: in a burst of DMs, webhooks waited ~20 s behind AI turns on the single `default` queue.
 * Each job now has its own lane and the worker consumes them in priority order.
 */
final class QueueLanesTest extends TestCase
{
    use DatabaseTransactions;

    public function test_each_job_lands_on_its_lane_and_the_worker_consumes_them_in_priority_order(): void
    {
        Queue::fake();
        ProcessMetaWebhookReceipt::dispatch(1, 1);
        DispatchOutboundJob::dispatch(1, random_int(1, PHP_INT_MAX)); // unique job: a fixed id could still hold the lock
        RunAgentJob::dispatch(1, 1, 1);
        Queue::assertPushedOn('webhooks', ProcessMetaWebhookReceipt::class);
        Queue::assertPushedOn('outbound', DispatchOutboundJob::class);
        Queue::assertPushedOn('agent', RunAgentJob::class);

        $script = (string) file_get_contents(base_path('docker/production/entrypoint.sh'));
        $this->assertSame(1, preg_match('/QUEUE_WORKER_QUEUES:-([a-z,]+)\}/', $script, $m));
        $this->assertSame([...array_values(config('queue.lanes')), 'default'], explode(',', $m[1]), 'entrypoint order must follow config/queue.php lanes');
        $this->assertStringContainsString('--queue='.$m[1], (string) file_get_contents(base_path('compose.yaml')));
    }

    public function test_a_webhook_queued_after_an_ai_turn_is_processed_first(): void
    {
        $lanes = array_map(fn (string $lane) => 'qa-'.$lane.'-'.Str::uuid(), config('queue.lanes'));
        config(['queue.default' => 'database', 'queue.lanes' => $lanes]);

        RunAgentJob::dispatch(1, 1, 1);
        ProcessMetaWebhookReceipt::dispatch(1, PHP_INT_MAX); // no such receipt: the job is a no-op

        $this->artisan('queue:work', ['connection' => 'database', '--queue' => implode(',', $lanes), '--once' => true, '--sleep' => 0])->assertSuccessful();

        $this->assertSame(0, DB::table('jobs')->where('queue', $lanes['webhooks'])->count(), 'the webhook went first');
        $this->assertSame(1, DB::table('jobs')->where('queue', $lanes['agent'])->count(), 'the AI turn waits');
    }
}
