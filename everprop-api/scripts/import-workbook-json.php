<?php

// Local-only, reviewed workbook payload import. Run with PHP 8.4 inside Docker.
// --rehearse executes every data mutation and verification, then rolls it back.
// Schema DDL is deliberately separate because MySQL DDL implicitly commits.
require dirname(__DIR__).'/vendor/autoload.php';
$app = require dirname(__DIR__).'/bootstrap/app.php';
$app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();

use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

$args = getopt('', ['payload:', 'backup:', 'schema', 'rehearse', 'apply', 'verify']);
function ensure(bool $ok, string $message): void { if (!$ok) throw new RuntimeException($message); }
function jsonValue(mixed $value): string { return json_encode($value, JSON_THROW_ON_ERROR | JSON_UNESCAPED_UNICODE); }
function scoped(string $table) { return DB::table($table)->where('tenant_id', 1); }
ensure(app()->environment('local') && DB::connection()->getDriverName() === 'mysql', 'Local MySQL required');
ensure(DB::connection()->getDatabaseName() === 'bellomo_crm', 'Unexpected database');
ensure(DB::table('tenants')->where('id', 1)->value('slug') === 'bellomo', 'Bellomo tenant 1 required');
$payload = json_decode(file_get_contents($args['payload']), true, flags: JSON_THROW_ON_ERROR);
$source = $payload['source'];
ensure(count($payload['properties']) === count($source['sheets']['Productos']['records']), 'Property source count mismatch');
ensure(count($payload['projects']) === count($source['sheets']['Edificio']['records']), 'Project source count mismatch');
ensure(in_array($payload['currency'], ['UNKNOWN', 'ARS', 'USD'], true), 'Unsupported currency');
ensure(is_file($args['backup']) && hash_file('sha256', $args['backup']) === $payload['backup_sha256'], 'Verified backup required');
$seen = [];
foreach ($payload['properties'] as $i => $property) {
    $raw = $source['sheets']['Productos']['records'][$i]['data'];
    ensure($property['legacy_data_json'] === $raw, 'Source row was altered');
    $key = $raw['EdId'].'-'.trim((string)$raw['ProPis']).'-'.trim((string)$raw['ProDep']);
    ensure($property['code'] === $key && !isset($seen[$key]), 'Duplicate or mismatched property key');
    $seen[$key] = true;
}
if (isset($args['schema'])) {
    if (!DB::table('schema_versions')->where('version', '2026-09-15.001')->exists()) {
        DB::unprepared(file_get_contents(dirname(__DIR__).'/database/schema/forward/2026-09-15.001_real_inventory_source.sql'));
    }
    echo "Source schema ready.\n";
    exit;
}
ensure(isset($args['apply']) || isset($args['rehearse']) || isset($args['verify']), 'Choose --schema, --rehearse, --apply or --verify');
ensure(DB::table('schema_versions')->where('version', '2026-09-15.001')->exists(), 'Apply source schema first');

function verifyImport(array $payload): array {
    $properties = scoped('properties')->get()->keyBy('code');
    $projects = scoped('projects')->get()->keyBy('legacy_id');
    ensure($properties->count() === count($payload['properties']), 'Unexpected properties after import');
    ensure($projects->count() === count($payload['projects']), 'Unexpected projects after import');
    $missingParents = 0;
    foreach ($payload['properties'] as $expected) {
        $row = $properties->get($expected['code']);
        ensure($row !== null, 'Missing property '.$expected['code']);
        ensure(json_decode($row->legacy_data_json, true) == $expected['legacy_data_json'], 'Source data mismatch '.$expected['code']);
        foreach (['status','category','operation','legacy_ed_id','legacy_pis','legacy_dep','legacy_status_id','legacy_type_id'] as $field) {
            ensure($row->$field === $expected[$field], 'Normalized field mismatch '.$field.' '.$expected['code']);
        }
        $parent = $projects->get($expected['legacy_ed_id']);
        ensure($row->project_id === ($parent?->id), 'Cross-project or dangling property relation');
        if (!$parent) $missingParents++;
        ensure(($row->area_m2 === null && $expected['area_m2'] === null) || (float)$row->area_m2 === (float)$expected['area_m2'], 'Area mismatch');
        ensure($row->main_image_url === null && $row->services_json === null && $row->commercial_features_json === null, 'Synthetic metadata remains');
        if ($payload['currency'] === 'UNKNOWN') ensure($row->price === null && $row->currency_code === null, 'Guessed price/currency');
        else ensure((float)$row->price === (float)$expected['legacy_data_json']['ProPre'] && $row->currency_code === $payload['currency'], 'Price mismatch');
    }
    foreach ($payload['projects'] as $expected) {
        $row = $projects->get($expected['legacy_id']);
        ensure($row !== null && json_decode($row->legacy_data_json, true) == $expected['legacy_data_json'], 'Project source mismatch');
        ensure($row->total_units === scoped('properties')->where('project_id',$row->id)->count(), 'Incorrect project unit count');
        ensure($row->progress === null && $row->masterplan_image_url === null, 'Synthetic project metadata remains');
    }
    foreach (['ProdT01'=>['legacy_property_types','ProTId'], 'Estado'=>['legacy_property_statuses','ProEId'], 'Localidades'=>['legacy_localities','LocCod']] as $sheet=>$catalog) {
        $actual=scoped($catalog[0])->get()->keyBy('legacy_id');
        ensure($actual->count()===count($payload['source']['sheets'][$sheet]['records']), 'Catalog count mismatch');
        foreach ($payload['source']['sheets'][$sheet]['records'] as $sourceRow) {
            $row=$actual->get($sourceRow['data'][$catalog[1]]);
            ensure($row !== null && json_decode($row->data_json,true)==$sourceRow['data'], 'Catalog source mismatch');
        }
    }
    foreach (['leads','contacts','properties','projects'] as $table) ensure(!scoped($table)->whereIn('public_id',$payload['cleanup'][$table])->exists(), 'Mock records remain');
    $archive=scoped('inventory_source_imports')->where('source_sha256',$payload['source']['sha256'])->first();
    ensure($archive !== null && json_decode($archive->workbook_json,true)==$payload['source'], 'Workbook archive mismatch');
    return ['properties'=>$properties->count(),'projects'=>$projects->count(),'unresolved_source_project_references'=>$missingParents,'catalogs'=>['types'=>17,'statuses'=>8,'localities'=>102],'status_counts'=>scoped('properties')->select('status')->selectRaw('COUNT(*) as count')->groupBy('status')->get(),'source_issues'=>$payload['issues']];
}

