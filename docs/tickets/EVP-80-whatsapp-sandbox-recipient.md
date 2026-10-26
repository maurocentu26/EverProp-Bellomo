# EVP-80 — Respuesta de WhatsApp sandbox desde la bandeja

Rama `ticket/EVP-80-whatsapp-sandbox-recipient`, desde `develop` d63a16c. Fecha 2026-10-26, Álvaro con Codex. Commit, push y apertura de PR autorizados por Álvaro. Sin despliegue.

## 1. Qué pedía el ticket

Permitir la prueba de texto en staging cuando el wa_id argentino entrante lleva 9 móvil, pero el sandbox de Meta solo acepta como destinatario la variante del mismo número sin 9. Inbound real recibido; dos respuestas de bandeja rechazadas con Graph 131030. El diagnóstico directo al formato sin 9 fue aceptado y el usuario confirmó su recepción. Verificar la variante con 9 en Meta y agregar `+` no corrigió el rechazo.

Fuera de alcance: normalización universal, producción, otros clientes, adjuntos, plantillas, IA y storage.

## 2. Qué se implementó

- Excepción en `WhatsAppCloudTransport` solo para texto libre, un Phone Number ID y un destinatario entrante exactos configurados en servidor.
- El destino debe ser exactamente el mismo número argentino sin 9: origen `549` + diez dígitos, destino `54` + esos mismos diez dígitos. Otro destino o una configuración inválida produce `SANDBOX_RECIPIENT_INVALID` sin HTTP.
- Configuración opcional, desactivada por defecto, documentada sin teléfonos personales en `.env.example`:
  - `META_WHATSAPP_SANDBOX_PHONE_NUMBER_ID`
  - `META_WHATSAPP_SANDBOX_RECIPIENT_FROM`
  - `META_WHATSAPP_SANDBOX_RECIPIENT_TO`
- No cambia `provider_thread_id`, contactos, receipts, esquema, tokens ni outbox. No agrega reintentos ni envíos de diagnóstico automáticos.

## 3. Por qué esta solución

Reutiliza el transporte compartido por las respuestas de la bandeja y los jobs. La excepción explícita evita quitar 9 globalmente o cambiar la identidad usada para deduplicar y enlazar mensajes entrantes. El Phone Number ID ya es único entre tenants; tokens y autorización siguen resolviéndose con tenant/integración. No agrega dependencias ni abstracciones.

## 4. Cómo se verificó

Docker PHP 8.4 y MySQL 8.4, copia aislada del código en `/tmp/evp80` dentro del contenedor existente, base local de pruebas `bellomo_crm_test`; sin otro stack ni importaciones o cambios de esquema. Los fixtures nuevos usan transacciones. No se detuvieron servicios ajenos.

- Rojo: 2 fallos esperados antes de implementar (destino no transformado y configuración inválida no rechazada).
- Verde: 7 pruebas nuevas, 25 aserciones. Incluyen webhook → takeover → respuesta por API, outbox SENT e identidad entrante conservada; otros destinatarios/tenant/canal, destinos inválidos, configuración desactivada, medios y plantillas.
- Regresión Conversations + Integrations: **190 pruebas, 1264 aserciones, todas pasan**.
- Pint en los tres PHP cambiados: pasa. PHPStan global con memoria 1G: sin errores. `git diff --check`: pasa.
- La configuración inicial del entorno temporal omitía resolver local y Redis, causando fallos de infraestructura. Se completó exclusivamente en `.env.testing` temporal y se volvió a ejecutar toda la regresión con éxito.
- Revisión independiente `tenant-isolation-reviewer`: sin hallazgos bloqueantes; sugerencias de cobertura incorporadas. No se toca IA.

## 5. Pendientes y riesgos

Antes de staging: revisión del PR y autorización de merge/despliegue. No se aplicaron cambios de runtime para esta corrección.

Tras desplegar, configurar las tres variables únicamente para el canal sandbox de `bellomito-staging` y el número de prueba verificado del usuario en el gestor de Railway, nunca en Git. El worker necesita la configuración porque ejecuta el envío; mantener API y worker consistentes y reconstruir config cache mediante despliegue normal. Callback existente: `https://api-staging-30f3d.up.railway.app/api/v1/webhooks/meta/whatsapp`; panel: `https://panel-staging-staging-62ec.up.railway.app`. No cambian dominios, CORS, Sanctum, cookies ni credenciales. Canal y token cifrado ya están activos en staging; la credencial temporal debe renovarse al vencer.

Validación pendiente: nuevo texto desde la bandeja desplegada, estado aceptado/entregado y confirmación del usuario en WhatsApp. El envío directo de diagnóstico anterior no reemplaza esa validación. Revertir la excepción vaciando las tres variables y desplegando la configuración del worker; no hay datos que deshacer. Los valores deben mantenerse limitados al número sandbox; no es una regla general de telefonía argentina.
