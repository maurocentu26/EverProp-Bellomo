# Meta App Review — preparación de W10 y W11

Estado al 2026-10-03. Nada de esto está presentado ni activado. Producción de Bellomo, `main` y envíos reales quedan fuera de alcance hasta la autorización X04. Los tests con Meta simulado **no** son evidencia de integración real.

Fuente oficial: [Become a Tech Provider](https://developers.facebook.com/documentation/business-messaging/whatsapp/solution-providers/get-started-for-tech-providers) (verificada 2026-10-03). Exige dos videos y acepta alternativas oficiales:

- Video 1 (`whatsapp_business_messaging`): «a message created and sent from your app and received in the WhatsApp client». Alternativa: grabar el script cURL de **API Setup** enviando un mensaje a un número de WhatsApp.
- Video 2 (`whatsapp_business_management`): «your app being used to create a message template». Alternativa: grabar **WhatsApp Manager** creando una plantilla.

Reglas de [App Review](https://developers.facebook.com/documentation/business-messaging/whatsapp/solution-providers/app-review): un video y un texto por permiso, sin envíos en borrador, sin capturas en lugar de video y sin pedir permisos innecesarios.

## Bloqueos

| Bloqueo | Qué destraba | Responsable |
|---|---|---|
| Identidad legal definitiva de EverSys y verificación del Business Portfolio "EverSys Solutions" (X01) | Presentar App Review; la app en modo Live | Ramiro y Álvaro, con el contador |
| Autorización X04 para staging con número real | Video 1 con nuestro panel; prueba real de Embedded Signup | Ramiro |
| Revisión legal de `/privacidad` y `/eliminacion-de-datos`, email de contacto | URLs de privacidad y borrado en la app | Responsable legal |
| Política de privacidad a nombre de EverSys | Hoy las páginas viven en el panel de Bellomo y dicen "· Bellomo". La app de Meta es de EverSys (Tech Provider): hace falta una URL de EverSys cuando exista la identidad legal | Ramiro y Álvaro |

No se presentan solicitudes, ni se aceptan términos, ni se cambian datos legales o titularidad de activos sin autorización explícita para esa acción.

## Video 1 — `whatsapp_business_messaging`

**Opción A, recomendada cuando haya X04: con nuestro panel.** Muestra el producto real.

Requisitos previos en staging: app de Meta en modo desarrollo con número de prueba; `META_ONBOARDING_ENABLED=true` y `META_SEND_ENABLED=true` **solo en staging**; webhook de staging suscripto; número conectado con "Conectar WhatsApp".

| # | Paso | Resultado esperado |
|---|---|---|
| 1 | Desde un celular de prueba, escribir "Hola, quiero info" al número de prueba | El mensaje entra por el webhook y abre la ventana de 24 h |
| 2 | En el panel de staging, abrir Conversaciones → "Esperan asesor" | Aparece la conversación con vista previa |
| 3 | Tomar el control y responder "Gracias por escribir, te paso la información" | La respuesta queda "Enviado" |
| 4 | Mostrar el celular | La respuesta llega en WhatsApp |

Duración aproximada: 60 s, panel y celular en clips separados o pantalla dividida. La respuesta cae dentro de la ventana de 24 h (W2 la exige), así que no hace falta plantilla.

**Opción B, disponible apenas exista la app: cURL de API Setup.** No depende de nuestro código ni de X04 para el envío propio; usa el número de prueba de Meta y un destinatario agregado como prueba.

| # | Paso | Resultado esperado |
|---|---|---|
| 1 | App Dashboard → WhatsApp → API Setup: elegir el número de prueba y un destinatario verificado | Meta muestra el cURL listo |
| 2 | Ejecutar el cURL (el token temporal no debe quedar visible en el video: recortarlo o difuminarlo) | Respuesta con `messages[0].id` |
| 3 | Mostrar el celular del destinatario | Llega el mensaje (plantilla `hello_world` si la ventana está cerrada) |

**Evidencia a guardar (sin secretos):** archivo del video, fecha y hora, ID del mensaje devuelto, número de prueba enmascarado.

## Video 2 — `whatsapp_business_management`

EverSys no crea plantillas: usa este permiso para administrar los activos de las inmobiliarias conectadas (suscribir webhooks de su WABA, registrar el número, leer sus números). La creación de plantillas se demuestra con la alternativa oficial; no se construye una pantalla solo para el video.

| # | Paso | Resultado esperado |
|---|---|---|
| 1 | WhatsApp Manager → Plantillas de mensajes → Crear | Formulario de plantilla |
| 2 | Categoría "Utilidad", nombre `confirmacion_visita`, idioma español, cuerpo "Hola {{1}}, recibimos tu pedido de visita. Un asesor te confirma el horario." | Vista previa correcta |
| 3 | Enviar a revisión | La plantilla queda "En revisión" |

**Evidencia:** video, nombre de la plantilla, estado final.

## Instrucciones para el revisor (borrador)

- Panel de pruebas: URL de staging. Usuario de revisión con rol admin del tenant sintético, creado para la revisión. **Las credenciales se cargan solo en el formulario de App Review**; nunca en el repo, tickets ni chats.
- Qué probar: Configuración → "WhatsApp de la inmobiliaria" → Conectar (Embedded Signup); Conversaciones → responder a un mensaje recibido.
- Límites a declarar: los mensajes libres solo se envían dentro de las 24 h de un mensaje del cliente. El panel muestra hasta cuándo se puede responder; con la ventana cerrada explica el motivo y desactiva el envío, y el servidor también lo rechaza.

## Textos de justificación (borrador, en inglés)

Describen solo funciones implementadas. Revisar contra el producto antes de enviar.

> **whatsapp_business_messaging.** EverSys is a shared inbox for real-estate sales teams. A business connects its own WhatsApp Business Account through Embedded Signup. Messages its customers send appear in the inbox; a sales advisor takes the conversation and replies, and the reply is sent through the Cloud API from the business's phone number. Free-form replies are only sent within the 24-hour customer service window; outside it the app blocks the send. The video shows a reply sent from the inbox and received in WhatsApp.

> **whatsapp_business_management.** After a business completes Embedded Signup, we use this permission on that business's WhatsApp Business Account to subscribe our app to its webhooks, register its phone number for the Cloud API, and read its phone numbers to confirm the number the business selected. Businesses can disconnect at any time from the app settings, which unsubscribes our app and deletes the stored credentials. The video shows a message template being created in WhatsApp Manager for the connected account.

## Configuración pendiente (sin secretos)

**En Meta (requiere identidad legal y autorización para cada acción):**

- Verificar el Business Portfolio existente "EverSys Solutions" (no crear otro).
- App tipo Business con caso de uso WhatsApp, vinculada a ese portfolio: ícono, categoría, URL de privacidad y de borrado de datos.
- Facebook Login for Business: configuración de Embedded Signup v4 → `config_id`.
- Webhook de la app: URL `https://<api-staging>/api/v1/webhooks/meta/whatsapp`, token de verificación (secreto), campos `messages` y `account_update`.
- Número y WABA de prueba desde el panel de la app.

**En staging (Railway, `bellomito-staging`):**

| Variable | Dónde | Nota |
|---|---|---|
| `META_APP_ID` | api, worker | Público |
| `META_APP_SECRET` | api, worker | Secreto: gestor de secretos |
| `META_WEBHOOK_VERIFY_TOKEN` | api | Secreto |
| `META_EMBEDDED_SIGNUP_CONFIG_ID` | api | Público |
| `META_GRAPH_VERSION` | api, worker | `v24.0` (default del código) |
| `META_ONBOARDING_ENABLED` | api | `false` hasta X04 |
| `META_SEND_ENABLED` | api, worker | `false` hasta X04 |

El esquema `2026-10-02.001` ya está aplicado en staging (evidencia de Codex, 2026-10-03).
