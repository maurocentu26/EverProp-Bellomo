<?php

namespace App\Domain\CRM\Http\Resources;

use App\Domain\CRM\Data\PublicLeadSubmission;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/** @mixin PublicLeadSubmission */
final class PublicLeadResource extends JsonResource
{
    /** @return array<string, mixed> */
    public function toArray(Request $request): array
    {
        return [
            'lead_id' => $this->leadPublicId,
            'lead_created' => $this->leadCreated,
            'assigned' => $this->assigned,
            'property_linked' => $this->propertyLinked,
            'idempotent_replay' => $this->replayed,
        ];
    }
}
