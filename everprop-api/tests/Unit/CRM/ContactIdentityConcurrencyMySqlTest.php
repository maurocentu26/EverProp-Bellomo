<?php

namespace Tests\Unit\CRM;

use App\Domain\CRM\Services\ContactIdentityResolver;
use App\Domain\CRM\Services\PublicLeadService;
use Carbon\CarbonImmutable;
use Illuminate\Database\DeadlockException;
use Illuminate\Database\QueryException;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use PDOException;
use PHPUnit\Framework\Attributes\Group;
use Tests\TestCase;

/**
 * EVP-129: real concurrent processes (pcntl_fork) against MySQL. Each child opens its own connection, waits on a
 * shared start instant and runs the production code path. CONTACT_LOAD_N raises the burst (e.g. 100) for load runs.
 */
#[Group('mysql')]
final class ContactIdentityConcurrencyMySqlTest extends TestCase
{
    private int $tenantId;

    private int $otherTenantId;

    private int $identityInserts = 0;

    protected function setUp(): void
    {
        parent::setUp();

        if (DB::getDriverName() !== 'mysql') {
            self::markTestSkipped('Needs MySQL.');
        }

        foreach (['tenantId', 'otherTenantId'] as $property) {
            $this->{$property} = (int) DB::table('tenants')->insertGetId([
                'public_id' => (string) Str::uuid(),
                'name' => 'EVP-129 concurrency test',
                'slug' => 'evp129-'.strtolower(Str::random(12)),
                'timezone' => 'UTC',
                'status' => 'ACTIVE',
            ]);
        }
        DB::table('pipeline_stages')->insert([
            'tenant_id' => $this->tenantId, 'code' => 'NEW', 'name' => 'New', 'category' => 'OPEN', 'position' => 1, 'is_active' => 1,
        ]);
    }

    protected function tearDown(): void
    {
        foreach (array_filter([$this->tenantId ?? null, $this->otherTenantId ?? null]) as $tenantId) {
            foreach (['contact_consents', 'lead_touchpoints', 'domain_outbox', 'lead_assignments', 'lead_properties', 'leads',
                'contact_identities', 'contacts', 'pipeline_stages'] as $table) {
                DB::table($table)->where('tenant_id', $tenantId)->delete();
            }
            DB::table('tenants')->where('id', $tenantId)->delete();
        }

        parent::tearDown();
    }

    public function test_simultaneous_leads_from_different_people_all_succeed_without_duplicates(): void
    {
        $n = max(2, (int) (getenv('CONTACT_LOAD_N') ?: 50));
        $tenantId = $this->tenantId;

        $errors = $this->burst($n, function (int $i) use ($tenantId): void {
            app(PublicLeadService::class)->submit($tenantId, [
                'contact' => ['display_name' => 'Load '.$i, 'email' => "load-{$i}@example.test"],
                'identity' => ['channel_type' => 'EMAIL', 'provider_user_id' => "load-{$i}@example.test"],
                'lead' => ['source_channel' => 'WEB_FORM', 'source_kind' => 'CONTACT_FORM', 'priority' => 'NORMAL'],
                'touchpoint' => ['type' => 'WEB_FORM'],
            ], 'evp129-load-'.$i);
        });

        self::assertSame([], $errors);
        self::assertSame($n, DB::table('contacts')->where('tenant_id', $tenantId)->count());
        self::assertSame($n, DB::table('contact_identities')->where('tenant_id', $tenantId)->count());
        self::assertSame($n, DB::table('leads')->where('tenant_id', $tenantId)->count());
        self::assertSame($n, DB::table('lead_touchpoints')->where('tenant_id', $tenantId)->count());
    }

