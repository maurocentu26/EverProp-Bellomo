$ErrorActionPreference = 'Stop'
$demoRoot = $PSScriptRoot
$nodePath = (Get-Command node -ErrorAction Stop).Source
$logDirectory = Join-Path $demoRoot 'work'
New-Item -ItemType Directory -Path $logDirectory -Force | Out-Null
foreach ($port in @(3001, 3002)) {
    if (Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue) {
        throw "El puerto $port ya está ocupado. Si la demo está abierta, usá sus enlaces; no hace falta iniciarla otra vez."
    }
}
$env:LOCAL_DEMO = '1'
$env:NEXT_PUBLIC_LOCAL_DEMO = '1'
$env:NEXT_PUBLIC_DATA_MODE = 'mock'
$env:DEMO_PANEL_URL = 'http://127.0.0.1:3001'
$env:NEXT_TELEMETRY_DISABLED = '1'
foreach ($app in @(@{ Folder = 'everprop-public'; Port = 3001 }, @{ Folder = 'bellomo-web-demo'; Port = 3002 })) {
    $appDirectory = Join-Path $demoRoot $app.Folder
    $nextBinary = Join-Path $appDirectory 'node_modules/next/dist/bin/next'
    if (!(Test-Path -LiteralPath $nextBinary)) { throw "Faltan dependencias en $appDirectory. Ejecutá npm ci en esa carpeta." }
    $process = Start-Process -FilePath $nodePath -ArgumentList @("`"$nextBinary`"", 'dev', '--webpack', '--hostname', '127.0.0.1', '--port', $app.Port) -WorkingDirectory $appDirectory -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $logDirectory "$($app.Folder).stdout.log") -RedirectStandardError (Join-Path $logDirectory "$($app.Folder).stderr.log")
    Write-Output "$($app.Folder): PID $($process.Id), puerto $($app.Port)"
}
Write-Output 'Panel: http://127.0.0.1:3001/login'
Write-Output 'Bellomito: http://127.0.0.1:3002/#catalogo-demo'
