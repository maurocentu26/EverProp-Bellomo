$ErrorActionPreference = 'Stop'
$repoRoot = $PSScriptRoot
$dockerCommand = Get-Command docker -ErrorAction SilentlyContinue
$dockerExe = if ($dockerCommand) { $dockerCommand.Source } else { Join-Path $env:LOCALAPPDATA 'Programs/DockerDesktop/resources/bin/docker.exe' }
if (!(Test-Path $dockerExe)) { throw 'Docker Desktop is required.' }
$previousPrefix = $env:EVERPROP_RESOURCE_PREFIX
try {
    $env:EVERPROP_RESOURCE_PREFIX = 'everprop-collections'
    Push-Location (Join-Path $repoRoot 'everprop-api')
    try {
        & $dockerExe compose -f compose.yaml -f .docker/collections-compose.yaml -p everprop-collections up -d --wait
        if ($LASTEXITCODE) { throw 'Docker startup failed.' }
    } finally { Pop-Location }
} finally { $env:EVERPROP_RESOURCE_PREFIX = $previousPrefix }
$frontRoot = Join-Path $repoRoot 'everprop-public'
if (!(Test-Path (Join-Path $frontRoot '.env.local'))) { throw 'Configure everprop-public/.env.local as described in LOCAL-DEVELOPMENT.md.' }
if (!(Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue)) {
    $nodeExe = (Get-Command node -ErrorAction Stop).Source
    $logDirectory = Join-Path $frontRoot 'node_modules/.cache'
    New-Item -ItemType Directory -Force -Path $logDirectory | Out-Null
    Start-Process -FilePath $nodeExe -ArgumentList 'node_modules/next/dist/bin/next dev --hostname 127.0.0.1 --port 3000' -WorkingDirectory $frontRoot -WindowStyle Hidden -RedirectStandardOutput (Join-Path $logDirectory 'collections-dev.stdout.log') -RedirectStandardError (Join-Path $logDirectory 'collections-dev.stderr.log') | Out-Null
}
Write-Output 'Local app: http://localhost:3000/login — API: http://127.0.0.1:18082'
