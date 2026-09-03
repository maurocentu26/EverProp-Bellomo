<?php

namespace App\Domain\Inventory\Http\Resources;

use App\Domain\Inventory\Models\PropertyMedia;
use App\Domain\Inventory\Services\TenantMediaService;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/** @mixin PropertyMedia */
final class PropertyMediaResource extends JsonResource
{
    /** @return array<string, mixed> */
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->when($request->user() !== null, $this->id),
            'media_type' => $this->media_type->value,
            'url' => app(TenantMediaService::class)->temporaryUrl($this->resource),
            'thumbnail_url' => $this->thumbnail_url,
            'alt_text' => $this->alt_text,
            'caption' => $this->caption,
            'sort_order' => $this->sort_order,
            'is_primary' => $this->is_primary,
        ];
    }
}
