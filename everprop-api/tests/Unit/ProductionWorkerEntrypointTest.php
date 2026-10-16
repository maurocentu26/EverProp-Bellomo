<?php

namespace Tests\Unit;

use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;

/**
 * The production worker must consume the connection producers write to. It used to hard-code redis,
 * so QUEUE_CONNECTION=database (supported by production-check and go-live.md) left jobs unconsumed:
 * human replies and assistant turns would never be sent.
 */
final class ProductionWorkerEntrypointTest extends TestCase
{
    /** @return array<string, array{array<string, string>, ?string}> */
    public static function environments(): array
    {
        return [
            'default is redis' => [[], 'redis'],
            'database queue' => [['QUEUE_CONNECTION' => 'database'], 'database'],
            'redis queue' => [['QUEUE_CONNECTION' => 'redis'], 'redis'],
            'explicit worker override' => [['QUEUE_CONNECTION' => 'redis', 'QUEUE_WORKER_CONNECTION' => 'database'], 'database'],
            'sync has no worker' => [['QUEUE_CONNECTION' => 'sync'], null],
        ];
    }

    /** @param array<string, string> $env */
    #[DataProvider('environments')]
    public function test_worker_consumes_the_configured_connection(array $env, ?string $expected): void
    {
        $script = (string) file_get_contents(dirname(__DIR__, 2).'/docker/production/entrypoint.sh');
        $this->assertSame(1, preg_match('/^    worker\)\s*(.*?);;\s*\n    scheduler\)/ms', $script, $m), 'worker branch not found');

        // php is stubbed as a shell function, not a temp executable: CI runs this inside the hardened container,
        // where /tmp is mounted noexec. `exec` cannot replace the shell with a function, so it is dropped here.
        $branch = 'php() { echo "php $*"; }; '.str_replace('exec php ', 'php ', $m[1]);

        $process = proc_open(['sh', '-c', $branch], [1 => ['pipe', 'w'], 2 => ['pipe', 'w']], $pipes, null, ['PATH' => '/usr/bin:/bin'] + $env);
        $this->assertIsResource($process);
        $out = stream_get_contents($pipes[1]);
        $err = stream_get_contents($pipes[2]);
        $code = proc_close($process);

        if ($expected === null) {
            $this->assertNotSame(0, $code);
            $this->assertStringContainsString('unsupported connection', (string) $err);

            return;
        }
        $this->assertSame(0, $code, (string) $err);
        $this->assertStringStartsWith("php artisan queue:work {$expected} ", (string) $out);
    }
}