if (isset($args['verify'])) { echo jsonValue(verifyImport($payload))."\n"; exit; }
ensure(!scoped('inventory_source_imports')->where('source_sha256',$source['sha256'])->exists(), 'Already imported; use --verify, not another destructive refresh');
DB::beginTransaction();
try {
    $cleanup=$payload['cleanup'];
    foreach (['leads','contacts','properties','projects'] as $table) {
        ensure(scoped($table)->whereIn('public_id',$cleanup[$table])->lockForUpdate()->count()===count($cleanup[$table]), 'Cleanup target changed: '.$table);
    }
    $leadIds=scoped('leads')->whereIn('public_id',$cleanup['leads'])->pluck('id')->all();
    $contactIds=scoped('contacts')->whereIn('public_id',$cleanup['contacts'])->pluck('id')->all();
    $userIds=scoped('users')->pluck('id')->all();
    // Delete only notifications and children of the individually identified demo/QA leads.
    DB::table('notifications')->whereIn('notifiable_id',$userIds)->whereIn('data->lead_id',$cleanup['leads'])->delete();
    foreach (['visits','lead_follow_ups','lead_properties','lead_touchpoints','lead_assignments'] as $table) scoped($table)->whereIn('lead_id',$leadIds)->delete();
    scoped('leads')->whereIn('id',$leadIds)->delete();
    scoped('contacts')->whereIn('id',$contactIds)->delete();
    $propertyIds=scoped('properties')->whereIn('public_id',$cleanup['properties'])->pluck('id')->all();
    foreach (['property_features','property_media','user_inventory_scopes'] as $table) scoped($table)->whereIn('property_id',$propertyIds)->delete();
    scoped('properties')->whereIn('id',$propertyIds)->delete();
    scoped('projects')->whereIn('public_id',$cleanup['projects'])->delete();

    foreach (['ProdT01'=>['legacy_property_types','ProTId','ProTTip'], 'Estado'=>['legacy_property_statuses','ProEId','ProEEst'], 'Localidades'=>['legacy_localities','LocCod','LocDes']] as $sheet=>$catalog) {
        foreach ($source['sheets'][$sheet]['records'] as $row) {
            scoped($catalog[0])->updateOrInsert(['tenant_id'=>1,'legacy_id'=>$row['data'][$catalog[1]]],['label'=>trim($row['data'][$catalog[2]]),'source_row'=>$row['row'],'data_json'=>jsonValue($row['data'])]);
        }
    }
    foreach ($payload['projects'] as $project) {
        $existing=scoped('projects')->where('legacy_id',$project['legacy_id'])->first();
        $project['legacy_data_json']=jsonValue($project['legacy_data_json']);
        $project['deleted_at']=null;
        if ($existing) scoped('projects')->where('id',$existing->id)->update($project);
        else DB::table('projects')->insert($project+['tenant_id'=>1,'public_id'=>(string)Str::uuid()]);
    }
    $projectIds=scoped('projects')->pluck('id','legacy_id');
    $existing=scoped('properties')->get()->keyBy('code');
    $batch=[];
    foreach ($payload['properties'] as $property) {
        if ($payload['currency'] !== 'UNKNOWN') {
            $property['price']=$property['legacy_data_json']['ProPre'];
            $property['currency_code']=$property['price']===null ? null : $payload['currency'];
        }
        $property['legacy_data_json']=jsonValue($property['legacy_data_json']);
        $property['tenant_id']=1;
        $property['project_id']=$projectIds->get($property['legacy_ed_id']);
        $property['public_id']=$existing->get($property['code'])?->public_id ?? (string)Str::uuid();
        $property['version']=($existing->get($property['code'])?->version ?? 0)+1;
        $property['deleted_at']=null;
        $batch[]=$property;
    }
    $updateFields=array_values(array_diff(array_keys($batch[0]),['tenant_id','public_id','code']));
    foreach (array_chunk($batch,100) as $chunk) DB::table('properties')->upsert($chunk,['tenant_id','code'],$updateFields);
    DB::table('inventory_source_imports')->insert(['tenant_id'=>1,'source_sha256'=>$source['sha256'],'source_name'=>basename($source['source']),'workbook_json'=>jsonValue($source),'report_json'=>jsonValue(['issues'=>$payload['issues'],'cleanup_counts'=>array_map('count',$cleanup),'currency'=>$payload['currency']])]);
    $report=verifyImport($payload);
    if (isset($args['rehearse'])) { DB::rollBack(); $report['mode']='rehearsal rolled back'; }
    else { DB::commit(); $report['mode']='committed'; }
    echo jsonValue($report)."\n";
} catch (Throwable $e) {
    if (DB::transactionLevel()) DB::rollBack();
    throw $e;
}
