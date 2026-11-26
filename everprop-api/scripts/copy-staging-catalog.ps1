[CmdletBinding()]
param(
    # Staging source (Railway). Read-only: the remote side only runs SELECT/mysqldump.
    [string] $RailwayProject = 'bellomito-staging',
    [string] $RailwayEnvironment = 'staging',
    [string] $RailwayService = 'mysql84',
    [ValidatePattern('^[a-z0-9][a-z0-9_-]*$')]
    [string] $StagingTenantSlug = 'bellomito-staging',

    # Local target (Docker Compose project of everprop-api).
    [ValidatePattern('^[a-z0-9][a-z0-9_-]*$')]
    [string] $ProjectName = 'everprop-api',
    [ValidatePattern('^[a-z0-9][a-z0-9_-]*$')]
    [string] $LocalTenantSlug = 'bellomo',
    [ValidatePattern('^[a-z0-9_]+$')]
    [string] $LocalDatabase = 'bellomo_crm',

    # Re-import a dump taken earlier instead of reading staging again.
    [string] $DumpFile,
    [switch] $KeepDump
)

# EVP-210: copies ONLY the inventory catalogue of one tenant from staging to the local dev database.
# Leads, contacts, conversations, visits, users, channels and secrets are never read nor written.
$ErrorActionPreference = 'Stop'

# Parents first. Children are deleted in reverse order.
$tables = @(
    'legacy_property_types', 'legacy_property_statuses', 'legacy_localities',
    'projects', 'properties', 'property_media', 'property_features',
    'project_landing', 'project_landing_assets'
)
# ERP keys that point to people (owner, partner, ERP user, administrator). Removed on import.
$personKeys = @{
    projects   = @('$.EdDueId')
    properties = @('$.SocId', '$.ProCamUsuId', '$.AdmCod')
}
# Tables that must not change: a before/after count proves the copy touched nothing else.
$untouched = @('leads', 'contacts', 'conversations', 'messages', 'visits', 'visit_requests', 'users', 'lead_properties', 'channel_accounts')
$importDb = 'everprop_catalog_import'

function Invoke-LocalSql([string] $Sql, [string] $Database = '') {
    $command = 'MYSQL_PWD=$(cat /run/secrets/mysql_root_password) mysql -uroot -N --batch --default-character-set=utf8mb4 ' + $Database
    $out = $Sql | docker compose --project-name $ProjectName exec -T everprop-api-mysql sh -lc $command
    if ($LASTEXITCODE -ne 0) { throw "Fallo SQL local (la transaccion se revierte sola): $($Sql.Substring(0, [Math]::Min(120, $Sql.Length)))" }
    return $out
}

function Get-Counts([string] $Database, [string[]] $Names, [string] $TenantFilter) {
    $sql = ($Names | ForEach-Object { "SELECT '$_', COUNT(*) FROM $Database.$_$TenantFilter;" }) -join "`n"
    $map = [ordered]@{}
    foreach ($line in (Invoke-LocalSql $sql)) { $p = $line -split "`t"; $map[$p[0]] = [int] $p[1] }
    return $map
}