    public function test_simultaneous_resolutions_of_the_same_person_create_one_contact_and_one_identity(): void
    {
        $tenantId = $this->tenantId;

        $errors = $this->burst(10, function () use ($tenantId): void {
            app(ContactIdentityResolver::class)->resolve(
                $tenantId,
                ['display_name' => 'Same person'],
                ['channel_type' => 'EMAIL', 'provider_user_id' => 'Same.Person@example.test'],
                CarbonImmutable::now('UTC'),
            );
        });

        self::assertSame([], $errors);
        self::assertSame(1, DB::table('contacts')->where('tenant_id', $tenantId)->count());
        self::assertSame(1, DB::table('contact_identities')->where('tenant_id', $tenantId)->count());
    }

    public function test_the_same_identity_resolved_simultaneously_in_two_tenants_stays_separate(): void
    {
        $tenants = [$this->tenantId, $this->otherTenantId];

        $errors = $this->burst(10, function (int $i) use ($tenants): void {
            app(ContactIdentityResolver::class)->resolve(
                $tenants[$i % 2],
                [],
                ['channel_type' => 'EMAIL', 'provider_user_id' => 'Same@ex.test'],
                CarbonImmutable::now('UTC'),
            );
        });

        self::assertSame([], $errors);
        $this->assertOneContactPerTenant('EMAIL', 'same@ex.test');
    }

    public function test_the_same_web_chat_visitor_id_in_two_tenants_gets_one_contact_per_tenant(): void
    {
        foreach ([$this->tenantId, $this->otherTenantId, $this->tenantId] as $tenantId) {
            app(ContactIdentityResolver::class)->resolve(
                $tenantId,
                [],
                ['channel_type' => 'WEB_CHAT', 'provider_user_id' => 'visitor:shared'],
                CarbonImmutable::now('UTC'),
            );
        }

        $this->assertOneContactPerTenant('WEB_CHAT', 'visitor:shared');
    }

    public function test_a_deadlock_reruns_the_whole_resolution_without_leaving_an_orphan_contact(): void
    {
        $this->failIdentityInserts('40001', 1213, 'Deadlock found when trying to get lock; try restarting transaction', 1);

        $contact = $this->resolveRetryProbe();

        self::assertTrue($contact['created']);
        self::assertSame(2, $this->identityInserts);
        self::assertSame(1, DB::table('contacts')->where('tenant_id', $this->tenantId)->count());
        self::assertSame($contact['id'], (int) DB::table('contact_identities')->where('tenant_id', $this->tenantId)->value('contact_id'));
    }

    public function test_a_lock_wait_timeout_is_retried_only_once(): void
    {
        $this->failIdentityInserts('HY000', 1205, 'Lock wait timeout exceeded; try restarting transaction', PHP_INT_MAX);

        try {
            $this->resolveRetryProbe();
            self::fail('A second lock wait timeout must reach the caller.');
        } catch (QueryException $exception) {
            self::assertSame(1205, (int) $exception->errorInfo[1]);
        }
        self::assertSame(2, $this->identityInserts);
        self::assertSame(0, DB::table('contacts')->where('tenant_id', $this->tenantId)->count());
    }

    public function test_a_deadlock_inside_a_caller_transaction_is_not_retried(): void
    {
        $this->failIdentityInserts('40001', 1213, 'Deadlock found when trying to get lock; try restarting transaction', 1);

        try {
            DB::transaction(fn () => $this->resolveRetryProbe());
            self::fail('The deadlock must reach the caller, whose transaction InnoDB already rolled back.');
        } catch (DeadlockException) {
            // expected: the caller owns the retry
        }
        self::assertSame(1, $this->identityInserts);
        self::assertSame(0, DB::table('contacts')->where('tenant_id', $this->tenantId)->count());
    }

    public function test_a_lost_race_inside_a_caller_transaction_is_rethrown_at_the_first_attempt(): void
    {
        $this->failIdentityInserts('23000', 1062, "Duplicate entry for key 'uq_contact_identities_provider'", PHP_INT_MAX);

        try {
            DB::transaction(fn () => $this->resolveRetryProbe());
            self::fail('The caller snapshot cannot see the winner: the 1062 must reach the caller.');
        } catch (QueryException $exception) {
            self::assertSame(1062, (int) $exception->errorInfo[1]);
        }
        self::assertSame(1, $this->identityInserts);
        self::assertSame(0, DB::table('contacts')->where('tenant_id', $this->tenantId)->count());
    }

