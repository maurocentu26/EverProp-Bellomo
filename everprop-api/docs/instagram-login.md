# Instagram Login — EVP-87

EverSys Conversations es el módulo de conversaciones de EverProp. La conexión se inicia en **Configuración → Instagram de la inmobiliaria**, con una sesión activa y capacidad `manageIntegrations` del tenant resuelto en servidor.

## Configuración por entorno

El alta queda apagada por defecto. La API necesita:

- `META_INSTAGRAM_ONBOARDING_ENABLED=true`.
- `META_INSTAGRAM_APP_ID`: ID de la aplicación de **Instagram**, distinto del ID principal de Meta.
- `META_INSTAGRAM_APP_SECRET`: secreto de Instagram, solo en el gestor del entorno; nunca `NEXT_PUBLIC_*`.
- `META_INSTAGRAM_REDIRECT_URI`: URI exacta del panel con ruta `/integrations/instagram/callback`, sin query ni fragmento.
- El hostname del callback debe estar en `TENANT_HOST_MAP_JSON`, vinculado al mismo tenant. HTTPS obligatorio fuera de local/testing. No se aceptan callbacks elegidos por el cliente.
- Redis compartido por todas las réplicas (`CACHE_STORE=redis`) para state y locks; fuera de local/testing, otra caché deshabilita el alta.

Para staging, la URI que habrá que registrar literalmente en **Instagram → Configuración de la API con Instagram Login → Inicio de sesión para empresas → OAuth redirect URIs** es:

`https://panel-staging-staging-62ec.up.railway.app/integrations/instagram/callback`

No se configuró ni desplegó este cambio al preparar la rama. Al desplegar, verificar dominio exacto de panel/API, `TRUSTED_HOSTS`, mapa de tenants, CORS, Sanctum y cookies first-party a través del proxy firmado existente. El callback es una página pública del panel; el POST de canje exige autenticación, sesión y CSRF existentes. Una sesión perdida exige reiniciar el recorrido desde Ajustes. No transferir el código entre navegadores.

## Contrato y seguridad

| Endpoint `/api/v1/admin/integrations/instagram` | Resultado |
| --- | --- |
| `GET /config` | `enabled` y `connections`: UUID, username/display_name, status, expires_at y token_status. Nunca credenciales. |
| `POST /authorize` | URL oficial de autorización con `state` aleatorio, ligado a usuario, tenant, sesión y callback; TTL 10 minutos. |
| `POST /connect` | Body `{state, code}` o `{state, error}`. Consume state una sola vez bajo lock; canjea el código y obtiene token largo, identidad y suscripción a mensajes. HTTP201 solo tras persistir. |
| `POST /{integration}/refresh` | Renueva una conexión existente del mismo tenant, activa, con vigencia conocida y token emitido hace al menos 24 horas. |

Los POST tienen límite de 6 solicitudes/minuto con el middleware existente. `tenant_id`, `user_id` y `redirect_uri` no se aceptan en el body de conexión. UUID ajeno en renovación devuelve 404. Los roles sin capacidad y usuarios inactivos reciben 403. Antes de guardar se revalidan actor y tenant activos, bajo locks de base.

El navegador solicita solo `instagram_business_basic` y `instagram_business_manage_messages`. El servidor contrasta el ID del canje con `/me`; no confía en una cuenta enviada por el navegador. Suscribe `messages,messaging_seen`. La identidad visible viene de esa respuesta. El lock global por cuenta coincide con `everprop:instagram:connect-own`: ninguna cuenta puede reasignarse entre tenants. Reconectar la misma cuenta conserva canal, integración e historial.

`IntegrationTokens` cifra el token y guarda `token_expires_at` a partir del `expires_in` confirmado por Meta. Un fallo no borra la conexión previa ni devuelve textos de error de Meta. Renovación y alta auditadas, sin tokens/códigos en la auditoría. El callback elimina query/fragmento de la barra, no usa storage y usa `Referrer-Policy: origin` y `noindex`: conserva únicamente el origen para la sesión Sanctum, nunca path/query/fragmento. Mantener desactivada la captura de query/body sensibles en logs, trazas y analítica del proxy/hosting del callback; no agregar scripts de terceros a esa ruta.

El flag de onboarding impide **altas y reconexiones**; no impide renovar un acceso existente. Eso permite mantener el canal operativo al suspender nuevas altas. Desactivar envíos usa el control existente `META_SEND_ENABLED`; el flag de onboarding no revoca credenciales.

El `user_id` del canje OAuth es el ID de usuario acotado a la app. Se contrasta con `/me.id`; `/me.user_id` es el ID de la cuenta profesional usado por los webhooks y el canal. No se comparan como si fueran el mismo ID.

## Vigencia y recuperación

- Token con vigencia confirmada: **Renovar acceso**, una vez transcurridas 24 horas desde alta/última renovación y antes de vencer. La renovación es manual; no se agregó scheduler.
- Token vencido, retirado o sin fecha conocida: **Conectar Instagram** y autorizar nuevamente. No se presenta un `NULL` histórico como acceso ilimitado ni se inventa una fecha para Centu.
- State vencido, otra sesión o cancelación: comenzar desde Ajustes; no reintentar el mismo código ni copiarlo a otro navegador.
- Timeout: revisar primero la cuenta en Ajustes. El servidor podría haber completado la conexión; reconectar la misma cuenta es idempotente respecto del canal, no un nuevo historial.
- Fallo de renovación: conserva token anterior; si cambió/revocó mientras Meta respondía, la respuesta vieja no lo sobrescribe. Revisar la vigencia en Ajustes y reconectar si corresponde.
- Revertir el código no exige SQL. Antes de revertir o cambiar `APP_KEY`, conservar la clave que cifra los tokens; rotarla sin procedimiento dejaría credenciales ilegibles.

## Guion real para App Review, después del despliegue aprobado

1. Ingresar con credenciales de **EverProp** de pruebas, sin entregar credenciales de Instagram. El revisor conecta su propia cuenta profesional.
2. Abrir Configuración, pulsar Conectar Instagram y confirmar el cambio. Autorizar únicamente perfil profesional y mensajes en la pantalla de Instagram.
3. Mostrar el regreso al panel y el `@username` real conectado, con vigencia.
4. Enviar un DM desde otra cuenta autorizada; mostrar recepción en bandeja, respuesta humana y su llegada en Instagram. Para la demostración interna usar solo Álvaro como emisor.
5. Si se demuestra IA, usar solo datos sintéticos y la configuración/aviso aprobado. Mostrar transferencia a humano y ausencia de respuesta automática tardía.
6. Grabar el recorrido real; las pruebas locales con Meta simulado y las capturas no sustituyen el video de App Review ni su aprobación externa.

Fuentes oficiales consultadas el26/10/2026: [Business Login](https://developers.facebook.com/documentation/instagram-platform/instagram-api-with-instagram-login/business-login), [webhooks](https://developers.facebook.com/docs/instagram-platform/webhooks/). Token largo hasta60d; renovación válida desde24h y antes del vencimiento. No se agregan parámetros PKCE que esa documentación no especifica para este flujo.
