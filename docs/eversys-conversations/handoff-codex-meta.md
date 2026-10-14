# Informe para Codex: estado Meta / Tech Provider (2026-10-14, EVP-19)

Reemplaza la parte de estado de `handoff-codex-pendientes.md` (2026-10-07). Rama de trabajo: `develop` (staging). **El módulo de IA y conversaciones nunca va a `main`.** Sin secretos en este archivo.

Reparto: **Codex** = navegador de Meta, páginas legales, videos. **Claude** = repo, staging técnico, documentación. Todo cambio al repo va con ticket `EVP-XX` En curso (`TICKETS.md`).

## 1. Qué está listo en código (probado con Meta simulado, no real)

| Pieza | Dónde | Estado |
|---|---|---|
| Embedded Signup (alta del número del cliente) | `WhatsAppConnectionController`, `WhatsAppOnboarding`, panel `WhatsAppConnect.tsx` | Impl + Sim. Apagado por `META_ONBOARDING_ENABLED` |
| Webhook app-level firmado (`messages` + estados) | `POST /api/v1/webhooks/meta/whatsapp`; tenant por `phone_number_id` | Impl + Sim |
| Envío texto / foto / PDF / plantilla, ventana 24 h | `OutboundDispatcher`, `WhatsAppCloudTransport`, `ChannelPolicy` | Impl + Sim. Apagado por `META_SEND_ENABLED` |
| Recepción foto / PDF (sin EXIF/GPS, tipo por bytes) | `WhatsAppMediaFetcher`, `ConversationAttachments` | Impl + Sim |
| Plantillas aprobadas (lectura de `message_templates`, no creación) | sync + `/conversations/{id}/templates` | Impl + Sim |
| Copiloto (IA sugiere, asesor envía) | `AgentCoordinator::suggest` | Impl + Sim. Anthropic; OpenAI solo en local, nunca staging (EVP-18) |

## 2. Arreglado hoy (EVP-19): adjuntos entre API y worker

En staging la API guarda el adjunto del asesor y el **worker** lo lee para subirlo a Meta, pero en Railway **no comparten volumen**. Antes, el worker mandaba un archivo vacío sin avisar. Ahora el envío falla visible con `ATTACHMENT_MISSING` (mensaje FAILED en la bandeja y error reportado).

**Para que funcione de verdad (dueño, no Codex):** bucket S3 privado (Railway Buckets u otro compatible) y en `api`, `worker` y `scheduler` de staging: `PRIVATE_FILES_DISK=s3` + `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_DEFAULT_REGION`, `AWS_BUCKET`, `AWS_ENDPOINT` (y `AWS_USE_PATH_STYLE_ENDPOINT=true` si el proveedor lo pide). El driver ya está instalado; no hace falta código. **Hasta eso, no grabar el video 1 con foto/PDF desde la app.**

## 3. Lo que Codex hace en Meta (navegador)

1. App Dashboard → Facebook Login for Business: dominios y redirect de `meta-checklist.md` §4; crear la configuración de Embedded Signup y pasar el `config_id` al dueño (no es secreto, pero lo carga él en Railway).
2. Webhooks: callback `https://api-staging-30f3d.up.railway.app/api/v1/webhooks/meta/whatsapp`, campo `messages`. El verify token lo carga el dueño.
3. Probar si Embedded Signup ofrece un **número 555** a la cuenta sandbox (§3 del checklist). Si no, los videos van por la alternativa oficial (cURL de API Setup + WhatsApp Manager).
4. Si al canjear el código Meta exige `redirect_uri`, avisar: `WhatsAppOnboarding::exchange` hoy no lo manda y se corrige con ticket.

## 4. Textos de App Review (sumar antes de presentar)

- `whatsapp_business_messaging`: bandeja del asesor; respuestas dentro de 24 h; **fotos y PDF** en ambos sentidos; **plantillas aprobadas** fuera de la ventana; la IA solo sugiere borradores o responde con reglas fijas y deriva a humano.
- `whatsapp_business_management`: suscribir webhooks, registrar número, leer números y **leer plantillas aprobadas** (`message_templates`). La app no crea plantillas.

## 5. Páginas legales: lo que el sistema hace hoy (base factual para los textos)

Solo afirmar esto; todo lo demás es "no verificado" hasta que legal lo apruebe.

| Tema | Hecho verificado en código |
|---|---|
| Datos | Mensajes de texto, nombre de perfil y número de WhatsApp, fotos y PDF (fotos sin metadatos de ubicación), datos de contacto que la persona deja en el chat web |
| Retención | Solo una: el contenido crudo del webhook se redacta a los 30 días. Mensajes, adjuntos y leads **no tienen** borrado automático |
| Borrado | **Manual.** No hay callback de eliminación de Meta ni borrado por persona (W9b). No prometer plazos ni borrado automático |
| Proveedores | Meta (WhatsApp Cloud API), Railway (hosting staging), proveedor LLM si la IA/copiloto está activo (Anthropic; OpenAI solo en local, no se declara). **Regiones: no verificadas.** Almacenamiento S3: a definir (§2) |
| Responsable | EverSys como proveedor; la inmobiliaria como responsable de sus datos. Identidad legal y email: los confirma el dueño |

## 6. Trabajo en curso de este lado que toca a Meta indirectamente

| Ticket | Qué | Por qué importa para Meta |
|---|---|---|
| EVP-14 | Feriados en el horario de atención | Los avisos fuera de horario que salen por WhatsApp; en revisión |
| EVP-5 (L10) | Asistente fuera de horario | Mensajes automáticos fijos (no del modelo) al derivar; mostrar en el video si se usa IA |
| EVP-18 | Copiloto con OpenAI, solo local | No toca staging ni Meta; si algún día pasa a staging, declararlo en privacidad |
| EVP-16 | CI de scripts forward | Ninguno directo; garantiza esquema de staging coherente |
| EVP-19 | Adjuntos API/worker | §2 |

## 7. Pendientes sin ticket todavía (no empezar sin `EVP-XX`)

- Callback de eliminación de datos de Meta (endpoint firmado + código de confirmación).
- Borrado por persona (W9b) y retención de adjuntos.
- Páginas legales en el repo con EverSys como proveedor y página de términos (texto aprobado por legal).
- `redirect_uri` en el canje, solo si Meta lo exige.

## 8. Verificación al cierre de EVP-19

Ver `docs/tickets/EVP-19-adjuntos-worker.md`.
