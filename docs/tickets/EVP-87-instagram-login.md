# EVP-87 — Instagram Login y cuenta conectada para App Review

Rama `ticket/EVP-87-instagram-login`, base `origin/develop` `c0afe0c9ca6915916765d3d22cd3efdde56fbc64`. Preparación local 26/10/2026 (Argentina); verificaciones desde 27/10 UTC. Autor: Codex para Álvaro. Commit, push y apertura de PR autorizados por Álvaro el26/10/2026. Corrección de CI, actualización del PR80 y merge/staging si los checks pasan autorizados el27/10/2026.

## 1. Qué pedía el ticket

El modal vigente de `instagram_business_basic` pide mostrar la conexión de una cuenta profesional y su identidad en EverProp; el revisor debe poder conectar su propia cuenta. EVP-44 tenía webhook y aprovisionamiento por CLI, sin este recorrido. También faltaba registrar vigencia real del token.

Criterios: iniciar OAuth con RBAC y tenant existentes, state ligado a sesión/usuario/tenant con consumo único y TTL, callback fijo, identidad visible, token cifrado con expiración confirmada, renovación segura, preservar canal/historial y exclusividad, negativos entre tenants, revisión independiente e instrucciones de prueba.

Fuera de alcance: producción/main, storage/multimedia, responsive cancelado, publicar política legal, enviar App Review y cambiar la facturación de Gemini. Jira creado y verificado En curso, asignado a Álvaro, antes de los cambios.

## 2. Qué se implementó

- `everprop-api/app/Domain/Integrations/Services/InstagramOnboarding.php`: autorización, state compartido de10min consumido bajo lock, canje y token largo, contraste de identidad, suscripción `messages,messaging_seen`, conexión/reconexión, vigencia y renovación. Revalida actor/tenant activos antes de guardar y compara token vigente al renovar, para no resucitar accesos revocados.
- `everprop-api/app/Domain/Integrations/Http/Controllers/InstagramConnectionController.php` y `routes/api.php`: config/listado y POST authorize/connect/refresh. Reutiliza `manageIntegrations`, `TenantContext`, sesión/CSRF de Sanctum y límite de solicitudes. No recibe tenant ni callback desde el navegador.
- `everprop-api/config/services.php` y `.env.example`: tres variables nuevas, apagadas por defecto: `META_INSTAGRAM_APP_ID`, `META_INSTAGRAM_REDIRECT_URI`, `META_INSTAGRAM_ONBOARDING_ENABLED`; reutiliza `META_INSTAGRAM_APP_SECRET`.
- `everprop-public/src/components/admin/InstagramConnect.tsx` y Ajustes: confirmación de conexión, username, estado y vencimiento. Acceso sin fecha conocida pide reconexión. Permite renovar accesos válidos.
- `InstagramCallback.tsx`, página `/integrations/instagram/callback` y headers en `next.config.ts`: página fuera del gate de administración, POST autenticado con las cookies first-party existentes; elimina query/fragmento del historial, no guarda el código en storage y evita doble consumo por efectos React. `no-referrer` y `noindex` comprobados en navegador local.
- `everprop-api/docs/instagram-login.md`: contrato, variables, URI exacta de staging, recuperación, límites y guion del revisor.
- Nuevas pruebas en `InstagramOnboardingTest.php` e `instagram-connect.test.mjs`.

No hay cambios SQL. Baseline conserva SHA256 `4c8b170bc6f8b6827e9b85e756acb2254ccf392b0ff4c11459c775366bae472d`. No se cambió ninguna variable remota ni se renovó Centu durante la preparación.

## 3. Por qué esta solución

Reutiliza `IntegrationTokens`, auditoría, RBAC, proxy firmado y flujo de sesión existentes. El lock de cuenta es el mismo que usa `ConnectOwnInstagram`, así que ambas entradas respetan la exclusividad global. Reconectar conserva canal, integración e historial; no se reescribió el comando anterior.

El callback vive en el origen del panel para usar cookies first-party; el canje queda en backend. No se añadió SDK, dependencia, cola, tabla ni esquema de roles. La documentación oficial consultada no especifica PKCE para Instagram Business Login; no se inventaron parámetros incompatibles.

