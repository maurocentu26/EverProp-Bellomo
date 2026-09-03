[CmdletBinding()]
param(
    [ValidatePattern('^[a-z0-9][a-z0-9_-]*$')]
    [string] $ProjectName = 'everprop-api',

    [ValidatePattern('^[a-z0-9][a-z0-9_-]*$')]
    [string] $ResourcePrefix = 'everprop-api',

    [ValidatePattern('^[a-z0-9][a-z0-9._/-]*(?::[A-Za-z0-9][A-Za-z0-9._-]*)?$')]
    [string] $PhpImage = 'everprop-api-php:local',

    [Alias('Port')]
    [ValidateRange(1024, 65535)]
    [int] $HttpPort = 18080,

    [ValidateSet('.env', '.env.testing')]
    [string] $EnvironmentFile = '.env'
)

$ErrorActionPreference = 'Stop'
$repository = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
$environmentPath = Join-Path $repository $EnvironmentFile
$composeEnvironment = [ordered]@{
    COMPOSE_PROJECT_NAME = $ProjectName
    EVERPROP_RESOURCE_PREFIX = $ResourcePrefix
    EVERPROP_PHP_IMAGE = $PhpImage
    HTTP_PORT = [string] $HttpPort
}
$previousEnvironment = @{}

function Set-EnvironmentValue([string] $content, [string] $name, [string] $value) {
    $pattern = '(?m)^' + [Regex]::Escape($name) + '=.*$'
    return [Regex]::Replace($content, $pattern, { param($match) "$name=$value" })
}

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

    if (-not (Test-Path -LiteralPath $environmentPath)) {
        throw 'Ejecute scripts/bootstrap-local.ps1 antes de configurar el puerto.'
    }

    $content = [IO.File]::ReadAllText($environmentPath)
    $settings = [ordered]@{
        COMPOSE_PROJECT_NAME = $ProjectName
        EVERPROP_RESOURCE_PREFIX = $ResourcePrefix
        EVERPROP_PHP_IMAGE = $PhpImage
        HTTP_PORT = [string] $HttpPort
        APP_URL = "http://127.0.0.1:$HttpPort"
        SANCTUM_STATEFUL_DOMAINS = "127.0.0.1:$HttpPort,localhost:$HttpPort,127.0.0.1:3000,localhost:3000,127.0.0.1:5173,localhost:5173"
    }

    foreach ($entry in $settings.GetEnumerator()) {
        $content = Set-EnvironmentValue $content $entry.Key $entry.Value
    }

    [IO.File]::WriteAllText($environmentPath, $content, [Text.UTF8Encoding]::new($false))

    Write-Host "$EnvironmentFile configurado para HTTP local en 127.0.0.1:$HttpPort."
}
finally {
    foreach ($entry in $composeEnvironment.GetEnumerator()) {
        [Environment]::SetEnvironmentVariable(
            $entry.Key,
            $previousEnvironment[$entry.Key],
            [EnvironmentVariableTarget]::Process
        )
    }
}
