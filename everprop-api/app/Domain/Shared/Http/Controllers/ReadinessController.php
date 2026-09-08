<?php

namespace App\Domain\Shared\Http\Controllers;

use App\Support\ProductionDependencies;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\Log;
use Throwable;

final class ReadinessController
{
    public function __invoke(): JsonResponse
    {
        try {
            ProductionDependencies::check();

            return response()->json(['status' => 'ready']);
        } catch (Throwable $exception) {
            Log::warning('Readiness dependency check failed.', [
                'exception' => $exception::class,
            ]);

            return response()->json(['status' => 'unavailable'], 503);
        }
    }
}
