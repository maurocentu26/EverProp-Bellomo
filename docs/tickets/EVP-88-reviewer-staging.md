# EVP-88 — Acceso de revisión de Meta aislado

Rama `ticket/EVP-88-reviewer-staging` desde `origin/develop` `fc20afa2fa6dc17156d3e032321ec32c1ab815c2`. Álvaro con Codex, 27/10/2026. [EVP-88](https://eversys.atlassian.net/browse/EVP-88), ID 10189, creado, asignado a Álvaro y pasado a En curso antes de editar. Implementación y evidencia en el commit que contiene este informe. Álvaro autorizó expresamente commit, push, PR hacia develop y, si CI pasa, merge y despliegue exclusivamente en staging. Esa aprobación no crea ni comparte la cuenta remota del revisor.

## 1. Pedido

Preparar un entorno de revisión separado para no entregar el administrador interno con conversaciones/teléfonos del equipo. Reutilizar tenancy y RBAC, preservar Centu, preparar instrucciones y material real. El login y texto del piloto ya se probaron en EVP-87/PR81.

## 2. Implementación

- `PrepareMetaReview.php`: preview por defecto; `--apply` provisiona solo `meta-review-staging` marcado, revisor ficticio con rol `TENANT_ADMIN`, IA/copiloto apagados al crear. Guardas de staging o base de tests, contraseña oculta sin fallback visible, validación existente, hash del modelo, transacción y bloqueo. No copia datos internos ni rota/reactiva cuentas existentes.
- `InstagramOnboarding.php`, `services.php` y `.env.example`: mapa opcional de callbacks por slug resuelto en servidor. Default actual preservado, misma validación de hostname/HTTPS y state ligado a la URI que se canjea. Necesario para que el tenant del revisor no use el callback del piloto interno.
- Diez pruebas de provisión y aislamiento, y tres pruebas de callback: el override conserva el default y se usa en el canje; cambiar la URI invalida state; un callback de otro tenant se rechaza.
- `everprop-api/docs/meta-review-staging.md`: operación, dominios exactos y proxy firmado, credenciales, recuperación y guiones por permiso. No se asignó aún un hostname público ni se concedió acceso externo.
- Material del cuestionario: tabla de datos y proveedores contrastada con el código y borrador técnico en inglés. Distingue limpieza del payload de webhook, historial del chat y borrado de credenciales; deja sin completar los hechos contractuales y organizativos que el código no demuestra.

Sin SQL, nuevos roles, dependencias, cambios de frontend ni alteraciones al baseline. La provisión es administrativa por CLI; no hay endpoint HTTP que permita elegir o crear tenants.

## 3. Decisiones

Se reutilizan Tenant, User, hash, autorización y configuración de inventario existentes. El namespace de revisión es fijo; no se construye un aprovisionador genérico. Una cuenta modificada requiere revisión del operador. Repetir conserva datos, contraseña y decisiones posteriores de IA.

Un callback único impide habilitar el tenant del revisor sin quitar el recorrido del piloto. El override en servidor mantiene ambos y exige pertenencia del hostname. No se permite un redirect elegido por el cliente ni se debilitan cookies/CORS/CSRF.

## 4. Verificación

Verificación local completada en una copia aislada `/tmp/evp88` del contenedor PHP 8.4.26, con MySQL 8.4 y Redis existentes; base `bellomo_crm_test`. No se editó el checkout montado `develop-preview`, no se importó el baseline ni se ejecutaron migraciones sobre datos reales. Las llamadas a proveedores se bloquean en los tests. TDD: comando inexistente y callback del segundo tenant con respuesta 503 antes de implementar; ambos escenarios pasan después.

- `php artisan test tests/Feature/Identity tests/Feature/Tenancy tests/Feature/Integrations tests/Feature/Conversations --log-junit=/tmp/evp88-regression.xml`: **255 pruebas, 3.115 aserciones, cero fallos y errores**, 35,01 segundos.
- `php vendor/bin/phpstan analyse -c phpstan.neon --no-progress --memory-limit=1G --debug` sobre los cinco archivos PHP afectados: **sin errores**, configuración real del proyecto con Larastan, nivel 6.
- `php vendor/bin/pint --test` sobre esos cinco archivos: **aprobado**.
- Contrato existente del proxy del panel: `node --test tests/tenant-signature.test.mjs`, **4 pruebas aprobadas**. No hay cambios de frontend.
- Prueba de aislamiento con datos sintéticos internos existentes: el revisor ve solo su usuario; listas de canales y conversaciones vacías; lectura de mensajes internos y uso del host firmado ajeno devuelven 404. El dueño interno conserva acceso a sus mensajes.

La primera ejecución amplia detectó siete fallos de sesión por una copia de entorno incompleta (faltaban Redis como driver de sesión y el origen Sanctum de los tests). Se corrigió únicamente el entorno aislado y se repitió la suite; los resultados finales anteriores corresponden a esa configuración. Un chequeo exploratorio de PHPStan sin su archivo de configuración no se cuenta como validación: el aprobado usa `phpstan.neon` y nivel 6.

Revisión independiente de aislamiento y callbacks sin bloqueos. Detectó antes el fallback visible del prompt si la terminal no podía ocultarlo; corregido con `secret(..., false)` y regresión del contrato Symfony. Evidencia JUnit y registros en `cierre-meta/evp88-regression.xml`, `evp88-regression.txt`, `evp88-pint.txt` y `evp88-verification.json` de los artefactos de esta tarea.

No se comprobó en navegador el acceso del revisor: este cambio sigue local y aún no existe su hostname ni su cuenta remota. El recorrido real de Centu que ya funcionó corresponde a PR #81, no se presenta como prueba remota de EVP-88.

## 5. Pendientes y riesgos

La publicación y posterior integración en staging si CI pasa fueron autorizadas expresamente el 27/10/2026 (CLAUDE.md, invariante 11). Antes de habilitar la cuenta remota del revisor: dominio de revisión, firma compartida de servidor, mapa de tenants, CORS/Sanctum/cookies, callback de Meta y provisión interactiva por operador con el alcance autorizado. Crear un usuario local de prueba no concede acceso remoto. No se publicó una contraseña ni se compartió acceso con Meta.

Faltan los videos reales y los datos y decisiones del responsable para el cuestionario y la política pública. No se enviará App Review ni se publicará la política por esta preparación. WhatsApp Embedded Signup sigue deshabilitado; la demostración de gestión puede usar la alternativa oficial de WhatsApp Manager. Los campos específicos de eliminación y desautorización de Instagram no se presentan como un requisito de envío obligatorio comprobado. No se certifica capacidad de 1.000 usuarios, acceso de producción ni cumplimiento legal.
