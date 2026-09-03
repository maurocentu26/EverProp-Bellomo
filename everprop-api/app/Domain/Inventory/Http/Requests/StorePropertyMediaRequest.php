<?php

namespace App\Domain\Inventory\Http\Requests;

use App\Domain\Inventory\Enums\PropertyMediaType;
use Illuminate\Validation\Rule;

final class StorePropertyMediaRequest extends InventoryRequest
{
    /** @return array<string, mixed> */
    public function rules(): array
    {
        return $this->serverOwnedRules() + [
            'property_id' => ['prohibited'],
            'metadata_json' => ['prohibited'],
            'media_type' => ['required', Rule::enum(PropertyMediaType::class)],
            'file' => ['nullable', 'required_without:url', 'file', 'max:15360', 'mimetypes:image/jpeg,image/png,image/webp,image/avif,application/pdf,video/mp4,video/webm'],
            'url' => ['nullable', 'required_without:file', 'url:https', 'max:2048'],
            'thumbnail_url' => ['nullable', 'url:https', 'max:2048'],
            'alt_text' => ['nullable', 'string', 'max:500'],
            'caption' => ['nullable', 'string', 'max:1000'],
            'sort_order' => ['sometimes', 'integer', 'min:0'],
            'is_primary' => ['sometimes', 'boolean'],
        ];
    }

    /** @return array<callable> */
    public function after(): array
    {
        return [function ($validator): void {
            $type = $this->input('media_type');

            if ($this->hasFile('file') && $this->filled('url')) {
                $validator->errors()->add('url', 'Provide either file or url, not both.');
            }

            if ($this->hasFile('file') && $type === PropertyMediaType::VIRTUAL_TOUR->value) {
                $validator->errors()->add('file', 'Virtual tours must use an HTTPS URL.');
            }

            if ($this->filled('url') && ! in_array($type, [PropertyMediaType::VIDEO->value, PropertyMediaType::VIRTUAL_TOUR->value], true)) {
                $validator->errors()->add('url', 'External URLs are allowed only for videos and virtual tours.');
            }
        }];
    }
}
