<?php

namespace App\Domain\Shared\Http\Controllers;

use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Redis;
use Throwable;

final class ReadinessController
{
    public function __invoke(): JsonResponse
    {
        try {
            DB::select('SELECT 1');
            Redis::connection()->ping();

            return response()->json(['status' => 'ready']);
        } catch (Throwable $exception) {
            Log::warning('Readiness dependency check failed.', [
                'exception' => $exception::class,
            ]);

            return response()->json(['status' => 'unavailable'], 503);
        }
    }
}
