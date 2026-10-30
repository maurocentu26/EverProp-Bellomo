[CmdletBinding()]
param(
    # A dump made by `php artisan everprop:backup:database`, downloaded from the backups bucket.
    [Parameter(Mandatory)] [string] $Dump,
    # Its .sha256 file; the restore refuses a dump whose hash does not match.
    [Parameter(Mandatory)] [string] $Checksum
)

# EVP-92: restore a dump into a throwaway MySQL 8.4 container and print row counts per table.
# Never touches an existing stack, volume or database: the container has no volume and is removed at the end.
$ErrorActionPreference = 'Stop'

$expected = (Get-Content -LiteralPath $Checksum -Raw).Split(' ')[0].Trim()
$actual = (Get-FileHash -LiteralPath $Dump -Algorithm SHA256).Hash.ToLowerInvariant()
if ($actual -ne $expected) { throw "sha256 no coincide: el dump esta corrupto o no es el del checksum." }

$name = 'everprop-restore-rehearsal'
$password = -join ((1..24) | ForEach-Object { '{0:x}' -f (Get-Random -Maximum 16) })
$started = Get-Date

docker run -d --rm --name $name -e "MYSQL_ROOT_PASSWORD=$password" -e MYSQL_DATABASE=restored mysql:8.4 | Out-Null
try {
    do { Start-Sleep -Seconds 2 } until ((docker exec -e "MYSQL_PWD=$password" $name mysql -uroot -N -e 'SELECT 1' restored 2>$null) -eq '1')

    docker cp $Dump "${name}:/tmp/dump.sql.gz"
    docker exec -e "MYSQL_PWD=$password" $name sh -c 'gunzip -c /tmp/dump.sql.gz | mysql -uroot restored'
    if ($LASTEXITCODE -ne 0) { throw 'La restauracion fallo.' }

    $tables = docker exec -e "MYSQL_PWD=$password" $name mysql -uroot -N -e "SELECT table_name FROM information_schema.tables WHERE table_schema = 'restored' AND table_type = 'BASE TABLE' ORDER BY table_name"
    $counts = $tables | ForEach-Object { docker exec -e "MYSQL_PWD=$password" $name mysql -uroot -N restored -e "SELECT '$_', COUNT(*) FROM ``$_``" }
    $routines = docker exec -e "MYSQL_PWD=$password" $name mysql -uroot -N -e "SELECT COUNT(*) FROM information_schema.routines WHERE routine_schema = 'restored'"

    $counts
    Write-Host "Tablas: $(@($counts).Count) · Rutinas: $routines · Tiempo de restauracion: $([int]((Get-Date) - $started).TotalSeconds) s"
}
finally {
    docker stop $name | Out-Null
}
