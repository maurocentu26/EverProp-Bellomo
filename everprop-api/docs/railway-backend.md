# Backend de producción en Railway

La imagen `production` usa Nginx + PHP-FPM con usuario 10001. No usa el servidor de desarrollo de Laravel. El código, las dependencias sin paquetes de desarrollo y la configuración HTTP quedan dentro de la imagen; `.env`, `.docker`, archivos privados y cachés locales quedan excluidos.

## Servicios

### Servicio existente `awake-dedication`

Este proyecto ya dispone de API y MySQL. Para actualizarlo, conservar ambos servicios y aplicar únicamente los forward SQL pendientes. No importar el baseline ni los seeds. Configurar `SESSION_DRIVER=database`, `CACHE_STORE=database` y `QUEUE_CONNECTION=sync`; las tablas `sessions`, `cache` y `cache_locks` deben existir. No requiere Redis para este modo. Readiness verifica las dependencias seleccionadas. La cola síncrona ejecuta los trabajos durante la petición; los recordatorios requieren ejecutar el scheduler por separado.

El frontend publicado es `https://ever-prop-bellomo.vercel.app`. Configurar ese origen exacto para CORS y su hostname para Sanctum. La raíz del frontend redirige a `/login`.

### Alternativa con Redis y procesos separados

Crear/configurar tres servicios desde el mismo repositorio y commit, con raíz `/everprop-api` y estos archivos de configuración (el selector de Railway usa rutas desde la raíz del repositorio):

| Servicio | Archivo | Función |
| --- | --- | --- |
| API | `/everprop-api/railway.json` | HTTP sobre `$PORT`, readiness `/readyz` |
| Cola | `/everprop-api/railway-worker.json` | Worker Redis, sin dominio público |
| Scheduler | `/everprop-api/railway-scheduler.json` | Scheduler continuo, una réplica, sin dominio público |

Los tres comparten MySQL, Redis, APP_KEY y el almacenamiento privado. El proceso de cola termina de forma controlada cada hora; la política `ALWAYS` lo reinicia. Mantener una sola réplica del scheduler. Usar MySQL y Redis por red privada. No publicar sus puertos.

La API usa el ENTRYPOINT del Dockerfile. Quitar cualquier Start Command antiguo como `php artisan serve`. Los archivos de cola y scheduler incluyen su comando explícito porque Railway reemplaza el ENTRYPOINT al configurar Start Command.

## Variables

Tomar `docker/production/environment.example` como lista de variables, sustituyendo cada ejemplo por los valores del servicio. No copiar `.env` local ni regenerar la APP_KEY existente en producción. La plantilla no contiene credenciales utilizables.

- `APP_URL`: URL HTTPS real de la API.
- `TRUSTED_HOSTS`: hostname de la API y el hostname de healthcheck de Railway. Sin protocolo ni barras.
- `TENANT_HOST_MAP_JSON`: mapa del hostname real de la API al slug `bellomo`. No habilitar el resolver local ni confiar en un tenant enviado desde el cliente.
- `SANCTUM_STATEFUL_DOMAINS`: hostname del frontend, sin protocolo. `CORS_ALLOWED_ORIGINS`: su origen HTTPS completo.
- `TRUSTED_PROXIES`: IPs/CIDRs del proxy de ingreso configurado. Se aceptan cabeceras de IP/protocolo/puerto únicamente desde esos proxies; no se confía en `X-Forwarded-Host` para resolver el tenant.
- Sesiones seguras, HTTP-only y cifradas. El frontend sigue usando el proxy de Next para cookies del mismo origen y debe enviar `X-XSRF-TOKEN` en las operaciones con sesión.
- MySQL: usuario de ejecución con permisos DML, separado del usuario de migraciones.
- Redis: credenciales y bases 0–3, conservadas entre despliegues. Evitar configurar un `REDIS_URL` con un número de base fijo que sobrescriba las bases separadas.
- Archivos privados: bucket S3 compatible o volumen persistente compartido. No usar el disco efímero del contenedor para documentos que deban conservarse. Con S3, configurar bucket, endpoint, región y credenciales de acceso privado.

## Esquema y arranque

Seguir `production-release.md`: respaldo, inspección y aplicación de los forward SQL pendientes con la conexión de migraciones. No ejecutar `db:setup-simulation`, `everprop:local-demo`, el baseline ni un seed de prueba en producción. El arranque nunca modifica el esquema.

Al iniciar, el contenedor cachea configuración, ejecuta `php artisan everprop:production-check --connections`, cachea rutas y arranca el servicio. Si faltan secretos/configuración válida, conexión a MySQL/Redis, tablas de cobranzas o el rol de inventario, termina con error antes de servir tráfico. El diagnóstico muestra nombres de comprobaciones, no valores secretos.

`/healthz` comprueba que Laravel responde. `/readyz` comprueba MySQL y Redis y devuelve 503 sin detalles sensibles si fallan. Railway utiliza readiness antes de pasar tráfico; el healthcheck de despliegue no sustituye el monitoreo continuo.

## Validación previa al cambio de tráfico

1. Construir: `docker build --target production -t everprop-api-production:release .` desde `everprop-api`.
2. Configurar variables/secretos en Railway y aplicar las migraciones pendientes antes de desplegar la imagen.
3. Confirmar readiness 200, login con sesión y CSRF, tenant correcto, acceso restringido para anónimos y roles, carga de inventario y creación de acuerdos.
4. Confirmar worker y scheduler activos, y probar almacenamiento persistente con un archivo autorizado.
5. Si falla el release, mantener el despliegue previo y preservar las tablas y datos nuevos.

Referencias oficiales: [configuración como código](https://docs.railway.com/config-as-code/reference), [comandos de arranque](https://docs.railway.com/deployments/start-command), [healthchecks](https://docs.railway.com/deployments/healthchecks).

Esta preparación no configura secretos ni migra o despliega la base de producción.

## Verificación realizada

- Imagen `everprop-api-production:release` construida y arrancada localmente en modo producción, conectada al MySQL/Redis de pruebas.
- Nginx y PHP-FPM ejecutados como UID 10001; imagen sin `.env`, `.docker`, archivos de `storage/app` ni PHPUnit.
- `/healthz`, `/readyz` y catálogo público: 200. Acceso privado anónimo: 401. Las tres rutas históricas de carga de simulación: 404.
- Worker y scheduler arrancados por separado con esta misma imagen.
- 61 pruebas / 253 assertions; Pint y PHPStan del nuevo comando sin errores.
- Login real a través del frontend local: sin token CSRF devuelve 419, con token devuelve 200.

La conectividad, credenciales, proxy TLS y almacenamiento del proveedor deben verificarse nuevamente en el entorno de destino.