    private function assertOneContactPerTenant(string $channel, string $providerId): void
    {
        $identities = DB::table('contact_identities as i')
            ->join('contacts as c', 'c.id', '=', 'i.contact_id')
            ->whereIn('i.tenant_id', [$this->tenantId, $this->otherTenantId])
            ->where('i.channel_type', $channel)
            ->where('i.provider_user_id', $providerId)
            ->get(['i.tenant_id', 'i.contact_id', 'c.tenant_id as contact_tenant_id']);

        self::assertCount(2, $identities);
        self::assertNotSame($identities[0]->contact_id, $identities[1]->contact_id);
        foreach ($identities as $identity) {
            self::assertSame((int) $identity->tenant_id, (int) $identity->contact_tenant_id);
        }
        foreach ([$this->tenantId, $this->otherTenantId] as $tenantId) {
            self::assertSame(1, DB::table('contacts')->where('tenant_id', $tenantId)->count());
            self::assertSame(1, DB::table('contact_identities')->where('tenant_id', $tenantId)->count());
        }
    }

    /** @return array{id: int, public_id: string, created: bool} */
    private function resolveRetryProbe(): array
    {
        return app(ContactIdentityResolver::class)->resolve(
            $this->tenantId,
            [],
            ['channel_type' => 'WEB_CHAT', 'provider_user_id' => 'visitor:retry-probe'],
            CarbonImmutable::now('UTC'),
        );
    }

    /** Counts every identity insert and makes the first $times of them fail with the given MySQL error. */
    private function failIdentityInserts(string $sqlState, int $code, string $message, int $times): void
    {
        DB::connection()->beforeExecuting(function (string $sql) use ($sqlState, $code, $message, $times): void {
            if (str_starts_with($sql, 'insert into `contact_identities`') && ++$this->identityInserts <= $times) {
                $pdo = new PDOException("SQLSTATE[$sqlState]: $code $message");
                $pdo->errorInfo = [$sqlState, $code, $message];
                throw new QueryException('mysql', $sql, [], $pdo);
            }
        });
    }

    /**
     * Forks $n children that run $work at the same instant; returns the error messages of the failed ones.
     *
     * @param  callable(int): void  $work
     * @return list<string>
     */
    private function burst(int $n, callable $work): array
    {
        if (! function_exists('pcntl_fork')) {
            self::markTestSkipped('Needs pcntl.');
        }

        $dir = sys_get_temp_dir().'/evp129-'.Str::random(8);
        mkdir($dir);
        $startAt = microtime(true) + 1.5;
        DB::disconnect(); // children must not share (and later close) the parent's socket
        $pids = [];

        for ($i = 0; $i < $n; $i++) {
            $pid = pcntl_fork();
            if ($pid === -1) {
                foreach ($pids as $started) {
                    pcntl_waitpid($started, $status);
                }
                self::fail('fork failed');
            }
            if ($pid === 0) {
                $result = 'ok';
                try {
                    DB::select('select 1'); // connect before the start line, so the burst hits the locks, not the handshake
                    if (microtime(true) < $startAt) {
                        time_sleep_until($startAt);
                    }
                    $work($i);
                } catch (\Throwable $e) {
                    $result = $e::class.': '.$e->getMessage();
                }
                file_put_contents("$dir/$i", $result);
                posix_kill(posix_getpid(), SIGKILL); // skip PHPUnit/Laravel shutdown in the child
            }
            $pids[] = $pid;
        }

        foreach ($pids as $pid) {
            pcntl_waitpid($pid, $status);
        }

        $errors = [];
        for ($i = 0; $i < $n; $i++) {
            $result = @file_get_contents("$dir/$i");
            if ($result !== 'ok') {
                $errors[] = $result === false ? "child $i died without a result" : $result;
            }
            @unlink("$dir/$i");
        }
        rmdir($dir);
        DB::reconnect();

        return $errors;
    }
}
