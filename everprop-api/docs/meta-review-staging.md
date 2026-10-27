# Revisión de Meta en un tenant aislado — EVP-88

EverSys Conversations es el módulo de conversaciones de EverProp. El piloto interno funciona en `bellomito-staging`; sus cuentas de prueba incluyen conversaciones y teléfonos del equipo. No entregar su acceso administrativo a un revisor externo.

Esta preparación no publica código, concede acceso externo ni envía App Review. Producción/main, responsive y multimedia quedan fuera. No hacen falta tablas, roles ni dependencias nuevas.

## Provisión

El comando `everprop:reviewer:prepare` muestra el plan por defecto. `--apply` crea exclusivamente el tenant `meta-review-staging`, marcado con `settings_json.meta_review=true`, y el usuario de acceso `meta-review@example.invalid`. El correo es un identificador ficticio para iniciar sesión; no se envía email. Usa el rol existente `TENANT_ADMIN` del tenant de revisión, nunca `SUPER_ADMIN`; no copia usuarios, teléfonos, canales, contactos ni mensajes internos. La IA y el copiloto se apagan al crear el tenant.

Solo admite `RAILWAY_ENVIRONMENT_NAME=staging`, o `APP_ENV=testing` con base `bellomo_crm_test`/`bellomo_crm_evpNN_qa`. En pruebas se verifica el nombre real de conexión antes de consultar tenants. Un nombre de entorno configurado por un operador no sustituye el control de acceso a Railway.

Después de la revisión y el despliegue autorizados, un operador ejecuta en la API de staging:

```sh
php artisan everprop:reviewer:prepare
php artisan everprop:reviewer:prepare --apply
```

El operador introduce una contraseña nueva de al menos 12 caracteres con letras y números en el prompt oculto. No pasar contraseñas como argumentos, variables de entorno, mensajes, logs ni informes. Si la terminal no puede ocultarla, aborta; no continúa con entrada visible. La cuenta se crea activa con hash mediante el modelo existente. La contraseña y su entrega privada requieren la autorización correspondiente; la preparación local no implica que se haya creado acceso remoto.

El comando no cambia un tenant sin el marcador de revisión ni revive/promueve una cuenta modificada, suspendida o eliminada. Repetir sobre una cuenta válida no rota su contraseña ni modifica datos o ajustes existentes. Si alguien habilitó la IA posteriormente, repetir el comando conserva esa decisión; comprobar los ajustes antes de cada revisión. La transacción y el bloqueo de la fila de tenant serializan la creación del revisor.

## Hostname y sesión

Asignar un hostname de revisión separado al panel antes de compartir el acceso. No hay un hostname público nuevo asignado durante esta preparación. Confirmar el dominio disponible con el responsable y configurar DNS/Railway cuando esté autorizado. No inventar una URL activa ni crear servicios de pago por conveniencia.

1. Conservar los hosts actuales en `TENANT_HOST_MAP_JSON` y añadir únicamente el hostname de revisión → `meta-review-staging`.
2. El panel y la API necesitan el mismo `TENANT_PANEL_SIGNING_KEY`, secreto de servidor almacenado en Railway. Si ya existe, conservarlo. Nunca `NEXT_PUBLIC_*`. El proxy existente firma host y timestamp; la API valida HMAC y el mapa exacto. Un host desconocido o una sesión de otro tenant falla cerrado.
3. Añadir el origen HTTPS exacto de revisión a `CORS_ALLOWED_ORIGINS` y su host a `SANCTUM_STATEFUL_DOMAINS`; conservar los actuales. Mantener `TRUSTED_HOSTS` con los hosts exactos del entorno y los del transporte real. Sin comodines ni resolver local en staging.
4. Mantener cookies seguras, `SESSION_DOMAIN` vacío para cookies por host y Redis compartido. El panel de revisión debe iniciar una sesión propia; no copiar cookies del panel interno.
5. Instagram permite callbacks registrados adicionales. Conservar `META_INSTAGRAM_REDIRECT_URI` del piloto interno y añadir en `META_INSTAGRAM_REDIRECT_URIS_JSON` la clave `meta-review-staging` con la URI HTTPS exacta del nuevo panel y ruta `/integrations/instagram/callback`. Registrar también esa URI literal en Meta.

