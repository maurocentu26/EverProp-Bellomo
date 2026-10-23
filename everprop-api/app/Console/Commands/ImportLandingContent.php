<?php

namespace App\Console\Commands;

use App\Domain\Inventory\Models\Project;
use App\Domain\Inventory\Services\ProjectLanding;
use App\Domain\Tenancy\Models\Tenant;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Validator;

final class ImportLandingContent extends Command
{
    protected $signature = 'everprop:landing-content {manifest} {--apply : Guardar borradores únicamente en la base local}';

    protected $description = 'Precarga contenido editorial aprobado; conserva toda presentación existente y nunca publica.';

    public function handle(ProjectLanding $landing): int
    {
        if (! app()->environment(['local', 'testing']) || ! in_array(config('database.connections.mysql.host'), ['everprop-api-mysql', 'localhost', '127.0.0.1'], true)) {
            $this->error('Este importador solo admite la base local.');

            return self::FAILURE;
        }
        $path = $this->argument('manifest');
        $manifest = json_decode(file_get_contents($path), true, flags: JSON_THROW_ON_ERROR);
        $data = Validator::make($manifest, [
            'tenant_public_id' => ['required', 'uuid'],
            'projects' => ['required', 'array', 'list', 'max:1000'],
            'projects.*' => ['required', 'array:public_id,presentation'],
            'projects.*.public_id' => ['required', 'uuid', 'distinct'],
            'projects.*.presentation' => ['required', 'array'],
            'projects.*.presentation.is_visible' => ['required', 'declined'],
            'projects.*.presentation.is_featured' => ['required', 'declined'],
        ])->validate();
        $tenant = Tenant::query()->where('public_id', $data['tenant_public_id'])->firstOrFail();
        $created = $skipped = 0;
        DB::beginTransaction();
        try {
            // Reuse approved URL/type/tenant validation; nested writes roll back with the content.
            $this->callSilent('everprop:landing-assets', ['manifest' => $path]);
            foreach ($data['projects'] as $entry) {
                $project = Project::withoutGlobalScopes()->where('tenant_id', $tenant->id)
                    ->where('public_id', $entry['public_id'])->whereNull('deleted_at')->lockForUpdate()->firstOrFail();
                $existing = DB::table('project_landing')->where('tenant_id', $tenant->id)->where('project_id', $project->id)->first();
                if ($existing !== null) {
                    $skipped++;

                    continue;
                }
                $content = $landing->validate($project, $entry['presentation'], null);
                $slug = $content['slug'] ?: null;
                $order = $content['sort_order'];
                unset($content['slug'], $content['sort_order'], $content['is_visible']);
                DB::table('project_landing')->insert([
                    'tenant_id' => $tenant->id, 'project_id' => $project->id, 'slug' => $slug,
                    'is_visible' => false, 'sort_order' => $order, 'first_published_at' => null,
                    'content' => json_encode($content, JSON_THROW_ON_ERROR), 'updated_at' => now(),
                ]);
                $created++;
            }
            if ($this->option('apply')) {
                DB::commit();
            } else {
                DB::rollBack();
            }
        } catch (\Throwable $exception) {
            DB::rollBack();
            throw $exception;
        }
        $this->info(($this->option('apply') ? 'Guardado local' : 'Simulación sin guardar').": {$created} borradores; {$skipped} presentaciones conservadas. Ningún proyecto publicado.");

        return self::SUCCESS;
    }
}
