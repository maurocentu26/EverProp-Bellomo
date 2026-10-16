<?php

// Synthetic two-tenant fixtures for tests/e2e/api-vertical.mjs. Local/CI stacks only: refuses production.
// Re-runnable; prints the fixtures as JSON on stdout.

use App\Domain\Identity\Enums\RoleCode;
use App\Domain\Tenancy\Models\Tenant;
use App\Models\User;
use Illuminate\Contracts\Console\Kernel;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\DB;

require __DIR__.'/../../vendor/autoload.php';
$app = require __DIR__.'/../../bootstrap/app.php';
$app->make(Kernel::class)->bootstrap();

if (app()->environment('production')) {
    fwrite(STDERR, "seed e2e: refused in production\n");
    exit(1);
}

$panel = getenv('E2E_PANEL_ORIGIN') ?: 'http://127.0.0.1:3000';
$roles = ['manager' => RoleCode::SALES_MANAGER, 'advisor1' => RoleCode::SALES_ADVISOR, 'advisor2' => RoleCode::SALES_ADVISOR, 'readonly' => RoleCode::READ_ONLY];
$fixtures = [];

foreach (['a', 'b'] as $k) {
    $slug = "e2e-{$k}";
    $tenant = Tenant::query()->where('slug', $slug)->first() ?? Tenant::factory()->create(['slug' => $slug, 'name' => 'E2E '.strtoupper($k)]);
    $users = [];
    foreach ($roles as $who => $role) {
        $user = User::query()->where('tenant_id', $tenant->id)->where('email', "{$who}.{$k}@e2e.invalid")->first()
            ?? User::factory()->for($tenant)->create(['email' => "{$who}.{$k}@e2e.invalid", 'role_code' => $role->value]);
        $users[$who] = $user->public_id;
    }
    if (Artisan::call('everprop:channels:web-chat', ['--tenant' => $slug, '--panel-origin' => [$panel]]) !== 0) {
        fwrite(STDERR, Artisan::output());
        exit(1);
    }
    $widget = DB::table('channel_accounts')->where('tenant_id', $tenant->id)->where('channel_type', 'WEB_CHAT')->value('public_id');
    $fixtures[$k] = ['slug' => $slug, 'id' => $tenant->id, 'widget' => $widget, 'users' => $users];
}

echo json_encode($fixtures, JSON_THROW_ON_ERROR), "\n";
