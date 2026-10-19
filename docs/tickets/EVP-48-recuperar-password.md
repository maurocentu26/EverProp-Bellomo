# EVP-48 — Recuperación de contraseña por correo

Rama `ticket/EVP-48-recuperar-password` desde `origin/develop` (`27fc8cf`) · 2026-10-19 · Codex con Mauro.

## 1. Qué pedía el ticket
Recuperar acceso mediante un enlace enviado al correo registrado, sin conocer ni exponer la contraseña actual. El usuario autorizó iniciar en paralelo a EVP-47. Incluye solicitud desde login, nueva contraseña confirmada, vencimiento, uso único, aislamiento por tenant y rechazo de sesiones anteriores. No incluye despliegue ni envío a una cuenta real.

## 2. Qué se implementó
- `everprop-api/app/Domain/Identity/Http/Controllers/PasswordRecoveryController.php`: POST `/api/v1/auth/forgot-password` y `/api/v1/auth/reset-password`. Reutiliza el broker de Laravel con cache, validación, lock por tenant/correo y bloqueo transaccional de la cuenta.
- `everprop-api/config/auth.php`: broker `recovery` (60 minutos; 60 segundos entre emisiones), mapa explícito de orígenes HTTPS por tenant y mailer SMTP.
- `everprop-api/app/Models/User.php`: identidad del repositorio de tokens incluye tenant, ID público, correo y hash actual. Una modificación de contraseña invalida enlaces anteriores, aunque el cache no se haya limpiado todavía.
- `everprop-api/app/Domain/Identity/Http/Requests/LoginRequest.php`: registra el hash de sesión tras autenticar. Sanctum ya valida ese snapshot en cada petición; ahora también queda registrado si todavía no hubo ninguna petición autenticada posterior al login.
- `everprop-api/app/Providers/AppServiceProvider.php` y `routes/api.php`: rutas con tenant confiable y límite independiente de 5 solicitudes/minuto por tenant/IP. Se mantiene el flujo CSRF de Sanctum.
- `everprop-public/src/app/recuperar/page.tsx` y login: enlace “Olvidé mi contraseña”, solicitud por correo y formulario de nueva contraseña con confirmación, estados y errores accesibles. El secreto llega en fragmento de URL y se envía únicamente en cuerpo POST; se elimina del historial al completar.
- OpenAPI, ejemplos de configuración, prueba de frontend y workflow Web actualizados.

## 3. Por qué esta solución
Se reutilizan Laravel PasswordBroker, cache compartido, locks, SMTP, `password_hash` con cast `hashed`, Sanctum y el cliente `apiFetch`. No requiere dependencia ni tabla nueva. No cambia activación de cuentas ni permite recuperar cuentas pausadas/eliminadas.

La consulta y el envío se ejecutan con `defer()` después de la respuesta HTTP para no revelar existencia de cuenta por contenido o demora SMTP. Un fallo posterior registra únicamente `password_recovery_delivery_failed` y tenant ID, sin excepción, destinatario ni token; la respuesta pública se mantiene genérica. No se usa el mailer log ni failover. El envío SMTP tiene timeout de 10 segundos, menor al lease del lock de 30 segundos. No hay worker adicional: el trabajo termina en el mismo proceso PHP después de responder. Una caída del proceso puede impedir el envío; el usuario puede volver a solicitarlo.

## 4. Cómo se verificó
- `npm run test:password-recovery`: 3 pruebas aprobadas (CSRF/solicitud, confirmación/token POST, error y reintento). Hooks/API simulados siguiendo el patrón Node/TypeScript existente.
- ESLint sobre login, recuperar y su prueba: aprobado sin avisos.
- `npm run build`: aprobado (compilación, TypeScript y generación de rutas).
- Navegador sobre build local: pantallas de solicitud y nueva contraseña, campos accesibles y rechazo de contraseñas distintas comprobados con correo/token ficticios. No se llamó a producción.
- PHP: solo comprobación de sintaxis `php -l` con PHP 8.5 del host; no equivale a ejecución Laravel ni compatibilidad PHP 8.4.
- OpenAPI parsea como JSON válido; diff sin errores de whitespace.
- Revisión independiente `tenant-isolation-reviewer`: sin hallazgos pendientes. Se corrigió su hallazgo de límite compartido y se añadió prueba con dos tenants/IP compartida. No aplica revisión LLM (no toca IA).
- **Pendientes**: suite PHP con MySQL/Redis, Pint, PHPStan y entrega SMTP real. Docker Desktop falla al iniciar por acceso al socket local `dockerInference`; `docker info` no responde. Se verificó el acceso directo instalado actual y se intentó arrancar desde él. No se inició ningún stack ni se borraron contenedores, bases ni volúmenes. El intento reversible de mover el socket falló por acceso; no se restableció Docker.
- Se dejaron 8 pruebas PHP en `tests/Feature/Identity/PasswordRecoveryTest.php`: mensaje de correo con transporte en memoria, no enumeración/token hash, replay, correo compartido entre tenants, expiración y contraseña cambiada, validación, pausados/fallo SMTP, bloqueo de configuración/cupo, sesión anterior y bucket aislado. **No ejecutadas localmente**.

## 5. Pendientes y riesgos
Antes de producción, ejecutar los checks de backend y habilitar la configuración en API (no en variables públicas del frontend):

```dotenv
PASSWORD_RESET_FRONTENDS_JSON={"bellomo":"https://ever-prop-bellomo.vercel.app"}
PASSWORD_RESET_MAILER=smtp
```

Provisionar `MAIL_HOST`, `MAIL_PORT`, `MAIL_SCHEME`, `MAIL_USERNAME`, `MAIL_PASSWORD`, `MAIL_FROM_ADDRESS` y `MAIL_FROM_NAME` mediante el proveedor de secretos. El mailer elegido debe ser SMTP, con host y remitente válidos. Es posible elegir `collections` solo si ese remitente y su uso están autorizados para recuperación; no se heredan ni se cambian automáticamente las credenciales de cobranzas.

Sin origen o SMTP válidos, solicitar un enlace devuelve 503 para cualquier correo. Con SMTP caído después de responder, se registra la falla genérica y se permite reintentar según el límite. La configuración productiva existente exige cache/sesiones persistentes (`redis` o `database`) mediante `everprop:production-check`; no se duplica esa validación.

Los enlaces se invalidan al cambiar contraseña; Sanctum rechaza las sesiones con hash anterior en su siguiente petición. Las sesiones históricas que nunca guardaron snapshot son rechazadas: al desplegar, sus titulares deberán volver a iniciar sesión. La prueba específica usa una sesión autenticada sin snapshot. Comprobar también este comportamiento en staging. No se puede revocar una petición que ya fue autorizada y está ejecutándose.

Entrega para revisión, sin merge a `develop`/`main`, sin despliegue y sin enviar enlaces a personas reales. EVP-47 (ojito en login) sigue siendo un ticket independiente.
