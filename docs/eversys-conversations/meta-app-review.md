# Meta: preparación de la prueba real y del App Review (W10, W11)

Estado al 2026-10-04. Nada de esto está presentado ni activado. Producción de Bellomo, `main`, la IA y los envíos reales siguen fuera de alcance hasta la autorización X04. **Los tests con Meta simulado no son evidencia de integración real, ni de aprobación de Meta.**

Fuentes oficiales, verificadas el 2026-10-03: [Become a Tech Provider](https://developers.facebook.com/documentation/business-messaging/whatsapp/solution-providers/get-started-for-tech-providers) y [App Review](https://developers.facebook.com/documentation/business-messaging/whatsapp/solution-providers/app-review). Piden un video y un texto por permiso. No aceptan envíos en borrador ni capturas en lugar de video, y no hay que pedir permisos innecesarios. Para cada video aceptan alternativas oficiales (cURL de API Setup y WhatsApp Manager).

## 1. Estado de W2: qué está probado y qué está verificado

| Commit | Qué hace | Evidencia |
|---|---|---|
| `3c0872c` | `ChannelPolicy`: ventana de 24 h por conversación y número. Se aplica en la respuesta del asesor (409 `OUTSIDE_SERVICE_WINDOW`) y en el dispatcher bajo lock antes de enviar. El timestamp de Meta se topea con la hora de recepción, con datos faltantes falla cerrado y solo deja pasar plantillas aprobadas | 11 tests en MySQL 8.4 aislado; suite 267/267; CI de GitHub en verde (API, web, evals, guard); revisión de aislamiento con 3 hallazgos aplicados |
| `11e7c94` | La bandeja muestra hasta cuándo se puede responder. Con la ventana cerrada explica el motivo y desactiva Enviar | 12 tests de política, incluidos solo lectura y 404 entre tenants; panel 62/62, build OK; revisión de aislamiento sin bloqueantes |

**Probado solo con simuladores** (`Http::fake`, webhooks firmados por los tests): la apertura de la ventana por un mensaje entrante, el rechazo fuera de ella, el envío dentro de ella y el fallo de un envío que llega tarde.

**Verificado de verdad:** nada contra Meta. No hubo ningún mensaje real, ningún webhook real ni ningún número registrado. Tampoco está modelada la ventana de 72 h de los puntos de entrada gratuitos (anuncios click-to-WhatsApp): el sistema nunca la da por abierta.

## 2. Checklist de configuración de staging

Solo nombres; los valores van en el gestor de secretos de Railway (`bellomito-staging`), nunca en el repo, tickets ni chats.

### Servicios (todos ya existen en staging)

| Servicio | Rol en WhatsApp |
|---|---|
| `api` | Recibe el webhook (verifica la firma y guarda el recibo antes del 200), el alta con Embedded Signup y la desconexión |
| `worker` | Procesa los recibos (`ProcessMetaWebhookReceipt`) y envía las respuestas (`DispatchOutboundJob`). Sin worker vivo no se procesa nada |
| `scheduler` | `everprop:conversations:reconcile`: reencola recibos y vence leases |
| `panel` | Botón "Conectar WhatsApp" y bandeja. No necesita variables de Meta: las lee de la API |
| MySQL 8.4 y Redis | Con el forward `2026-10-02.001` (tokens cifrados) ya aplicado |

### Variables

| Variable | api | worker | Tipo | Nota |
|---|---|---|---|---|
| `META_APP_ID` | sí | sí | público | El worker lo usa para ignorar `account_update` de otras apps |
| `META_APP_SECRET` | sí | — | **secreto** | Firma del webhook y canje del código |
| `META_WEBHOOK_VERIFY_TOKEN` | sí | — | **secreto** | Handshake `GET` del webhook |
| `META_EMBEDDED_SIGNUP_CONFIG_ID` | sí | — | público | Configuración de Facebook Login for Business |
| `META_GRAPH_VERSION` | sí | sí | público | Default `v24.0`; no cambiarlo sin revisar el changelog |
| `META_ONBOARDING_ENABLED` | sí | — | flag | `false` hasta X04 |
| `META_SEND_ENABLED` | sí | sí | flag | `false` hasta X04 |
| `META_SEND_TIMEOUT_SECONDS` | sí | sí | opcional | Default 10 |
| `APP_KEY` | sí | sí | **secreto** | Tiene que ser **la misma** en API y worker: cifra los tokens de cada inmobiliaria |

La imagen corre `php artisan config:cache` al arrancar (`docker/production/entrypoint.sh`). **Cambiar una variable no surte efecto hasta redesplegar o reiniciar ese servicio.**

### Webhook (en la app de Meta)

- URL de callback: `https://api-staging-30f3d.up.railway.app/api/v1/webhooks/meta/whatsapp`. Es HTTPS con el certificado de Railway.
- Token de verificación: el mismo valor que `META_WEBHOOK_VERIFY_TOKEN`.
- Campos: `messages` y `account_update`.
- Comprobación: Meta hace el `GET` de verificación y la API responde el challenge. Después, un mensaje de prueba tiene que aparecer en la bandeja.

### Embedded Signup (en la app de Meta)

- App tipo Business con caso de uso WhatsApp, vinculada al portfolio existente "EverSys Solutions". No crear otro.
- Facebook Login for Business: crear la configuración de Embedded Signup v4 y copiar su `config_id` a `META_EMBEDDED_SIGNUP_CONFIG_ID`.
- App Domains y Allowed Domains for the JavaScript SDK: el dominio del panel de staging (`panel-staging-staging-62ec.up.railway.app`), con HTTPS.
- El panel acepta mensajes solo de `https://*.facebook.com` con `type: WA_EMBEDDED_SIGNUP`, y canjea el código en el servidor. El secreto nunca llega al navegador.
- La CSP del panel no requiere cambios: solo restringe `frame-ancestors`.

### Antes de la prueba, en staging y sin Meta

- [ ] Recorrido S6 en staging por el chat web: el visitante escribe, el mensaje aparece en "Esperan asesor", el asesor hace "Tomar control" y responde, y el visitante ve la respuesta una sola vez. Repetirlo con el worker detenido y un envío pendiente. **Hoy no está verificado** (ver `staging-evidence.md`).
- [ ] `everprop:production-check --connections` OK en API y worker.
- [ ] `/readyz` 200; cola pendiente y fallida en 0.

## 3. Guiones de las demos, contrastados con lo implementado

### Video 1: `whatsapp_business_messaging`

**Opción A, con nuestro panel (requiere X04):**

| # | Paso | Pantalla real | Estado |
|---|---|---|---|
| 1 | Configuración → tarjeta "WhatsApp de la inmobiliaria" → "Conectar WhatsApp" | `WhatsAppConnect.tsx` en `/admin/settings`, solo con `manageIntegrations` | Implementado (W4/W5), probado con Meta simulado |
| 2 | Desde un celular de prueba, escribir "Hola, quiero info" | Webhook → recibo → worker → bandeja | Implementado (W6), simulado |
| 3 | Conversaciones → filtro "Esperan asesor" → abrir | Filtro y vista previa existentes | Implementado |
| 4 | "Tomar control" y responder; se ve "Podés responder por WhatsApp hasta el …" | Aviso de ventana (W2) | Implementado |
| 5 | La respuesta queda "Enviado" y llega al celular | Transporte Cloud API | **Nunca probado contra Meta** |

Hay que confirmar en la prueba si el número de prueba que da el panel de la app se puede elegir en Embedded Signup. No lo damos por hecho: si no se puede, se conecta un número real de prueba del portfolio, con autorización para esa acción concreta, o se usa la Opción B.

**Opción B, cURL de API Setup (sirve apenas exista la app):** App Dashboard → WhatsApp → API Setup → elegir el número de prueba y un destinatario verificado → ejecutar el cURL con el token temporal recortado en el video → mostrar el celular. No depende de nuestro código.

**Evidencia:** video, fecha y hora, `messages[0].id` devuelto y número enmascarado.

### Video 2: `whatsapp_business_management`

EverSys no tiene pantalla de plantillas y **no se construye una para el video**. Se usa la alternativa oficial: WhatsApp Manager → Plantillas de mensajes → Crear (categoría Utilidad, nombre `confirmacion_visita`, español, cuerpo "Hola {{1}}, recibimos tu pedido de visita. Un asesor te confirma el horario.") → Enviar a revisión, hasta que queda "En revisión".

### Lo que la app hace con cada permiso (base de la justificación)

| Afirmación del texto | Código |
|---|---|
| Canje del código en el servidor | `WhatsAppOnboarding::exchange` (`oauth/access_token`) |
| Suscribir la app a la WABA del cliente | `POST {waba}/subscribed_apps` |
| Registrar el número | `POST {phone}/register` con PIN generado y cifrado |
| Leer los números para confirmar el elegido | `GET {waba}/phone_numbers` |
| Desconectar: desuscribir y borrar credenciales | W9a, `DELETE {waba}/subscribed_apps` y borrado del token |
| Texto libre solo dentro de las 24 h, y el panel lo bloquea fuera | W2 |

### Textos de justificación (borrador en inglés; describen solo lo implementado)

> **whatsapp_business_messaging.** EverSys is a shared inbox for real-estate sales teams. A business connects its own WhatsApp Business Account through Embedded Signup. Messages its customers send appear in the inbox; a sales advisor takes the conversation and replies, and the reply is sent through the Cloud API from the business's phone number. Free-form replies are only sent within the 24-hour customer service window: the inbox shows when the window closes and blocks free-form sends after that. The video shows a reply sent from the inbox and received in WhatsApp.

> **whatsapp_business_management.** After a business completes Embedded Signup, we use this permission on that business's WhatsApp Business Account to subscribe our app to its webhooks, register its phone number for the Cloud API, and read its phone numbers to confirm the number the business selected. Businesses can disconnect at any time from the app settings, which unsubscribes our app and deletes the stored credentials. The video shows a message template being created in WhatsApp Manager for the connected account.

### Instrucciones para el revisor (borrador)

- Panel de staging y un usuario de revisión con rol admin del tenant sintético. **Las credenciales se cargan solo en el formulario de App Review.**
- Qué probar: Configuración → "WhatsApp de la inmobiliaria" → "Conectar WhatsApp". Después, Conversaciones → "Esperan asesor" → "Tomar control" → responder.
- Límite a declarar: el texto libre solo sale dentro de las 24 h desde el último mensaje del cliente.

## 4. Privacidad y eliminación de datos con identidad de EverSys (propuesta, no implementada)

**Hoy:** `/privacidad` y `/eliminacion-de-datos` son páginas públicas del panel (`src/app/(legal)/`) y su contenido coincide con el código. Tienen tres problemas para la app de Meta:

1. El título hereda la plantilla raíz `"%s · Bellomo"` (`src/app/layout.tsx`).
2. El texto nombra al proveedor como **EverProp**, y la app de Meta es de **EverSys**.
3. No tienen email de contacto: si falta `NEXT_PUBLIC_PRIVACY_CONTACT_EMAIL`, dicen "pedilo en el mismo chat".

**Propuesta: reutilizar las mismas páginas, sin texto nuevo.**

1. En `src/lib/legal.tsx`, sumar dos datos de configuración junto a `PrivacyContact`: el nombre comercial del proveedor (por ejemplo, `NEXT_PUBLIC_LEGAL_PROVIDER_NAME`) y el titular legal (`NEXT_PUBLIC_LEGAL_HOLDER`). Las páginas los muestran donde hoy dice "EverProp".
2. Agregar en `src/app/(legal)/layout.tsx` una plantilla de título propia, para que estas páginas no digan "· Bellomo".
3. Publicarlas desde un despliegue del panel configurado para EverSys: el panel de staging, o un dominio de EverSys apuntado a ese servicio. Esa URL va en la configuración de la app. El panel de cada inmobiliaria sigue mostrando la suya.
4. **Gate:** si falta el titular o el email, la página muestra "dato pendiente de confirmación" y **no se carga en Meta**.

**Datos que no se inventan y quedan pendientes de confirmación:**

| Dato | Quién lo confirma |
|---|---|
| Titular legal de EverSys (persona o razón social; hoy no está formalizado) | Ramiro y Álvaro, con el contador |
| Nombre comercial que figura: EverSys o EverProp | Ramiro y Álvaro |
| Email de contacto para privacidad | Ramiro y Álvaro |
| Dominio donde se publica | Ramiro y Álvaro |
| Plazos de retención y política de borrado de una persona (D18, W9b) | Responsable legal. **W9b no se implementa sin esa decisión** |
| Revisión legal del texto completo | Responsable legal |

No se publican CUIT, domicilio ni plazos de retención hasta tener los datos confirmados.

## 4b. Lo que suma la guía "Become a Tech Provider" (revisada el 2026-10-06)

Confirma lo de la sección 3: dos videos (un mensaje enviado y recibido en WhatsApp; una plantilla creada), con las alternativas oficiales de cURL de API Setup y WhatsApp Manager. Suma cuatro puntos que cambian el plan:

1. **La verificación del negocio va primero y pide datos que todavía no tenemos:** nombre legal, dirección, teléfono, email y **sitio web** de EverSys, más documentos si Meta no encuentra el negocio. Sin verificación no se puede ni empezar el App Review. Bloqueante: identidad legal y páginas legales en `eversyssolutions.com.ar` (sección 4).
2. **Sin acceso avanzado solo funcionan las cuentas propias.** Las llamadas sobre WABAs que no son del negocio de la app devuelven error `200`. Por eso el App Review hace falta para atender **clientes** (el SaaS), no para que un negocio use su propia cuenta. Opción para el piloto, a decidir: que Bellomo use la Cloud API con su propia app y su propia WABA, sin esperar a que EverSys sea Tech Provider. Implementado (2026-10-07): `php artisan everprop:whatsapp:connect-own --tenant=bellomo --waba=<id> --phone=<id> --admin=<email de un TENANT_ADMIN>` pide el token del usuario del sistema de la app de Bellomo **oculto** (nunca como argumento) y hace las mismas verificaciones que Embedded Signup: el número tiene que ser de esa WABA, un número de otro tenant se rechaza, suscribe los webhooks, registra el número y guarda el token cifrado. Requisitos de Bellomo: su propia app de Meta con el caso de uso WhatsApp, un usuario del sistema con permisos sobre su WABA y una tarjeta en su cuenta. Los envíos siguen detrás de `META_SEND_ENABLED` (X04).
3. **Clientes que ya usan la app WhatsApp Business:** Embedded Signup puede sumarlos conservando su número y su app ("Onboard WhatsApp Business app users"). Es clave para que los asesores no pierdan WhatsApp. Pendiente: confirmar en la documentación de esa página qué funciones de la app se mantienen y qué cambia en nuestra bandeja (mensajes enviados desde el celular).
4. **Facturación:** cada cliente sumado tiene que cargar una tarjeta en su cuenta de WhatsApp Business Platform. Va en el guion de alta de Bellomo y en la oferta comercial del SaaS.

También permite hacerlo con un **Solution Partner** (un BSP que ya es proveedor), con su app ID. Es la salida si la verificación o el App Review se demoran.

## 5. Qué falta para autorizar la prueba real y cómo apagarla

### Requisitos para pedir la autorización X04 (solo staging)

- [ ] Titular legal definido y Business Portfolio "EverSys Solutions" verificado (X01).
- [ ] App de Meta creada y configurada según la sección 2, con autorización explícita para cada acción en Meta.
- [ ] URL de privacidad de EverSys publicada con los datos confirmados (sección 4).
- [ ] Recorrido S6 verificado en staging por el chat web.
- [ ] Responsables nombrados: quién ejecuta, quién mira los logs y quién puede apagar.
- [ ] Ventana de prueba acordada (día y hora), con un solo número de prueba y destinatarios propios del equipo.
- [ ] Autorización X04 escrita de Ramiro, que diga staging, número, fecha y alcance.

### Cómo encenderla (solo con X04)

1. En API: `META_ONBOARDING_ENABLED=true`. En API y worker: `META_SEND_ENABLED=true`. Redesplegar los dos.
2. Verificar el webhook en la app de Meta y conectar el número con "Conectar WhatsApp".
3. Hacer una ida y vuelta, y registrar la evidencia (sección 3).

### Cómo apagarla si falla (de menor a mayor)

| Nivel | Acción | Efecto | Cómo se comprueba |
|---|---|---|---|
| 1. Dejar de enviar | `META_SEND_ENABLED=false` en API y worker, y **redesplegar** | Cada envío termina en `FAILED` `CHANNEL_SEND_DISABLED`, sin llamar a Meta | Una respuesta de prueba queda "No enviado"; sin llamadas a `graph.facebook.com` en los logs |
| 2. Cerrar altas | `META_ONBOARDING_ENABLED=false` en API, y redesplegar | La tarjeta muestra "no habilitado" y el endpoint de alta rechaza | `GET /admin/integrations/whatsapp/config` devuelve `enabled=false` |
| 3. Dejar de recibir | En el panel, "Desconectar" el número (W9a) | Desuscribe la WABA en Meta, borra token y PIN y libera el número | La conexión desaparece del listado; Meta deja de enviar webhooks de esa WABA |
| 4. Corte total en Meta | En la app de Meta, quitar la suscripción del webhook o revocar el acceso del sistema | Meta deja de llamar al webhook. Un token revocado se marca solo como revocado (W7, error 190) | Sin recibos nuevos en `webhook_receipts` |

Las conversaciones de prueba quedan en la base de staging. No se borran a mano ni con una purga improvisada: el borrado de datos de una persona espera a W9b.

### Qué no cuenta como "listo"

Los tests en verde, el CI, la tabla `webhook_receipts` o un healthcheck. La prueba real se da por hecha solo con un mensaje real de ida y vuelta, con evidencia. El App Review se considera aprobado solo cuando Meta lo comunica.
