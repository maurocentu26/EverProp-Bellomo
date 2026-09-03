[CmdletBinding()]
param(
    [ValidatePattern('^[a-z0-9][a-z0-9_-]*$')]
    [string] $ProjectName = 'everprop-api',

    [ValidatePattern('^[a-z0-9][a-z0-9_-]*$')]
    [string] $ResourcePrefix = 'everprop-api',

    [ValidatePattern('^[a-z0-9][a-z0-9._/-]*(?::[A-Za-z0-9][A-Za-z0-9._-]*)?$')]
    [string] $PhpImage = 'everprop-api-php:local',

    [ValidateRange(1024, 65535)]
    [int] $HttpPort = 18080
)

$ErrorActionPreference = 'Stop'
$repository = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
$schemaDirectory = Join-Path (Join-Path $repository 'database') 'schema'
$baselinePath = Join-Path $schemaDirectory 'bellomo_crm_omnichannel_mysql8.baseline.sql'
$expectedHash = '4C8B170BC6F8B6827E9B85E756ACB2254CCF392B0FF4C11459C775366BAE472D'
$composeEnvironment = [ordered]@{
    COMPOSE_PROJECT_NAME = $ProjectName
    EVERPROP_RESOURCE_PREFIX = $ResourcePrefix
    EVERPROP_PHP_IMAGE = $PhpImage
    HTTP_PORT = [string] $HttpPort
}
$previousEnvironment = @{}

try {
    foreach ($entry in $composeEnvironment.GetEnumerator()) {
        $previousEnvironment[$entry.Key] = [Environment]::GetEnvironmentVariable(
            $entry.Key,
            [EnvironmentVariableTarget]::Process
        )
        [Environment]::SetEnvironmentVariable(
            $entry.Key,
            $entry.Value,
            [EnvironmentVariableTarget]::Process
        )
    }

    $actualHash = (Get-FileHash -Algorithm SHA256 -LiteralPath $baselinePath).Hash

    if ($actualHash -ne $expectedHash) {
        throw 'El baseline local no coincide con el hash canonico.'
    }

    $baseline = [IO.File]::ReadAllText($baselinePath)
    $baseline | docker compose --project-name $ProjectName exec -T everprop-api-mysql sh -lc 'MYSQL_PWD="$(cat /run/secrets/mysql_root_password)" mysql -uroot --default-character-set=utf8mb4'
    if ($LASTEXITCODE -ne 0) {
        throw 'Fallo la importacion del baseline de desarrollo.'
    }

    $testingBaseline = $baseline.
        Replace('CREATE DATABASE IF NOT EXISTS bellomo_crm', 'CREATE DATABASE IF NOT EXISTS bellomo_crm_test').
        Replace('USE bellomo_crm;', 'USE bellomo_crm_test;')
    $testingBaseline | docker compose --project-name $ProjectName exec -T everprop-api-mysql sh -lc 'MYSQL_PWD="$(cat /run/secrets/mysql_root_password)" mysql -uroot --default-character-set=utf8mb4'
    if ($LASTEXITCODE -ne 0) {
        throw 'Fallo la importacion del baseline de testing.'
    }

    Remove-Variable baseline, testingBaseline

    $forwardChanges = Get-ChildItem -File -LiteralPath (Join-Path $schemaDirectory 'forward') -Filter '*.sql' | Sort-Object Name

    foreach ($change in $forwardChanges) {
        foreach ($database in @('bellomo_crm', 'bellomo_crm_test')) {
            $mysqlCommand = 'MYSQL_PWD="$(cat /run/secrets/mysql_root_password)" mysql -uroot --default-character-set=utf8mb4 ' + $database
            [IO.File]::ReadAllText($change.FullName) | docker compose --project-name $ProjectName exec -T everprop-api-mysql sh -lc $mysqlCommand
            if ($LASTEXITCODE -ne 0) {
                throw "Fallo el cambio forward-only $($change.Name) en $database."
            }
        }
    }

    docker compose --project-name $ProjectName exec -T everprop-api-php php artisan everprop:schema:verify
    if ($LASTEXITCODE -ne 0) {
        throw 'El contrato de desarrollo no paso luego de la importacion.'
    }

    docker compose --project-name $ProjectName exec -T everprop-api-php php artisan everprop:schema:verify --env=testing
    if ($LASTEXITCODE -ne 0) {
        throw 'El contrato de testing no paso luego de la importacion.'
    }

    Write-Host 'Baseline y cambios forward-only importados y verificados.'
}
finally {
    Remove-Variable baseline, testingBaseline, mysqlCommand -ErrorAction SilentlyContinue

    foreach ($entry in $composeEnvironment.GetEnumerator()) {
        [Environment]::SetEnvironmentVariable(
            $entry.Key,
            $previousEnvironment[$entry.Key],
            [EnvironmentVariableTarget]::Process
        )
    }
}
