<?php

namespace Tests\Feature\Conversations;

use App\Domain\Conversations\Jobs\SendConversationAlert;
use App\Domain\Conversations\Notifications\ConversationNeedsAttention;
use App\Domain\Identity\Enums\RoleCode;
use App\Domain\Tenancy\Models\Tenant;
use App\Models\User;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Notifications\DatabaseNotification;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Queue;
use Illuminate\Support\Str;
use Tests\TestCase;

/** EVP-144: a transient failure never loses the "needs a person" alert, and no retry ever duplicates or misroutes it. */
final class ConversationAlertRetryTest extends TestCase
{
    use ConversationTestSupport, DatabaseTransactions;

    /** @var array<int, int> How many more inserts fail, per user id (a stand-in for a deadlock or a dropped connection). */
    private array $failures = [];

    protected function setUp(): void
    {
        parent::setUp();
        config(['conversations.web_rate_limit_per_minute' => 10_000, 'conversations.ai_enabled' => false]);
        Queue::fake([SendConversationAlert::class]);
        DatabaseNotification::creating(function (DatabaseNotification $n): void {
            if (($this->failures[$n->notifiable_id] ?? 0) > 0) {
                $this->failures[$n->notifiable_id]--;
                throw new \RuntimeException('transient');
            }
        });
    }

    public function test_a_transient_failure_is_retried_inline_and_delivered_once(): void
    {
        [$tenant, $first, $second] = $this->advisors();
        $conversation = $this->conversation($tenant);
        $this->failures[$first->id] = 1; // after the chat's own alert, so it hits this one

        ConversationNeedsAttention::sendFor($conversation);

        $this->assertSame([1, 1], [$this->alerts($first), $this->alerts($second)]);
        Queue::assertNothingPushed();
    }

    public function test_a_recipient_that_keeps_failing_neither_blocks_the_others_nor_gets_duplicates_on_retry(): void
    {
        [$tenant, $first, $second] = $this->advisors();
        $conversation = $this->conversation($tenant, 'USER_REQUEST: soy Ana López, 1155551234');
        $this->failures[$first->id] = 3; // the FIRST recipient fails every inline try

        ConversationNeedsAttention::sendFor($conversation);

        $this->assertSame([0, 1], [$this->alerts($first), $this->alerts($second)], 'the second one is not blocked');
        $job = $this->queuedJob();
        $this->assertStringNotContainsString('1155551234', json_encode($job->alert), 'the queue holds ids and the reason code only');
        $this->assertSame('USER_REQUEST:', $job->alert['reason']);
        $job->handle();
        $job->handle(); // a duplicate run of the job is harmless
        $this->assertSame([1, 1], [$this->alerts($first), $this->alerts($second)]);
        $this->assertStringContainsString('pidió hablar con un asesor', $first->notifications()->first()->data['message']);
    }

    public function test_a_late_retry_follows_a_reassignment_and_is_dropped_once_control_moved(): void
    {
        [$tenant, $x, $y] = $this->advisors();
        $manager = $this->user($tenant, RoleCode::SALES_MANAGER);
        $conversation = $this->conversation($tenant, 'USER_REQUEST: quiere hablar', $x);
        $this->failures[$x->id] = 3;
        ConversationNeedsAttention::sendFor($conversation);
        $job = $this->queuedJob();

        // Reassigned to Y before the retry runs: X must not get the client's name on their lock screen.
        DB::table('conversations')->where('public_id', $conversation->public_id)->update(['assigned_user_id' => $y->id]);
        $job->handle();
        $this->assertSame([0, 1, 0], [$this->alerts($x), $this->alerts($y), $this->alerts($manager)]);

        // Someone took control meanwhile (new epoch): the stale alert reaches nobody.
        $other = $this->conversation($tenant, 'USER_REQUEST: quiere hablar', $x);
        $this->failures[$x->id] = 3;
        ConversationNeedsAttention::sendFor($other);
        $stale = $this->queuedJob($other->public_id);
        DB::table('conversations')->where('public_id', $other->public_id)->increment('control_epoch');
        $stale->handle();
        $this->assertSame(0, $this->alerts($x) + DB::table('notifications')->where('data', 'like', "%{$other->public_id}%")->count());
    }

    public function test_another_tenants_user_named_as_owner_gets_nothing(): void
    {
        [$tenant, $first, $second] = $this->advisors();
        $outsider = $this->user(Tenant::factory()->create(), RoleCode::SALES_ADVISOR);
        $conversation = $this->conversation($tenant);
        $conversation->controlled_by_user_id = $outsider->id;

        ConversationNeedsAttention::sendFor($conversation);

        $this->assertSame([0, 1, 1], [$this->alerts($outsider), $this->alerts($first), $this->alerts($second)]);
    }

    /** @return array{0: Tenant, 1: User, 2: User} */
    private function advisors(): array
    {
        $tenant = Tenant::factory()->create();

        return [$tenant, $this->user($tenant, RoleCode::SALES_ADVISOR), $this->user($tenant, RoleCode::SALES_ADVISOR)];
    }

    /** A real web conversation waiting for a person; unassigned unless an advisor is given. */
    private function conversation(Tenant $tenant, string $reason = 'USER_REQUEST: quiere hablar', ?User $assigned = null): object
    {
        $integration = (int) DB::table('integration_connections')->insertGetId(['tenant_id' => $tenant->id, 'public_id' => (string) Str::uuid(),
            'provider' => 'WEB', 'name' => 'WEB '.Str::random(6), 'status' => 'ACTIVE', 'access_token_secret_ref' => 'web-'.Str::random(8)]);
        $widget = $this->webChannel($tenant->id, $integration);
        $token = (string) $this->withHeaders($this->tenantHeaders($tenant))
            ->postJson('/api/v1/public/chat/sessions', ['widget_id' => $widget['public_id']])->json('data.token');
        $this->withToken($token)->postJson('/api/v1/public/chat/messages', ['client_message_id' => (string) Str::uuid(), 'text' => 'Hola'])->assertCreated();
        $this->flushHeaders();
        $row = DB::table('conversations')->where('tenant_id', $tenant->id)->latest('id')->first();
        DB::table('conversations')->where('id', $row->id)->update(['assigned_user_id' => $assigned?->id]);
        DB::table('notifications')->where('notifiable_type', User::class)
            ->whereIn('notifiable_id', User::query()->where('tenant_id', $tenant->id)->pluck('id'))->delete(); // the chat's own alerts

        return (object) ['tenant_id' => $tenant->id, 'public_id' => $row->public_id, 'controlled_by_user_id' => null,
            'assigned_user_id' => $assigned?->id, 'reason' => $reason];
    }

    private function queuedJob(?string $publicId = null): SendConversationAlert
    {
        $job = null;
        Queue::assertPushedOn((string) config('queue.lanes.outbound'), SendConversationAlert::class,
            function (SendConversationAlert $pushed) use (&$job, $publicId): bool {
                if ($publicId === null || $pushed->alert['public_id'] === $publicId) {
                    $job = $pushed;
                }

                return true;
            });

        return $job;
    }

    private function alerts(User $user): int
    {
        return $user->notifications()->where('type', ConversationNeedsAttention::class)->count();
    }
}
