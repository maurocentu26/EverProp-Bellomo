# EVP-29 — Logout frente a solicitudes concurrentes

Rama `ticket/EVP-29-logout-concurrente`, desde `origin/develop` `1e36fe9` · 2026-10-15 · Codex con Mauro Centurión. El usuario autorizó commit y push de esta corrección para revisión; este informe se incluye en el mismo commit del fix. Jira: https://eversys.atlassian.net/browse/EVP-29, asignado a Mauro, En curso. El usuario autorizó trabajar en paralelo a EVP-27; no se mezclaron los cambios de Gemini.

## 1. Qué pedía el ticket

Impedir que solicitudes autenticadas iniciadas antes del logout vuelvan a guardar la sesión y permitan entrar al panel. Debe seguir funcionando login, logout secuencial y aislamiento entre tenants. Probar cookies de otra pestaña y de respuestas tardías. Fuera de alcance: Gemini, inventario y otros errores del panel.

## 2. Qué se implementó

- `everprop-api/app/Domain/Identity/Http/Controllers/AuthController.php`: antes de invalidar la sesión registra su ID como revocado en la conexión Redis `session`. Conserva la invalidación y regeneración CSRF existentes.
- `everprop-api/app/Domain/Identity/Http/Middleware/StartRevocableSession.php`: extiende el middleware de Laravel y reemplaza un ID revocado por uno nuevo antes de leer sus atributos. Una cookie tardía no puede recuperar autenticación, aunque el contenido viejo reaparezca en Redis.
- `everprop-api/app/Providers/AppServiceProvider.php`: sustituye el middleware compartido, cubriendo web y Sanctum.
- `everprop-api/tests/Feature/Identity/AuthenticationTest.php`: captura una sesión anterior, hace logout y guarda después la copia vieja; verifica el arranque con cookie revocada y el nuevo login.
- `everprop-api/tests/e2e/logout-concurrency.mjs`: comprobación HTTP local con 16 lecturas concurrentes y reproducción de todas las cookies recibidas. Requiere `E2E_EMAIL` y `E2E_PASSWORD` de un usuario sintético; base opcional `E2E_BASE_URL`, por defecto `http://127.0.0.1:5173`.

No hay esquema, dependencias nuevas ni cambios de frontend.

## 3. Por qué esta solución

Se reutilizan las sesiones y Redis existentes. La revocación evita esperar a las solicitudes lentas del copiloto y cubre todos los consumidores de la sesión. La marca dura `session.lifetime * 60 + 180` segundos: cubre la vida completa de una sesión escrita tarde más el margen de ejecución; el worker HTTP local termina a los 35 segundos. Vive en la base Redis de sesiones, no en el caché que limpia `cache:clear`.

Un bloqueo global nativo por sesión se descartó al revisar el timeout: una solicitud larga podía impedir cerrar sesión. Detener solamente el polling del frontend tampoco cubre otras pestañas o solicitudes pendientes.

## 4. Cómo se verificó

Entorno local existente: Docker, PHP 8.4, MySQL 8.4 y Redis. La base `bellomo_crm_test` estaba vacía; se inicializó solo esa base con baseline de SHA-256 canónico `4C8B170BC6F8B6827E9B85E756ACB2254CCF392B0FF4C11459C775366BAE472D` y forward existentes. La base de demostración no se reimportó. Se alineó `vendor` con `composer.lock` mediante `composer install --no-scripts`; no se modificaron dependencias del proyecto.

Revisión independiente `tenant-isolation-reviewer`: sin bloqueantes en la solución final. No hay cambios de IA que requieran `llm-security-reviewer`.

Resultados:

- Pasada conjunta final de autenticación, aislamiento y hosts firmados: **19 pruebas, 88 assertions, aprobadas**.

- `AuthenticationTest`: 7 pruebas, 30 assertions, aprobadas. La regresión falla al retirar temporalmente el binding del middleware y pasa con la solución; el binding se restauró en `finally`.
- `TenantIsolationAndRbacTest` y `PanelSignedHostTest`: 12 pruebas aprobadas; incluyen rechazo de sesión entre tenants y host firmado.
- HTTP: logout `204` con 16 lecturas concurrentes; 18 instantáneas de cookies posteriores/antiguas rechazadas con `401`. Se comprueba contra el stack local MySQL/Redis existente.
- Pint de los cuatro archivos PHP y `git diff --check`: OK.
- PHPStan completo con `--memory-limit=1G`: sin errores. El intento inicial sin ese límite agotó los 256 MB del contenedor; antes de alinear vendor también detectó clases de dependencias ausentes.
- No se corrió la suite completa ni evaluaciones LLM: no hay cambios de IA ni llamadas facturables. Los primeros intentos de pruebas detectaron falta de permisos/esquema en la base de tests y un falso positivo por cookies omitidas en requests JSON de PHPUnit; se corrigió el entorno de prueba y se habilitó `withCredentials` antes de registrar los resultados finales.

## 5. Pendientes y riesgos

- Requiere Redis disponible: ante falla de Redis no se confirma un logout exitoso ni se permite recuperar una sesión sin comprobar revocación.
- Si se cambia el límite de ejecución HTTP por encima del margen de 180 segundos, revisar el TTL. No borrar marcas de revocación por separado de las sesiones.
- Una operación que ya estaba ejecutándose al cerrar sesión puede terminar; su cookie no vuelve a autorizar solicitudes futuras.
- Las otras pestañas pueden conservar contenido ya renderizado hasta su próxima comprobación; las llamadas autenticadas posteriores se rechazan.
- Sin prueba de navegador manual, staging ni producción. Push autorizado solo a la rama del ticket, para revisión contra `develop`; sin merge ni despliegue. El stack existente sigue disponible para las pruebas manuales solicitadas por el usuario.