$ownDump = -not $DumpFile
if ($ownDump) {
    $DumpFile = Join-Path ([IO.Path]::GetTempPath()) ("everprop-catalog-{0:yyyyMMdd-HHmmss}.sql" -f (Get-Date))
    $remote = @'
set -e
export MYSQL_PWD="$MYSQL_ROOT_PASSWORD"
T=$(mysql -uroot -N -e "SELECT id FROM tenants WHERE slug='__SLUG__'" "$MYSQL_DATABASE")
[ -n "$T" ] || { echo "tenant __SLUG__ not found" >&2; exit 3; }
mysqldump -uroot --no-create-info --complete-insert --skip-triggers --single-transaction --no-tablespaces --set-gtid-purged=OFF \
  --skip-add-locks --skip-disable-keys --skip-comments --hex-blob --default-character-set=utf8mb4 \
  --where="tenant_id=$T" "$MYSQL_DATABASE" __TABLES__ | gzip -c | base64
'@.Replace('__SLUG__', $StagingTenantSlug).Replace('__TABLES__', ($tables -join ' ')).Replace("`r`n", "`n")
    $b64Script = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($remote))
    Write-Host "Leyendo el catalogo de '$StagingTenantSlug' en $RailwayProject/$RailwayEnvironment (solo lectura)..."
    # gzip+base64 keeps the dump byte-exact through ssh and the PowerShell pipeline.
    # Windows PowerShell turns the CLI's informational stderr into errors under 'Stop'.
    $ErrorActionPreference = 'Continue'
    # `railway ssh` takes ids, not names: resolve them from the account's project list.
    $projects = ((railway list --json 2>$null) -join "`n") | ConvertFrom-Json
    $project = $projects | Where-Object name -eq $RailwayProject | Select-Object -First 1
    $envId = ($project.environments.edges.node | Where-Object name -eq $RailwayEnvironment).id
    $serviceId = ($project.services.edges.node | Where-Object name -eq $RailwayService).id
    if (-not $project -or -not $envId -or -not $serviceId) { throw "No encuentro $RailwayProject/$RailwayEnvironment/$RailwayService en Railway (railway whoami)." }
    $encoded = railway ssh -p $project.id -e $envId -s $serviceId -- sh -c "echo $b64Script | base64 -d | sh" 2>$null
    $ErrorActionPreference = 'Stop'
    if ($LASTEXITCODE -ne 0 -or -not $encoded) { throw 'No se pudo leer staging (railway ssh). Verifica `railway whoami` y el acceso al proyecto.' }
    $gz = [Convert]::FromBase64String((($encoded | Where-Object { $_ -match '^[A-Za-z0-9+/=]+$' }) -join ''))
    $in = New-Object IO.Compression.GZipStream((New-Object IO.MemoryStream(, $gz)), [IO.Compression.CompressionMode]::Decompress)
    $outFile = [IO.File]::Create($DumpFile)
    try { $in.CopyTo($outFile) } finally { $outFile.Dispose(); $in.Dispose() }
}

