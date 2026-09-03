<?php

namespace App\Domain\CRM\Http\Controllers;

use App\Domain\CRM\Exceptions\IdempotencyConflict;
use App\Domain\CRM\Exceptions\PublicLeadRejected;
use App\Domain\CRM\Http\Requests\PublicLeadRequest;
use App\Domain\CRM\Http\Resources\PublicLeadResource;
use App\Domain\CRM\Services\PublicLeadService;
use App\Domain\Tenancy\TenantContext;
use Illuminate\Http\JsonResponse;

final class PublicLeadController
{
    public function __invoke(
        PublicLeadRequest $request,
        TenantContext $tenantContext,
        PublicLeadService $service,
    ): JsonResponse {
        try {
            $result = $service->submit(
                tenantId: $tenantContext->id(),
                payload: $request->payload(),
                idempotencyKey: $request->idempotencyKey(),
            );
        } catch (IdempotencyConflict) {
            return response()->json([
                'error' => [
                    'code' => 'IDEMPOTENCY_CONFLICT',
                    'message' => 'The idempotency key was already used with a different payload.',
                ],
            ], 409);
        } catch (PublicLeadRejected) {
            return response()->json([
                'error' => [
                    'code' => 'PUBLIC_LEAD_REJECTED',
                    'message' => 'The lead submission could not be accepted.',
                ],
            ], 422);
        }

        return (new PublicLeadResource($result))
            ->response()
            ->setStatusCode($result->replayed ? 200 : 201);
    }
}