El flag impide altas/reconexiones, sin cortar renovaciones de canales existentes. La renovación es manual y exige token válido y conocido, emitido hace al menos24h. No se agregó scheduler ni se declaró ilimitado el token histórico con fechaNULL.

## 4. Cómo se verificó

Docker existente PHP8.4.26, MySQL8.4 y Redis; código copiado a `/tmp/evp87`, base de pruebas `bellomo_crm_test`, confirmada por `DB::getDatabaseName()` con `APP_ENV=testing`. No se tocó el checkout montado de otro trabajo ni se inició otro stack. No SQLite ni llamadas reales a Meta/Gemini.

- TDD: nuevas rutas fallaron inicialmente (405); nuevos componentes fallaron inicialmente por inexistentes. Luego implementación y comprobación.
- `php artisan test tests/Feature/Conversations tests/Feature/Integrations --log-junit /tmp/evp87-tests.xml`: **208 tests /2802 aserciones**, sin fallos (incluye los10 casos iniciales nuevos). Ejecución posterior al último test agregado: `--filter=InstagramOnboardingTest`: **11 tests /196 aserciones**, sin fallos. No sumar ambas cifras como pruebas únicas.
- Negativos: mismo actor con otra sesión, otro actor y tenant, TTL, consumo único y lock Redis contendido, permisos faltantes, identidad discordante, suscripción fallida, vigencia faltante, conexión a Meta caída, cuenta ajena, renovación prematura, token sin vigencia, revocación o rotación mientras responde Meta y actor/tenant revocados antes de persistir. Sin reemplazo de credenciales previas ante fallos.
- `php vendor/bin/pint` sobre los PHP modificados: aprobado. `php vendor/bin/phpstan analyse --no-progress --memory-limit=1G --debug`: global sin errores. Se usó1GiB y modo secuencial tras agotar256MiB en workers del entorno local.
- `node --test tests/instagram-connect.test.mjs tests/settings-redesign.test.mjs`: **12 tests**, sin fallos. ESLint dirigido a todos los TS/TSX modificados: sin errores ni advertencias.
- `npx next build --webpack`: aprobado, incluidos TypeScript y prerender del callback. `npm run build` con Turbopack falló por el `node_modules` enlazado fuera del root de este checkout; no se alteró configuración de producción para esconder esa limitación local. El check web del PR80 aprobó el build limpio en GitHub.
- Playwright/Firefox sobre build de producción local: Ajustes muestra identidad y vigencia desconocida; confirmar/cancelar funciona; callback limpia la URL, realiza exactamente un POST y muestra la cuenta. Headers `Referrer-Policy: no-referrer` y `X-Robots-Tag: noindex, nofollow` verificados. APIs interceptadas con datos sintéticos: prueba de UI, no OAuth real ni demostración de cookies reales/Meta.
- Revisión independiente `tenant-isolation-reviewer` (agente Codex): sin bloqueos en backend/frontend; se incorporaron sus negativos y limpieza del lock con finally. No se invocó ni reactivó Claude.

Evidencia fuera del repo: `cierre-meta/evp87-regression.xml`, `evp87-onboarding.xml`, `evp87-instagram-ajustes-local.png` y `evp87-instagram-callback-local.png`, en el directorio de visualizaciones de esta sesión. `git diff --check` aprobado.

### Corrección de CI, 27/10/2026

El primer API quality del PR80 (run40441376134, head44644d7) tuvo510 tests aprobados,1 omitido y1 fallo: el bucle de errores de Meta excedió el throttle del actor y recibió429 al iniciar OAuth. Reproducido localmente con `APP_ENV=testing CACHE_STORE=redis`: avanzar Carbon61s no vence un TTL real de Redis. La pasada local inicial no cubría esa combinación de arranque del rate limiter.

Se separaron los cuatro escenarios con `#[TestWith]`: cada caso conecta su fixture y comprueba que el intento fallido conserva el token y un único canal. Se eliminó el avance artificial del tiempo; no se cambió ni deshabilitó throttle, middleware o comportamiento de la API. Regresión focal con Redis: **14 tests/217 aserciones**, sin fallos. Pint y PHPStan del test aprobados; revisión independiente incremental antes de actualizar el PR. CI del nuevo commit debe aprobar antes de merge.

