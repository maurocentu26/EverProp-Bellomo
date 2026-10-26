# EVP-44 — Instagram Login preparado para staging

Rama `ticket/EVP-44-instagram-login-staging` · base `d1bb1b3d07b9937e4d91ce8b33c248b9c5057d58` · 2026-10-26 · Álvaro con Codex. Publicación de rama y PR autorizada por Álvaro en chat. Commit identificable mediante `git log -1` de esta rama; sin merge ni despliegue.

## 1. Qué pedía el ticket

Preparar la corrección para recibir un mensaje de texto de Instagram y responder desde EverProp. EverSys Conversations se presenta como módulo de EverProp. Se retoma EVP-44 a nombre de Álvaro con autorización expresa en chat, ampliando el alcance anterior local a preparación revisable para staging.

Fuera de alcance: storage y adjuntos, IA, WhatsApp real, App Review/publicación, merge y despliegue. El alcance anterior de EVP-43 no implica que exista una prueba real satisfactoria.

## 2. Qué se implementó

- `everprop-api/routes/api.php`: GET/POST `/api/v1/webhooks/meta/instagram` para Instagram Login.
- `MetaWhatsAppWebhookController`: handshake y firma HMAC usan variables separadas de Instagram. Sin secreto responde 503; firma incorrecta 401. Solo admite objeto `instagram` en esa ruta. Los endpoints anteriores conservan sus secretos y objetos.
- `MetaWebhookProcessor` y `ProcessMetaWebhookReceipt`: resuelven tenant desde el mapping del canal, rechazan cuentas ambiguas y vinculan la recepción al modo `settings_json.instagram_login=true`. El job revalida tenant, integración y modo antes de aplicar el receipt. Receipts históricos sin modo siguen siendo Facebook Login.
- `MetaMessengerTransport`: Instagram Login envía texto a `graph.instagram.com/{version}/{user_id}/messages` usando el token cifrado de su integración; Messenger/Facebook Login conservan `graph.facebook.com/{version}/me/messages` y `messaging_type=RESPONSE`. No admite hosts arbitrarios.
- `everprop:instagram:connect-own`: exige tenant activo y TENANT_ADMIN activo de ese tenant. Pide token oculto, consulta `/me?fields=user_id,username`, exige identidad coincidente y crea integración dedicada/canal activo en transacción con auditoría. Usa `IntegrationTokens` existente. Bloqueo MySQL por cuenta evita dos aprovisionamientos concurrentes mediante este comando. Rechaza cualquier mapping existente, incluso propio/inactivo: no rota ni reemplaza credenciales de otra integración.
- Variables nuevas documentadas en `.env.example` y `docker/production/environment.example`: `META_INSTAGRAM_APP_SECRET`, `META_INSTAGRAM_WEBHOOK_VERIFY_TOKEN`. Sin forwards SQL ni dependencias nuevas.

### Preparación operativa para staging (pendiente de revisión y despliegue)

1. Revisar diff y PR; aprobar posteriormente merge/despliegue. Desplegar la misma revisión en API y worker; el worker debe conocer el modo nuevo del receipt antes de recibir eventos nuevos.
2. En Railway, API necesita `META_INSTAGRAM_APP_SECRET` de la configuración de Instagram Login y `META_INSTAGRAM_WEBHOOK_VERIFY_TOKEN` nuevo y aleatorio. No sustituir `META_APP_SECRET` ni su verify token. No confundir app ID público con App Secret ni pegar secretos en chat/Git.
3. API y worker deben compartir `APP_KEY` (validar igualdad sin mostrarla), base de datos y `META_GRAPH_VERSION`; usar la versión elegida en Meta (v26.0 en la configuración inspeccionada). La imagen hace `config:cache` al arrancar: aplicar variables con reinicio/despliegue, no solo guardarlas en el panel. El worker que envía necesita `META_SEND_ENABLED=true`; API también si algún envío se ejecuta allí. Este interruptor es global: antes de habilitarlo revisar canales activos y outbox pendientes para evitar envíos no previstos. Mantener IA desactivada.
4. Ejecutar en una terminal interactiva **del servicio de staging**, con el tenant y administrador de pruebas comprobados en ese entorno:

   ```sh
   php artisan everprop:instagram:connect-own --tenant='<slug-staging>' --admin='<admin-staging>' --account='<user_id-verificado>'
   ```

   El token se ingresa únicamente en el prompt oculto. Es un token de Instagram Login generado para la cuenta receptora, con permisos `instagram_business_basic` y `instagram_business_manage_messages`. No usar Page token ni token del emisor. El comando no envía mensajes ni cambia la suscripción de Meta. Si ya hay canal, detenerse y revisar su pertenencia; no borrar filas para forzar el comando.
