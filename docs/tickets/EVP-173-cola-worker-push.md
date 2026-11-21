# EVP-173: push en producción, con cola en base y worker

Rama `hotfix/evp-173-cola-worker-push` desde `main` @ `f79fb03` (después de EVP-171) · 2026-11-20 · Mauro Centurión con Claude

## Reporte

El cliente avisó que no recibe notificaciones desde el 13/11. El 20/11 se verificó en producción, en `awake-dedication` y solo con lectura:

- **La campana funciona.** Hay notificaciones `LEAD_CREATED` todos los días que se cargaron leads, y los endpoints responden 200 sin excepciones.
- **El push al celular o al escritorio nunca funcionó en producción.** Hay 0 `web_push_subscriptions`, y la API no encola push porque falta `WEBPUSH_PRIVATE_KEY` (`AppServiceProvider`). Aunque hubiera claves:
  - No existe la tabla `jobs` de la cola en base.
  - No hay servicio worker.
  - El worker de `main` está fijo en `queue:work redis`, y este proyecto no tiene Redis.

## Alcance (decisión del 20/11)

Solo push, porque es parte del flujo de la nueva bandeja de notificaciones. El scheduler y los recordatorios de cobranzas (mails a clientes) no entran ahora. El código de cobranzas ya está en `main` y este ticket no lo toca. Los mails, además, siguen apagados por `COLLECTIONS_MAIL_ENABLED=false`.

## Cambio en el repo

- **`database/schema/forward/2026-09-30.001_queue_tables.sql`:** `jobs` y `failed_jobs`, el mismo SQL que tiene `develop` (aditivo y re-ejecutable). Solo cambia el comentario, que en `develop` hablaba de conversaciones.
- **`config/database-contract.php`:** 55 tablas (antes 53), y `jobs` y `failed_jobs` pasan a tablas globales. Las FKs y las tablas por tenant no cambian.
- **`docker/production/entrypoint.sh worker`:** consume `QUEUE_WORKER_CONNECTION` o, si no está, `QUEUE_CONNECTION`.
  - Acepta `redis` o `database`, y con cualquier otra falla con un mensaje explícito.
  - Viene de `develop`, sin las colas por carril de EVP-131, que son de IA.
- **`tests/Unit/ProductionWorkerEntrypointTest.php`:** el test de `develop`, más el caso de producción (`QUEUE_CONNECTION=sync` con `QUEUE_WORKER_CONNECTION=database`).
- **`docs/railway-backend.md`:** cómo agregar el servicio de cola a `awake-dedication`.

El deploy automático del merge no cambia nada en la API: el web no usa la rama `worker` del entrypoint, y el contrato no se verifica al arrancar.

## Runbook de producción (cada paso con autorización de Mauro)

1. **Respaldo** del MySQL de producción.
2. **Forward:** aplicar `2026-09-30.001_queue_tables.sql` con la conexión de migraciones. Comprobar `schema_versions` y que existan `jobs` y `failed_jobs`.
3. **Claves VAPID:** generarlas una sola vez con `Minishlink\WebPush\VAPID::createVapidKeys()`, sin imprimir la privada en logs compartidos, y conservar el par.
   - Variables de la API: `WEBPUSH_PUBLIC_KEY`, `WEBPUSH_PRIVATE_KEY`, `WEBPUSH_SUBJECT` (`mailto:` o HTTPS real de la organización) y `WEBPUSH_QUEUE_CONNECTION=database`.
   - **Vercel no necesita nada:** el panel lee la clave pública desde `/api/v1/admin/push/config`.
4. **Servicio de cola:** mismo repo, raíz `/everprop-api`, config `/everprop-api/railway-worker.json`, sin dominio público.
   - Variables: las de la API más `QUEUE_WORKER_CONNECTION=database`.
   - **Aplicado el 2026-11-21:** Railway ya no acepta config-as-code en servicios nuevos, así que `EverProp-Worker` se configuró en la UI, con reinicio Always. Ver `everprop-api/docs/railway-backend.md` y EVP-182.
5. **Chequeo:** `php artisan everprop:production-check --connections --webpush` en la API.
6. **Prueba física:**
   - Un asesor activa los avisos desde el panel, en un celular real; en iPhone, desde la pantalla de inicio.
   - Se le asigna un lead de prueba y llega el push.
   - En los logs del servicio de cola se ve `SendWebPush` procesado, y `failed_jobs` queda vacío.

**Rollback:** borrar el servicio de cola y quitar `WEBPUSH_PRIVATE_KEY`; con eso la API deja de encolar. Las tablas nuevas pueden quedar, porque son aditivas.

## Verificación

Se probó en un stack Docker aislado, `evp173-qa`, con la imagen PHP de `main`.

- **Import del esquema:** el baseline más todos los forwards, incluido el nuevo. `everprop:schema:verify` da PASS en 55 tablas, 50 por tenant y 118 FKs. Las tablas globales son `failed_jobs`, `jobs`, `notifications`, `schema_versions` y `tenants`.
- **Tests:** `php artisan test --filter "ProductionWorkerEntrypointTest|WebPushTest"` da 10 passed (47 assertions).
  - El entrypoint toma redis por defecto, database con `QUEUE_CONNECTION`, la conexión indicada en `QUEUE_WORKER_CONNECTION`, y `sync` más `QUEUE_WORKER_CONNECTION=database`. Con `sync` solo, falla con "unsupported connection".
- **`pint --test` y `phpstan`** sobre los archivos PHP tocados: sin errores.
- **Flujo con la cola en base:**
  - Con claves VAPID de prueba en la configuración y `webpush.connection=database`, un `LeadAssignedNotification` a un asesor deja un `App\Jobs\SendWebPush` en `jobs`.
  - `php artisan queue:work database --once` lo procesa (DONE), y `jobs` y `failed_jobs` quedan en 0.
  - No había ningún dispositivo suscrito, así que no se mandó ningún push real. La entrega en un celular es el paso 6 del runbook.

## Fuera de alcance

- Scheduler y recordatorios de cobranzas, por decisión del 20/11.
- La bandeja de notificaciones nueva, que es el ticket siguiente.
- Avisar al operador o administrador cuando se carga un lead, que hay que definir con el cliente.
- **Contrato y producción:** el contrato no cuenta `cache`, `cache_locks` ni `sessions`, que producción sí tiene porque usa sesiones y caché en base. Tampoco cuenta las 2 FKs de inventario que se crean al importar el Excel. Va en un ticket menor aparte.
