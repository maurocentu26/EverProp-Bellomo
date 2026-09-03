<?php

namespace App\Domain\Integrations\Http\Controllers;

use App\Domain\Integrations\Exceptions\WebhookRejected;
use App\Domain\Integrations\Http\Requests\ReceiveWebhookRequest;
use App\Domain\Integrations\Http\Resources\WebhookReceiptResource;
use App\Domain\Integrations\Services\WebhookReceiver;
use App\Domain\Tenancy\TenantContext;
use Illuminate\Http\JsonResponse;

final class ReceiveWebhookController
{
    public function __invoke(
        ReceiveWebhookRequest $request,
        TenantContext $tenantContext,
        WebhookReceiver $receiver,
        string $integrationPublicId,
    ): JsonResponse {
        try {
            $acceptance = $receiver->receive(
                tenantId: $tenantContext->id(),
                integrationPublicId: $integrationPublicId,
                rawPayload: $request->getContent(),
                payload: $request->decodedPayload(),
                timestamp: $request->timestamp(),
                signature: $request->signature(),
                idempotencyKey: $request->idempotencyKey(),
                requestId: $request->requestId(),
                headers: $request->persistedHeaders(),
                remoteIp: $request->ip(),
            );
        } catch (WebhookRejected $exception) {
            return response()->json([
                'error' => [
                    'code' => $exception->publicCode,
                    'message' => $exception->getMessage(),
                ],
            ], $exception->httpStatus);
        }

        return (new WebhookReceiptResource($acceptance))
            ->response()
            ->setStatusCode($acceptance->replayed ? 200 : 202);
    }
}
