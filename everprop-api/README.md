# EverProp / Bellomo API

API canónica multitenant construida con Laravel 13, PHP 8.4, MySQL 8.4 y Redis. El proyecto usa una base compartida con aislamiento por `tenant_id`, autenticación Sanctum orientada a SPA y módulos de dominio explícitos.

## Requisitos

- Docker Engine con Docker Compose.
- Git para control local de cambios.
- Ninguna dependencia del PHP del host.

## Inicio local

```powershell
.\scripts\bootstrap-local.ps1
docker compose --project-name everprop-api build everprop-api-php
docker compose --project-name everprop-api run --rm --no-deps --user 0:0 `
    -e COMPOSER_HOME=/tmp/composer `
    everprop-api-php composer install --no-interaction --prefer-dist --no-progress
docker compose --project-name everprop-api up -d --no-build --wait --wait-timeout 240
.\scripts\import-schema.ps1
```

El script de bootstrap crea `.env`, `.env.testing` y secretos Docker locales criptográficamente aleatorios. No imprime sus valores y esos archivos están ignorados por Git.

La API se publica por defecto sólo en `http://127.0.0.1:18080`. MySQL, Redis y PHP-FPM no publican puertos al host.

Los defaults conservan los nombres históricos:

```dotenv
COMPOSE_PROJECT_NAME=everprop-api
EVERPROP_RESOURCE_PREFIX=everprop-api
EVERPROP_PHP_IMAGE=everprop-api-php:local
HTTP_PORT=18080
```

## Instancias Compose aisladas

Cada instancia debe usar un project name, prefijo de recursos, tag PHP y puerto loopback propios. Las variables se aplican sólo al proceso actual y deben restaurarse al finalizar:

```powershell
$projectName = 'everprop-api-gate0c-test'
$resourcePrefix = 'everprop-api-gate0c-test'
$phpImage = 'everprop-api-gate0c-test-php:local'
$httpPort = 18081

$previousComposeProject = $env:COMPOSE_PROJECT_NAME
$previousResourcePrefix = $env:EVERPROP_RESOURCE_PREFIX
$previousPhpImage = $env:EVERPROP_PHP_IMAGE
$previousHttpPort = $env:HTTP_PORT

try {
    $env:COMPOSE_PROJECT_NAME = $projectName
    $env:EVERPROP_RESOURCE_PREFIX = $resourcePrefix
    $env:EVERPROP_PHP_IMAGE = $phpImage
    $env:HTTP_PORT = [string] $httpPort

    .\scripts\bootstrap-local.ps1 `
        -ProjectName $projectName `
        -ResourcePrefix $resourcePrefix `
        -PhpImage $phpImage `
        -HttpPort $httpPort

    docker compose --project-name $projectName config
    docker compose --project-name $projectName build everprop-api-php
    docker compose --project-name $projectName run --rm --no-deps --user 0:0 `
        -e COMPOSER_HOME=/tmp/composer `
        everprop-api-php composer install --no-interaction --prefer-dist --no-progress
    docker compose --project-name $projectName up -d --no-build --wait --wait-timeout 240
    .\scripts\import-schema.ps1 `
        -ProjectName $projectName `
        -ResourcePrefix $resourcePrefix `
        -PhpImage $phpImage `
        -HttpPort $httpPort
}
finally {
    $env:COMPOSE_PROJECT_NAME = $previousComposeProject
    $env:EVERPROP_RESOURCE_PREFIX = $previousResourcePrefix
    $env:EVERPROP_PHP_IMAGE = $previousPhpImage
    $env:HTTP_PORT = $previousHttpPort
}
```

Los slugs aceptan minúsculas, números, guion y guion bajo. `set-local-http-port.ps1` conserva `-Port` como alias retrocompatible de `-HttpPort`.

## Contrato de base de datos

El baseline inmutable vive en `database/schema/bellomo_crm_omnichannel_mysql8.baseline.sql`. Su SHA-256 canónico es:

`4C8B170BC6F8B6827E9B85E756ACB2254CCF392B0FF4C11459C775366BAE472D`

No se recrean manualmente sus 40 tablas como migraciones Laravel. Toda evolución posterior se implementa como cambio forward-only y nunca edita el baseline.

## Calidad

```powershell
docker compose --project-name everprop-api exec everprop-api-php composer validate --strict
docker compose --project-name everprop-api exec everprop-api-php vendor/bin/pint --test
docker compose --project-name everprop-api exec everprop-api-php vendor/bin/phpstan analyse
docker compose --project-name everprop-api exec everprop-api-php php artisan test
```

El contrato HTTP está en [`openapi.yaml`](openapi.yaml). Las guías de integración, seguridad, tenancy, RBAC y base de datos están en [`docs`](docs), junto con una colección reproducible `docs/smoke-tests.http`.
