<?php

namespace App\Domain\Inventory\Services;

use App\Domain\Inventory\Models\Project;
use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Validator;
use Illuminate\Validation\Rule;

final class ProjectLanding
{
    public const ASSET_PREFIX = 'https://pub-6e84e10f99f7480da92cffa0fbe4b8b3.r2.dev/assets/';

    public static function validAssetUrl(string $url): bool
    {
        if (! str_starts_with($url, self::ASSET_PREFIX) || preg_match('/[?#\\\\\s]/', $url)) {
            return false;
        }
        $path = substr($url, strlen(self::ASSET_PREFIX));
        $decoded = rawurldecode($path);

        return $path !== '' && ! preg_match('/%(?![a-fA-F0-9]{2})/', $path)
            && ! preg_match('/[\\\\\x00-\x1f]/', $decoded)
            && ! in_array('..', explode('/', $decoded), true)
            && implode('/', array_map('rawurlencode', explode('/', $decoded))) === $path;
    }

    /** @return array<string, mixed> */
    public function configuration(Project $project, ?object $row = null): array
    {
        $row ??= DB::table('project_landing')->where('tenant_id', $project->tenant_id)->where('project_id', $project->id)->first();
        $data = $row ? json_decode($row->content, true, flags: JSON_THROW_ON_ERROR) : [
            'name' => $project->name, 'summary' => '', 'description' => $project->description ?? '',
            'category' => match ($project->project_type->value) {
                'BUILDING' => 'HUASI', 'LAND_DEVELOPMENT' => 'LAND_DEVELOPMENT', default => 'COMMERCIAL'
            },
            'location' => ['city' => $project->city, 'province' => $project->province, 'address' => $project->address],
            'status_label' => null, 'is_featured' => false, 'featured_order' => 0,
            'cover' => null, 'logo' => null, 'gallery' => [], 'features' => [], 'documents' => [],
        ];

        return array_merge($data, [
            'public_id' => $project->public_id, 'slug' => $row->slug ?? '',
            'is_visible' => (bool) ($row->is_visible ?? false), 'sort_order' => (int) ($row->sort_order ?? 0),
            'updated_at' => $row ? CarbonImmutable::parse($row->updated_at, 'UTC')->toISOString() : $project->updated_at?->toISOString(),
        ]);
    }

    /** @return array<int, object> */
    public function assets(Project $project): array
    {
        return DB::table('project_landing_assets')->where('tenant_id', $project->tenant_id)
            ->where('project_id', $project->id)->orderBy('id')->get(['url', 'mime_type', 'title'])->all();
    }

    /** @param array<string, mixed> $input
     * @return array<string, mixed>
     */
    public function validate(Project $project, array $input, ?object $existing): array
    {
        $published = ($input['is_visible'] ?? false) === true;
        $text = $published ? 'required' : 'present';
        $assetRows = $this->assets($project);
        $asset = static function (string $attribute, mixed $value, \Closure $fail) use ($assetRows): void {
            $document = str_starts_with($attribute, 'documents.');
            $allowed = array_filter($assetRows, static fn ($row) => $row->url === $value
                && ($document ? $row->mime_type === 'application/pdf' : in_array($row->mime_type, ['image/jpeg', 'image/png', 'image/webp', 'image/avif'], true)));
            if (! is_string($value) || ! self::validAssetUrl($value) || $allowed === []) {
                $fail('Seleccioná un archivo público aprobado de este proyecto.');
            }
        };
        $plain = static function (string $attribute, mixed $value, \Closure $fail): void {
            if (is_string($value) && $value !== strip_tags($value)) {
                $fail('Usá texto plano, sin HTML.');
            }
        };
        $rules = [
            'tenant_id' => ['prohibited'], 'public_id' => ['prohibited'], 'updated_at' => ['prohibited'],
            'is_visible' => ['required', 'boolean', static function ($a, $v, $fail): void {
                if (! is_bool($v)) {
                    $fail('Usá un booleano JSON.');
                }
            }],
            'is_featured' => ['required', 'boolean', static function ($a, $v, $fail): void {
                if (! is_bool($v)) {
                    $fail('Usá un booleano JSON.');
                }
            }],
            'slug' => [$text, 'nullable', 'string', 'max:120', 'regex:/^[a-z0-9]+(?:-[a-z0-9]+)*$/',
                Rule::unique('project_landing')->where('tenant_id', $project->tenant_id)->ignore($existing?->id)],
            'name' => [$text, 'nullable', 'string', 'max:160', $plain],
            'summary' => [$text, 'nullable', 'string', 'max:400', $plain],
            'description' => ['present', 'nullable', 'string', 'max:20000', $plain],
            'category' => [$text, 'nullable', Rule::in(['HUASI', 'LAND_DEVELOPMENT', 'COMMERCIAL'])],
            'location' => ['required', 'array:city,province,address'],
            'location.city' => [$text, 'nullable', 'string', 'max:160', $plain],
            'location.province' => [$text, 'nullable', 'string', 'max:160', $plain],
            'location.address' => ['present', 'nullable', 'string', 'max:300', $plain],
            'status_label' => ['present', 'nullable', 'string', 'max:100', $plain],
            'sort_order' => ['required', 'integer', 'min:0', 'max:4294967295'],
            'featured_order' => ['required', 'integer', 'min:0', 'max:4294967295'],
            'cover' => ['present', 'nullable', 'array:url,alt,kind', 'required_array_keys:url,alt,kind'], 'logo' => ['present', 'nullable', 'array:url,alt', 'required_array_keys:url,alt'],
            'gallery' => ['present', 'array', 'list', 'max:100'],
            'gallery.*' => ['required', 'array:url,alt,kind'],
            'features' => ['present', 'array', 'list', 'max:100'], 'features.*' => ['required', 'string', 'max:300', $plain],
            'documents' => ['present', 'array', 'list', 'max:30'], 'documents.*' => ['required', 'array:title,url'],
            'documents.*.title' => ['required', 'string', 'max:160', $plain], 'documents.*.url' => ['required', 'string', 'max:2048', $asset],
        ];
        foreach (['cover', 'logo', 'gallery.*'] as $prefix) {
            $rules[$prefix.'.url'] = ['required_with:'.$prefix, 'string', 'max:2048', $asset];
            $rules[$prefix.'.alt'] = ['required_with:'.$prefix, 'string', 'max:300', $plain];
            if ($prefix !== 'logo') {
                $rules[$prefix.'.kind'] = ['required_with:'.$prefix, Rule::in(['PHOTO', 'RENDER'])];
            }
        }
        $validator = Validator::make($input, $rules);
        $validator->after(static function ($validator) use ($input, $existing): void {
            if (($input['is_visible'] ?? false) && ($input['is_featured'] ?? false) && empty($input['cover'])) {
                $validator->errors()->add('cover', 'Un destacado necesita portada.');
            }
            if ($existing?->first_published_at !== null && ($input['slug'] ?? null) !== $existing->slug) {
                $validator->errors()->add('slug', 'La URL no cambia después de la primera publicación.');
            }
        });
        $data = $validator->validate();
        $data['description'] ??= '';
        $data['is_visible'] = (bool) $data['is_visible'];
        $data['is_featured'] = $data['is_visible'] && (bool) $data['is_featured'];
        $data['sort_order'] = (int) $data['sort_order'];
        $data['featured_order'] = (int) $data['featured_order'];

        return $data;
    }
}
