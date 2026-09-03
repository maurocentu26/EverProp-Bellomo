<?php

namespace App\Domain\Integrations\Http\Resources;

use App\Domain\Integrations\Data\WebhookReceiptAcceptance;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/** @mixin WebhookReceiptAcceptance */
final class WebhookReceiptResource extends JsonResource
{
    /** @return array<string, mixed> */
    public function toArray(Request $request): array
    {
        return [
            'accepted' => true,
            'status' => $this->status,
            'idempotent_replay' => $this->replayed,
        ];
    }
}