El mapa nuevo se configura solo en servidor, por slug de tenant resuelto. El navegador no elige tenant ni redirect. La misma validación existente exige que el host del callback pertenezca al tenant, sin usuario, query ni fragmento. State guarda la URI elegida; si cambia antes del canje, el intento se rechaza antes de contactar a Meta. Los tenants sin override conservan el callback predeterminado; no se mueve Centu al tenant del revisor.

Verificar ambos orígenes en navegador: login independiente, `/auth/me`, Ajustes, conexión Instagram y vuelta autenticada. La cuenta del revisor no debe listar usuarios/canales/contactos/mensajes del piloto. Forzar un host firmado ajeno con esa sesión debe dar 404 genérico. No basta con un healthcheck.

## Material para la revisión

Fuente oficial contrastada el 27/10/2026: [Instagram App Review](https://developers.facebook.com/documentation/instagram-platform/app-review) y [WhatsApp App Review](https://developers.facebook.com/documentation/business-messaging/whatsapp/solution-providers/app-review/).

- **Instagram basic**: grabar el login de EverProp, Conectar Instagram, autorización de la cuenta profesional del revisor, retorno y username visible. Entregar credenciales de EverProp de revisión, nunca contraseña Instagram. Usar subtítulos en inglés para la UI en español.
- **Instagram mensajes**: grabar un DM entrante, su llegada a la bandeja, toma de control, respuesta y recepción en Instagram. Si se muestra IA, declarar su uso y mostrar transferencia completa antes de tomar control.
- **WhatsApp mensajes**: grabar envío desde EverProp al destinatario interno autorizado y recepción en su WhatsApp dentro de la ventana. Para pruebas manuales usar únicamente Álvaro.
- **WhatsApp management**: Meta admite video creando una plantilla en la propia app o en WhatsApp Manager. Se puede preparar esa alternativa sin afirmar que Embedded Signup esté habilitado o verificado. No crear ni enviar plantillas reales a clientes.

Cada permiso necesita descripción y grabación pertinentes; las capturas y las APIs simuladas no sustituyen una grabación real. La interfaz de automatización disponible captura imágenes, pero no expone grabación continua. Preparar los pasos y solicitar la grabación cuando el entorno remoto esté listo, sin fabricar un video de capturas y presentarlo como screencast.

La app principal sigue con cinco permisos mínimos en un borrador No enviada. Las instrucciones guardadas indican los pendientes. Antes de enviar: acceso dedicado comprobado, videos, cuestionario de datos, confirmación del proyecto/facturación Gemini por quien administra la clave y política pública autorizada que describa el uso real de Instagram/IA. La política configurada en Meta es la del sitio EverSys, no la página legal local de EverProp. No prometer una política de Google sin verificar el proyecto.

Los campos específicos de desautorización/eliminación de Instagram siguen vacíos; existe una URL global de instrucciones de eliminación. No se comprobó que esos campos por sí solos sean un gate obligatorio actual. Registrar la mejora operativa por separado y no configurar endpoints inexistentes.

## Datos técnicos para preparar el cuestionario

Contraste de código del 27/10/2026. Es un borrador para el responsable que completa el formulario, no una declaración enviada a Meta. La [vista oficial de preguntas de tratamiento de datos](https://developers.facebook.com/docs/resp-plat-initiatives/individual-processes/data-handling-questions/questions-preview/) pregunta por proveedores, sus países de procesamiento, responsable y solicitudes de autoridades. Las preguntas concretas de cada evaluación pueden variar; no se presenta todo el [cuestionario de protección de datos](https://developers.facebook.com/documentation/resp-plat-initiatives/data-access-renewal/content/data-protection-section) como obligatorio para este borrador.

| Tema | Hecho comprobable y límite de la respuesta |
| --- | --- |
| Datos recibidos | IDs de cuenta, canal y remitente, nombre visible o teléfono cuando lo entrega el canal, texto y metadatos del mensaje. Se usan para identificar la conversación y responder. Ver `InboundMessageService.php:34` y `:83`, bajo `app/Domain/Conversations/Services/`. |
| Persistencia backend | Contactos, identidades, conversaciones y mensajes se guardan en MySQL; el despliegue de staging usa Railway. No contestar que los datos se procesan solo en el dispositivo o sin persistencia. |
| Proveedor de IA | Con IA activa, el coordinador manda contexto de la conversación, instrucciones y resultados de herramientas al proveedor configurado. En el piloto es Google Gemini. `AgentCoordinator.php:196` y `:468`; `GeminiChatClient.php:28` y `:127`, bajo `app/Domain/AgentRuntime/`. |
| Contenido enviado a IA | El historial selecciona mensajes del tenant y conversación, excluye notas y salidas fallidas/canceladas, y limita cantidad/tamaño y presupuesto. La configuración actual toma hasta 20 mensajes y recorta cada texto a 2.000 caracteres antes de ajustar el presupuesto. No hay anonimización automática en ese recorrido: un nombre o teléfono escrito en el texto puede formar parte del contexto. La instrucción de no pedir datos sensibles no equivale a un filtro de datos. |
| Credenciales | Los tokens de integración se cifran con el cifrado de Laravel; se descifran en servidor para la petición al proveedor. Esto no significa que todo el texto de los chats tenga cifrado de aplicación. Ver `IntegrationTokens.php:26` y `:102`. |
| Payload técnico del webhook | El ingreso de Meta asigna vencimiento a 30 días. Al procesar o rechazar se reemplaza el payload por un marcador; el reconciliador también lo hace al vencer. Esta limpieza conserva la fila técnica y no borra la conversación ni el mensaje ya persistido. Ver `MetaWhatsAppWebhookController.php:130`, `ProcessMetaWebhookReceipt.php:101` y `ReconcileConversations.php:43`. |
| Historial del chat | En los comandos y rutas revisados no se identificó una purga general de mensajes por antigüedad. No extrapolar los 30 días del payload al historial, auditoría, copias de seguridad o datos del proveedor. El plazo y procedimiento contractual siguen pendientes del responsable. |
| Desconexión o revocación | Se borran las credenciales de acceso, referencia heredada y PIN de la integración; no es un borrado integral del historial. Ver `IntegrationTokens.php:42` y `:69`. La URL global de instrucciones no prueba por sí sola que se haya atendido una solicitud de eliminación. |
| Proveedores y ubicaciones | El recorrido incluye Railway como infraestructura y Google Gemini si la IA está habilitada. Confirmar entidades contractuales exactas, subproveedores, países efectivos de procesamiento/acceso, región y copias de seguridad. No deducirlos del idioma, dominio, zona horaria del tenant ni nombre de la marca. |
| Datos que no salen del código | Entidad o persona responsable y país, solicitudes de autoridades de los últimos 12 meses, procesos organizativos, condiciones del proyecto Gemini, tratamiento de menores y cumplimiento efectivo de solicitudes de eliminación requieren confirmación del responsable. No completar esos campos con un «No» inferido de las pruebas. |

Borrador técnico en inglés para adaptar a los campos que realmente aparezcan:

> EverProp uses Meta account and sender identifiers, available display names or phone numbers, message text and delivery metadata to operate the tenant's shared inbox and send replies. Conversation data is stored in the application's backend. Integration access tokens are encrypted using Laravel's application encryption.
>
> When the tenant enables the AI assistant, conversation context and relevant tool results are sent to the configured AI provider. The staging pilot uses Google Gemini. The model input is bounded and tenant-scoped; it is not automatically anonymized. Internal notes are excluded from the conversation history sent by this flow.
>
> Processed webhook payloads are redacted separately from the persisted conversation history. Disconnecting an integration removes its access credentials and does not erase the entire conversation. The responsible party must confirm retention, deletion handling, provider entities and processing locations before the assessment is submitted.

No pegar este borrador como una promesa sobre plazos, países, entrenamiento de Google, solicitudes de autoridades o eliminación integral. No contiene respuestas organizativas inventadas y no sustituye la autorización para publicar la política o enviar App Review.
