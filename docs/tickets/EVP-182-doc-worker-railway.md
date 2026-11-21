# EVP-182: documentar el worker de Railway sin config-as-code

Rama `hotfix/evp-182-doc-worker-railway` desde `main` @ `86da620` · 2026-11-21 · Mauro Centurión con Claude

## Por qué

Al aplicar el runbook de EVP-173 en `awake-dedication`, Railway avisó que la config-as-code está dada de baja. Un servicio que nunca la usó no puede activarla, y desde el 2026-12-01 los archivos existentes dejan de aplicarse. Por eso `EverProp-Worker` no pudo usar `railway-worker.json` y se configuró en la UI, pero `railway-backend.md` seguía indicando los archivos.

## Cambios (solo documentación)

- **`everprop-api/docs/railway-backend.md`:**
  - **Sección de `awake-dedication`:** tabla con la configuración real de `EverProp-Worker`. Raíz `/everprop-api`, comando `sh /var/www/html/docker/production/entrypoint.sh worker`, reinicio **Always** (`--max-time=3600` sale con código 0, así que On Failure no lo levanta), sin healthcheck ni dominio, y variables como referencias `${{EverProp-Bellomo.*}}` más `QUEUE_WORKER_CONNECTION=database`.
  - **Pasos nuevos:** `WEBPUSH_SUBJECT` puede ser una URL HTTPS y no manda correos. Se comprueba el worker con `queue:monitor` y `queue:failed`.
  - **Respaldos:** el plan Hobby no permite crear respaldos manuales.
  - **Scheduler:** el comando para crearlo de la misma forma.
  - **Alternativa con Redis:**
    - Aviso de la baja de config-as-code, con sus fechas.
    - Tabla de lo que hay que cargar a mano por servicio: comando, reinicio y healthcheck.
    - Nota de que la API de `awake-dedication` hoy no tiene healthcheck en la UI.
- **`docs/tickets/EVP-173-cola-worker-push.md`:** una línea en el paso 4 del runbook que dice cómo se aplicó y remite acá.

Los archivos `railway*.json` no se tocan: siguen sirviendo de referencia.

## Verificación

- **Configuración del worker:** contrastada con lo que quedó en `EverProp-Worker` (Settings y consola). Corre `php artisan queue:work database --sleep=2 --tries=3 --timeout=60 --max-time=3600`, y `queue:monitor database:default` y `queue:failed` dan 0.
- **Healthcheck de la API:** en Settings → Deploy de `EverProp-Bellomo`, el campo Healthcheck Path está vacío.
- **Push de punta a punta:** se probó en `bellomito-staging` → `staging`, con la misma configuración de cola. `SendWebPush` dio DONE y Mauro confirmó que el push llegó al dispositivo.

## Pendiente, fuera de este ticket

- Agregar el healthcheck `/readyz` a la API de `awake-dedication`. Es un cambio en Railway y necesita autorización.

## Port a `develop` (2026-11-21)

Se mergeó en `main` con el PR #160 (`63a7cd5`). En `develop` la tabla de la alternativa con Redis ya mencionaba los carriles de cola de EVP-131 (`webhooks,outbound,agent,default` y `QUEUE_WORKER_QUEUES`). La tabla nueva los conserva en la fila de la cola, y el segundo worker de IA se configura "con la misma configuración" en lugar de "con el mismo archivo".
