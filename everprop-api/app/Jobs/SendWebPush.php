<?php

namespace App\Jobs;

use App\Domain\Identity\Policies\WebPushPolicy;
use App\Domain\Tenancy\Models\Tenant;
use App\Domain\Tenancy\TenantContext;
use App\Models\User;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;
use Illuminate\Support\Facades\Crypt;
use Illuminate\Support\Facades\DB;
use Minishlink\WebPush\Subscription;
use Minishlink\WebPush\WebPush;

final class SendWebPush implements ShouldQueue
{
    use Queueable;

    public int $tries = 3;

    public int $timeout = 30;

    public function __construct(public int $tenantId, public int $userId, public string $notificationId)
    {
        $this->afterCommit();
    }

    public function handle(): void
    {
        if (! config('webpush.private_key') || ! config('webpush.subject')) {
            return;
        }
        $user = User::where('tenant_id', $this->tenantId)->where('id', $this->userId)->where('status', 'ACTIVE')->first();
        if (! $user || ! (new WebPushPolicy)->manage($user, $this->tenantId)) {
            return;
        }
        $tenant = Tenant::find($this->tenantId);
        if (! $tenant) {
            return;
        }
        $context = TenantContext::forTenant($tenant);
        $notification = $user->notifications()->where('id', $this->notificationId)->first();
        if (! $notification || $notification->read_at) {
            return;
        }
        $sender = app(WebPush::class);
        $rows = DB::table('web_push_subscriptions')->where('tenant_id', $context->id())->where('user_id', $user->id)->get();
        foreach ($rows as $row) {
            $subscription = Subscription::create(json_decode(Crypt::decryptString($row->subscription), true));
            // Lock-screen payload deliberately excludes client names and contact details.
            $payload = json_encode(['title' => 'Bellomo', 'body' => 'Tenés una nueva notificación comercial. Abrí el panel para verla.', 'tag' => $notification->id, 'url' => '/admin/notifications']);
            $report = $sender->sendOneNotification($subscription, $payload);
            if ($report->isSubscriptionExpired()) {
                DB::table('web_push_subscriptions')->where('tenant_id', $context->id())->where('user_id', $user->id)->where('id', $row->id)->delete();
            } elseif (! $report->isSuccess()) {
                throw new \RuntimeException('El proveedor push no confirmó la entrega.');
            }
        }
    }
}
