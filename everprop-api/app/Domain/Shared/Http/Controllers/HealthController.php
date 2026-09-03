<?php

namespace App\Domain\Shared\Http\Controllers;

use Illuminate\Http\JsonResponse;

final class HealthController
{
    public function __invoke(): JsonResponse
    {
        return response()->json(['status' => 'up']);
    }
}
