<?php

namespace App\Support;

use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Redis;

final class ProductionDependencies
{
    public static function check(): void
    {
        DB::select('SELECT 1');
        $redis = [];
        if (config('cache.default') === 'redis') {
            $redis[] = config('cache.stores.redis.connection', 'cache');
            $redis[] = config('cache.stores.redis.lock_connection', 'default');
        } elseif (config('cache.default') === 'database') {
            DB::connection(config('cache.stores.database.connection'))->table(config('cache.stores.database.table', 'cache'))->limit(1)->get(['key']);
            DB::connection(config('cache.stores.database.lock_connection'))->table(config('cache.stores.database.lock_table') ?: 'cache_locks')->limit(1)->get(['key']);
        }
        if (config('session.driver') === 'redis') {
            $redis[] = config('session.connection') ?: 'default';
        } elseif (config('session.driver') === 'database') {
            DB::connection(config('session.connection'))->table(config('session.table', 'sessions'))->limit(1)->get(['id']);
        }
        if (config('queue.default') === 'redis') {
            $redis[] = config('queue.connections.redis.connection', 'queue');
        }
        foreach (array_unique($redis) as $connection) {
            Redis::connection($connection)->ping();
        }
    }
}