try {
    # The dump may only insert rows into the catalogue tables: anything else aborts before touching the database.
    $allowed = '^INSERT INTO `(' + ($tables -join '|') + ')` \('
    $bad = Get-Content -LiteralPath $DumpFile -Encoding utf8 | Where-Object {
        $_ -ne '' -and $_ -notmatch $allowed -and $_ -notmatch '^/\*!\d+ SET [^;]*\*/;$' -and $_ -notmatch '^SET @[A-Z_]+ *= *[^;]*;$' -and $_ -notmatch '^--'
    } | Select-Object -First 3
    if ($bad) { throw "El volcado tiene sentencias fuera del catalogo; se aborta: $($bad -join ' | ')" }

    $localTenant = (Invoke-LocalSql "SELECT id FROM $LocalDatabase.tenants WHERE slug='$LocalTenantSlug';") | Select-Object -First 1
    if (-not $localTenant) { throw "No existe el tenant local '$LocalTenantSlug' en $LocalDatabase." }
    $before = Get-Counts $LocalDatabase $untouched ''

    # 1. Scratch copy with the local table definitions (CREATE TABLE ... LIKE copies no foreign keys).
    Invoke-LocalSql ("DROP DATABASE IF EXISTS $importDb; CREATE DATABASE $importDb CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;" +
        (($tables | ForEach-Object { "CREATE TABLE $importDb.$_ LIKE $LocalDatabase.$_;" }) -join '')) | Out-Null
    Invoke-LocalSql ([IO.File]::ReadAllText($DumpFile)) $importDb | Out-Null

    # 2. Columns present in both, without generated ones (e.g. property_media.primary_slot).
    $colRows = Invoke-LocalSql @"
SELECT c.TABLE_NAME, GROUP_CONCAT(CONCAT('``', c.COLUMN_NAME, '``') ORDER BY c.ORDINAL_POSITION SEPARATOR ',')
FROM information_schema.COLUMNS c
JOIN information_schema.COLUMNS s ON s.TABLE_SCHEMA = '$importDb' AND s.TABLE_NAME = c.TABLE_NAME AND s.COLUMN_NAME = c.COLUMN_NAME
WHERE c.TABLE_SCHEMA = '$LocalDatabase' AND c.TABLE_NAME IN ('$($tables -join "','")') AND c.EXTRA NOT LIKE '%GENERATED%'
GROUP BY c.TABLE_NAME;
"@
    $columns = @{}
    foreach ($row in $colRows) { $p = $row -split "`t"; $columns[$p[0]] = $p[1] }

    # 3. Replace the local catalogue in one transaction. A foreign key from leads, visits, intakes, etc. to an existing
    #    local unit makes the DELETE fail and nothing changes.
    $sql = New-Object Text.StringBuilder
    [void] $sql.AppendLine("SET SESSION group_concat_max_len = 1048576; START TRANSACTION;")
    for ($i = $tables.Count - 1; $i -ge 0; $i--) { [void] $sql.AppendLine("DELETE FROM $($tables[$i]) WHERE tenant_id = $localTenant;") }
    foreach ($t in $tables) {
        $select = $columns[$t] -replace '`tenant_id`', "$localTenant AS ``tenant_id``"
        [void] $sql.AppendLine("INSERT INTO $t ($($columns[$t])) SELECT $select FROM $importDb.$t;")
    }
    foreach ($t in $personKeys.Keys) {
        [void] $sql.AppendLine("UPDATE $t SET legacy_data_json = JSON_REMOVE(legacy_data_json, '$($personKeys[$t] -join "', '")') WHERE tenant_id = $localTenant AND legacy_data_json IS NOT NULL;")
    }
    [void] $sql.AppendLine('COMMIT;')
    Invoke-LocalSql $sql.ToString() $LocalDatabase | Out-Null

    # 4. Evidence: same rows per table as the dump, nothing else changed, no person keys left.
    $source = Get-Counts $importDb $tables ''
    $target = Get-Counts $LocalDatabase $tables " WHERE tenant_id = $localTenant"
    $after = Get-Counts $LocalDatabase $untouched ''
    $leftKeys = (Invoke-LocalSql ("SELECT (SELECT COUNT(*) FROM projects WHERE tenant_id = $localTenant AND JSON_CONTAINS_PATH(legacy_data_json, 'one', '$($personKeys.projects -join "', '")'))" +
        " + (SELECT COUNT(*) FROM properties WHERE tenant_id = $localTenant AND JSON_CONTAINS_PATH(legacy_data_json, 'one', '$($personKeys.properties -join "', '")'));") $LocalDatabase) | Select-Object -First 1

    $ok = $true
    foreach ($t in $tables) {
        $mark = if ($source[$t] -eq $target[$t]) { 'OK' } else { $ok = $false; 'DIFIERE' }
        Write-Host ("{0,-26} staging {1,6}  local {2,6}  {3}" -f $t, $source[$t], $target[$t], $mark)
    }
    foreach ($t in $untouched) {
        if ($before[$t] -ne $after[$t]) { $ok = $false; Write-Host "$t cambio: $($before[$t]) -> $($after[$t])" }
    }
    if ([int] $leftKeys -ne 0) { $ok = $false; Write-Host "Quedaron $leftKeys filas con claves de personas en legacy_data_json." }
    if (-not $ok) { throw 'La verificacion de la copia fallo.' }
    Write-Host "Catalogo copiado en $LocalDatabase (tenant '$LocalTenantSlug'). Tablas no relacionadas sin cambios."
}
finally {
    try { Invoke-LocalSql "DROP DATABASE IF EXISTS $importDb;" | Out-Null } catch { Write-Warning "No se pudo borrar la base temporal $importDb." }
    if ($ownDump -and -not $KeepDump -and (Test-Path -LiteralPath $DumpFile)) { Remove-Item -LiteralPath $DumpFile }
    elseif ($ownDump) { Write-Host "Volcado conservado (fuera del repo): $DumpFile" }
}
