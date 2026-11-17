<?php

namespace App\Domain\Conversations\Jobs;

use App\Domain\Conversations\Notifications\ConversationNeedsAttention;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Support\Facades\Log;

/** EVP-144: retries a "needs a person" alert whose inline attempts failed, on the fast outbound lane. */
final class SendConversationAlert implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable;

    public int $tries = 5;

    /** @var list<int> */
    public array $backoff = [10, 30, 60, 120];

    /** @param array{tenant_id: int, public_id: string, controlled_by_user_id: int|string|null, assigned_user_id: int|string|null, epoch: int|null, reason: string|null, key: string} $alert */
    public function __construct(public readonly array $alert)
    {
        $this->onQueue((string) config('queue.lanes.outbound'));
    }

    public function handle(): void
    {
        ConversationNeedsAttention::deliver($this->alert); // idempotent per recipient, drops itself if control moved
    }

    /** Out of retries: an operational signal with ids only (the alert itself never carries client data). */
    public function failed(?\Throwable $error): void
    {
        Log::warning('conversation_alert_gave_up', ['tenant_id' => $this->alert['tenant_id'], 'conversation' => $this->alert['public_id']]);
    }
}
