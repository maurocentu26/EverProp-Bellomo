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
$secretDirectory = Join-Path (Join-Path $repository '.docker') 'secrets'
$marker = Join-Path $secretDirectory 'initialized'
$composeEnvironment = [ordered]@{
    COMPOSE_PROJECT_NAME = $ProjectName
    EVERPROP_RESOURCE_PREFIX = $ResourcePrefix
    EVERPROP_PHP_IMAGE = $PhpImage
    HTTP_PORT = [string] $HttpPort
}
$previousEnvironment = @{}

function New-HexSecret([int] $bytes = 32) {
    return [Convert]::ToHexString([Security.Cryptography.RandomNumberGenerator]::GetBytes($bytes)).ToLowerInvariant()
}

function New-LaravelKey {
    $raw = [Security.Cryptography.RandomNumberGenerator]::GetBytes(32)
    return 'base64:' + [Convert]::ToBase64String($raw)
}

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

    if (Test-Path -LiteralPath $marker) {
        Write-Host 'El entorno local ya estaba inicializado; no se rotaron secretos.'
        return
    }

    New-Item -ItemType Directory -Force -Path $secretDirectory | Out-Null

    $rootPassword = New-HexSecret
    $appPassword = New-HexSecret
    $testPassword = New-HexSecret
    $redisPassword = New-HexSecret
    $webhookSecret = New-HexSecret
    $localAppKey = New-LaravelKey
    $testingAppKey = New-LaravelKey

    $template = [IO.File]::ReadAllText((Join-Path $repository '.env.example'))
    $localEnvironment = $template.Replace('CHANGE_ME_APP_KEY', $localAppKey).
        Replace('CHANGE_ME_DB_PASSWORD', $appPassword).
        Replace('CHANGE_ME_REDIS_PASSWORD', $redisPassword).
        Replace('CHANGE_ME_WEBHOOK_SECRET', $webhookSecret)

    $localSettings = [ordered]@{
        COMPOSE_PROJECT_NAME = $ProjectName
        EVERPROP_RESOURCE_PREFIX = $ResourcePrefix
        EVERPROP_PHP_IMAGE = $PhpImage
        HTTP_PORT = [string] $HttpPort
        APP_URL = "http://127.0.0.1:$HttpPort"
        SANCTUM_STATEFUL_DOMAINS = "127.0.0.1:$HttpPort,localhost:$HttpPort,127.0.0.1:3000,localhost:3000,127.0.0.1:5173,localhost:5173"
    }

    foreach ($entry in $localSettings.GetEnumerator()) {
        $localEnvironment = Set-EnvironmentValue $localEnvironment $entry.Key $entry.Value
    }

    $testingPort = if ($HttpPort -lt 65535) { $HttpPort + 1 } else { 65534 }
    $testingEnvironment = $template.Replace('CHANGE_ME_APP_KEY', $testingAppKey).
        Replace('DB_DATABASE=bellomo_crm', 'DB_DATABASE=bellomo_crm_test').
        Replace('DB_USERNAME=everprop_app', 'DB_USERNAME=everprop_test').
        Replace('CHANGE_ME_DB_PASSWORD', $testPassword).
        Replace('CHANGE_ME_REDIS_PASSWORD', $redisPassword).
        Replace('CHANGE_ME_WEBHOOK_SECRET', $webhookSecret)

    $testingSettings = [ordered]@{
        COMPOSE_PROJECT_NAME = $ProjectName
        EVERPROP_RESOURCE_PREFIX = $ResourcePrefix
        EVERPROP_PHP_IMAGE = $PhpImage
        HTTP_PORT = [string] $testingPort
        APP_ENV = 'testing'
        APP_URL = "http://127.0.0.1:$testingPort"
        SANCTUM_STATEFUL_DOMAINS = "127.0.0.1:$testingPort,localhost:$testingPort,127.0.0.1:3000,localhost:3000,127.0.0.1:5173,localhost:5173"
    }

    foreach ($entry in $testingSettings.GetEnumerator()) {
        $testingEnvironment = Set-EnvironmentValue $testingEnvironment $entry.Key $entry.Value
    }

    [IO.File]::WriteAllText((Join-Path $repository '.env'), $localEnvironment, [Text.UTF8Encoding]::new($false))
    [IO.File]::WriteAllText((Join-Path $repository '.env.testing'), $testingEnvironment, [Text.UTF8Encoding]::new($false))
    [IO.File]::WriteAllText((Join-Path $secretDirectory 'mysql_root_password.txt'), $rootPassword, [Text.UTF8Encoding]::new($false))
    [IO.File]::WriteAllText((Join-Path $secretDirectory 'mysql_app_password.txt'), $appPassword, [Text.UTF8Encoding]::new($false))
    [IO.File]::WriteAllText((Join-Path $secretDirectory 'mysql_test_password.txt'), $testPassword, [Text.UTF8Encoding]::new($false))
    [IO.File]::WriteAllText((Join-Path $secretDirectory 'redis.acl'), "user default on >$redisPassword ~* &* +@all`n", [Text.UTF8Encoding]::new($false))
    [IO.File]::WriteAllText($marker, 'initialized', [Text.UTF8Encoding]::new($false))

    Write-Host 'Entorno local inicializado con secretos nuevos. Los valores no se muestran.'
}
finally {
    foreach ($entry in $composeEnvironment.GetEnumerator()) {
        [Environment]::SetEnvironmentVariable(
            $entry.Key,
            $previousEnvironment[$entry.Key],
            [EnvironmentVariableTarget]::Process
        )
    }

    Remove-Variable rootPassword, appPassword, testPassword, redisPassword, webhookSecret,
        localAppKey, testingAppKey, localEnvironment, testingEnvironment -ErrorAction SilentlyContinue
}
