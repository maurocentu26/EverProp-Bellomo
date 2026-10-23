<?php

namespace App\Console\Commands;

use App\Domain\Inventory\Services\ProjectLanding;
use App\Domain\Tenancy\Models\Tenant;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Validator;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

final class ImportLandingAssets extends Command
{
    protected $signature = 'everprop:landing-assets {manifest : JSON aprobado con tenant_public_id y assets}';

    protected $description = 'Registra referencias públicas R2 aprobadas por UUID; no sube ni borra archivos.';

    public function handle(): int
    {
        $raw = file_get_contents($this->argument('manifest'));
        $data = json_decode($raw === false ? '' : $raw, true, flags: JSON_THROW_ON_ERROR);
        $data = Validator::make($data, [
            'tenant_public_id' => ['required', 'uuid'], 'assets' => ['required', 'array', 'list', 'max:10000'],
            'assets.*' => ['required', 'array:project_public_id,url,mime_type,title'],
            'assets.*.project_public_id' => ['required', 'uuid'], 'assets.*.url' => ['required', 'string', 'max:2048'],
            'assets.*.title' => ['required', 'string', 'max:160'],
            'assets.*.mime_type' => ['required', Rule::in(['image/jpeg', 'image/png', 'image/webp', 'image/avif', 'application/pdf'])],
        ])->validate();
        $tenant = Tenant::query()->where('public_id', $data['tenant_public_id'])->firstOrFail();
        DB::transaction(function () use ($data, $tenant): void {
            foreach ($data['assets'] as $asset) {
                $extension = strtolower(pathinfo(rawurldecode($asset['url']), PATHINFO_EXTENSION));
                $expected = match ($extension) {
                    'jpg', 'jpeg' => 'image/jpeg', 'png' => 'image/png', 'webp' => 'image/webp', 'avif' => 'image/avif', 'pdf' => 'application/pdf', default => null
                };
                if (! ProjectLanding::validAssetUrl($asset['url']) || $expected !== $asset['mime_type']) {
                    throw ValidationException::withMessages(['assets' => 'URL o tipo de archivo no permitido.']);
                }
                $project = DB::table('projects')->where('tenant_id', $tenant->id)->where('public_id', $asset['project_public_id'])->whereNull('deleted_at')->lockForUpdate()->first();
                if ($project === null) {
                    throw ValidationException::withMessages(['assets' => 'El proyecto no existe en este tenant.']);
                }
                DB::table('project_landing_assets')->updateOrInsert([
                    'tenant_id' => $tenant->id, 'project_id' => $project->id, 'url' => $asset['url'],
                ], ['title' => $asset['title'], 'mime_type' => $asset['mime_type']]);
            }
        });
        $this->info('Referencias registradas. No se publicó ningún proyecto.');

        return self::SUCCESS;
    }
}