## 5. Pendientes y riesgos

1. Actualizar PR80 con la corrección de CI autorizada; esperar todos los checks y revisión satisfactorios antes de ejecutar el merge/staging autorizados. El ticket conserva En curso (este proyecto no tiene En revisión).
2. En staging, registrar el callback literal indicado en `everprop-api/docs/instagram-login.md`, configurar las tres variables y comprobar dominios/Sanctum/cookies desde el navegador. `META_INSTAGRAM_APP_ID` debe ser el ID de Instagram, no el principal de Meta.
3. Reconectar Centu con la nueva pantalla para obtener username y vigencia confirmados. Verificar DM de Álvaro, respuesta y entrega reales; solo entonces grabar el recorrido exigido por App Review. El código local no prueba esa conexión real.
4. Mantener monitorizada la fecha de acceso y renovarlo manualmente antes del vencimiento. Un acceso retirado/vencido necesita nueva autorización. No hay renovación automática.
5. Preparar credenciales dedicadas de EverProp para el revisor y videos reales. Completar cuestionario de datos, alinear política publicada con IA y confirmar facturación/tratamiento del proyecto Gemini con quien administra la clave. No declarar App Review enviada/aprobada.
6. Siguen fuera de este ticket la deriva histórica `cache/cache_locks/sessions`, métricas de costoUNKNOWN y preparación de producción. Antes de proponer producción faltará validar forwards, dominios/CORS/R2, tenant hosts/Sanctum/cookies, credenciales/permisos, base y storage.


## Seguimiento del callback real — 27/10/2026

Rama `ticket/EVP-87-instagram-callback` desde `origin/develop` `c4bc308`. PR80 ya integrado y desplegado; este seguimiento aún es local, sin nueva publicación.

En staging, el login normal de la cuenta de pruebas funciona. El consentimiento real de Centu retorna al callback, pero el POST respondió HTTP502 y la navegación posterior terminó en login. El token existente responde `/me` con `id` y `user_id` distintos; no se muestran secretos.

Dos correcciones acotadas:

- El ID recibido en el canje OAuth está acotado a la app: se compara con `/me.id`. El canal sigue usando `/me.user_id`, ID profesional de los webhooks. Ambos IDs se validan y la cuenta mantiene exclusividad global entre tenants. La fixture anterior igualaba ambos IDs y ocultaba el fallo; ahora son distintos y existe un negativo de ID de app discordante.
- El callback usa `Referrer-Policy: origin` en cabecera y metadata. El GET inicial de AuthProvider necesita un origen reconocible para Sanctum; `no-referrer` lo dejaba sin Referer ni Origin y recibía401. La política nueva transmite solo el origen, sin código/state/path/query/fragmento. No cambia CORS, cookies, CSRF, autenticación, permisos ni límites de solicitudes.

Verificación: PHP8.4/MySQL8.4/Redis en copia aislada `/tmp/evp87-callback`, reutilizando contenedores existentes sin editar el checkout montado. La prueba de identidad falla antes del cambio con502 y pasa después:15tests/231aserciones. Navegador Firefox aislado contra el build Next de producción local y API Laravel real: reproduciendo la política anterior, auth/me401; política nueva, auth/me200, Referer soloorigen y retorno a Ajustes autenticado. Cancelación y state sintéticos, sin llamadas a Meta. E2E de CI existente ampliado con esos dos controles; no se declara ejecutado completo localmente por este ensayo focal. BuildWebpack,5testsdecomponente,Pint y PHPStan focal aprobados. Regresión Conversations+Integrations:213tests/2851aserciones aprobadas. Revisión independiente Codex del diff actual: sin bloqueantes; no revisó su propio código.

Fuente oficial de identidad: https://developers.facebook.com/documentation/instagram-platform/instagram-api-with-instagram-login/business-login y https://developers.facebook.com/documentation/instagram-platform/instagram-api-with-instagram-login/get-started (consultadas27oct2026 mediante MCPMeta).

Pendiente: revisión, autorización de commit/push/PR y merge/despliegue de este ajuste concreto; luego repetir OAuthCentu para confirmar perfil/vigencia y mensaje real. No asumir que un test de proveedor simulado valida esa conexión.
