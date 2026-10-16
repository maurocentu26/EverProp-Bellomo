<?php

namespace App\Domain\Conversations\Jobs;

use App\Domain\Conversations\Services\OutboundDispatcher;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldBeUnique;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;

final class DispatchOutboundJob implements ShouldBeUnique, ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable;

    public int $tries = 1; // retries are scheduled by the dispatcher itself (RETRY + scheduled_at)

    // The unique lock must expire, otherwise a lost queue message blocks every re-enqueue by the
    // reconciler. The claim itself is idempotent, so a duplicate run is harmless.
    public int $uniqueFor = 120;

    public function __construct(public readonly int $tenantId, public readonly int $outboundJobId)
    {
        $this->afterCommit();
    }

    public function uniqueId(): string
    {
        return 'outbound:'.$this->tenantId.':'.$this->outboundJobId;
    }

    public function handle(OutboundDispatcher $dispatcher): void
    {
        $dispatcher->dispatch($this->tenantId, $this->outboundJobId);
    }
}
