param(
    [ValidatePattern('^[a-z0-9][a-z0-9_-]*$')]
    [string] $ProjectName = 'everprop-api',
    [ValidateSet('bellomo_crm', 'bellomo_crm_test')]
    [string] $Database = 'bellomo_crm_test'
)
$ErrorActionPreference = 'Stop'
$schemaPath = Join-Path $PSScriptRoot '../database/schema/forward/2026-09-08.001_create_collections.sql'
$sql = [IO.File]::ReadAllText((Resolve-Path -LiteralPath $schemaPath)).Replace("`r`n", "`n")
$sha = [Security.Cryptography.SHA256]::Create()
try {
    $hash = [BitConverter]::ToString($sha.ComputeHash([Text.Encoding]::UTF8.GetBytes($sql))).Replace('-', '')
} finally { $sha.Dispose() }
if ($hash -ne '2A948926FE16F51057C1577A30A815523AB6C5A35DD106394F1295A512BD40CC') {
    throw 'Collections migration checksum does not match the reviewed version.'
}
$mysqlCommand = 'MYSQL_PWD="$(cat /run/secrets/mysql_root_password)" mysql -uroot --default-character-set=utf8mb4 ' + $Database
Push-Location (Join-Path $PSScriptRoot '..')
try {
    $sql | docker compose --project-name $ProjectName exec -T everprop-api-mysql sh -lc $mysqlCommand
    if ($LASTEXITCODE -ne 0) { throw 'Collections migration failed. Inspect schema before retrying.' }
    Write-Host "Collections schema applied to $Database. Existing baseline was not imported."
} finally { Pop-Location }