5. En Meta → Instagram → configuración con Instagram Login, reemplazar el túnel anterior por `https://<dominio-api-staging>/api/v1/webhooks/meta/instagram`, proporcionar el verify token de staging y verificar el challenge. Confirmar `messages` suscrito y suscripción de la cuenta receptora activa. La UI inspeccionada advertía restricciones de eventos para apps sin publicar: confirmar que los roles/cuentas y acceso estándar permitan la prueba; no declarar aprobado/publicado sin evidencia.
6. Probar un mensaje nuevo con marcador único desde la cuenta emisora autorizada. Confirmar receipt procesado, conversación en el tenant correcto, texto una sola vez y sin eco. Reclamar la conversación y responder desde EverProp dentro de 24 horas; verificar ID de mensaje y recepción en Instagram. No reintentar envíos `UNKNOWN` a ciegas. Si el marcador no aparece, revisar firma, mapping, suscripción, permisos y worker antes de reenviar.

Dominios y accesos: la inspección remota previa confirmó APP_URL/CORS/Sanctum con los orígenes exactos del panel y API de staging; no se modificaron. Revalidar el dominio efectivo, resolución de tenant y login del panel después del despliegue. No se requieren cambios de cookies/CORS para el webhook servidor a servidor. El procedimiento no valida producción.

## 3. Por qué esta solución

Reutiliza recepción durable, deduplicación, resolución de tenant, política de ventana de servicio y cifrado existentes. El modo vive en settings_json, sin una migración ni un transporte paralelo. Se añade un alta operativa propia como la de WhatsApp existente, en lugar de construir OAuth/UI fuera del piloto.

Referencias de Meta consultadas por MCP el 2026-10-26: [identidad y token](https://developers.facebook.com/documentation/instagram-platform/instagram-api-with-instagram-login/get-started), [envío de mensajes](https://developers.facebook.com/documentation/instagram-platform/instagram-api-with-instagram-login/messaging-api). La identidad para webhook/envío es `user_id`, no el `id` app-scoped del token.

## 4. Cómo se verificó

PHP 8.4 y MySQL 8.4 del stack local existente, código y vendor copiados a `/tmp/evp44` dentro del contenedor PHP, sin cambiar el checkout servido. Base `bellomo_crm_test`, fixtures sintéticos con rollback; ningún reset/importación/migración. No se inició otro stack ni se detuvo el existente.

- TDD: las dos regresiones iniciales fallaron con 404 y endpoint Facebook; las seis pruebas anteriores pasaban. Las pruebas del comando fallaron porque aún no existía.
- `php artisan test tests/Feature/Conversations tests/Feature/Integrations`: 181 pruebas, 1231 aserciones, todas pasan antes de añadir dos negativos adicionales de autorización/contención.
- Validación final: `php artisan test --compact tests/Feature/Conversations tests/Feature/Integrations`: **183 pruebas, 1239 aserciones, todas pasan**; incluye negativos de autorización y contención real con dos conexiones MySQL.
- `php vendor/bin/pint --test` en los nueve archivos PHP modificados/nuevos: pasa. `git diff --check`: pasa.
- PHPStan inicial agotó 256 MB; repetición con `--memory-limit=1G`: sin errores.
- Revisión independiente `tenant-isolation-reviewer`: sin hallazgos bloqueantes, altos ni medios en firmas, mapping, tenant, receipts, tokens y alta. Señaló cobertura faltante de admin inactivo/rol y contención; se agregaron pruebas MySQL para esos casos.

## 5. Pendientes y riesgos

No está desplegado ni conectado el canal remoto. Falta instalar secretos de Instagram, validar identidad/token del receptor en staging, cambiar callback y completar recepción/respuesta reales. La prueba HTTP simulada no certifica permisos ni entrega de Meta.

El alta es solo inicial y rechaza mappings existentes. No hay renovación automática del token; su caducidad y permisos deben controlarse antes del piloto. El bloqueo serializa este comando, no escrituras SQL manuales; la recepción sigue rechazando mappings activos ambiguos. `META_SEND_ENABLED` afecta a todos los canales Meta: revisar outbox/canales antes de activarlo. Storage queda pendiente por decisión de producto.
