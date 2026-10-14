# EVP-19 — Adjuntos entre API y worker + informe Meta para Codex

Rama `ticket/EVP-19-adjuntos-worker`, desde `develop` `03adb4f` · 2026-10-14 · Claude con Ramiro Ruggeri.
Jira: https://eversys.atlassian.net/browse/EVP-19, En curso. Sin despliegue ni cambios en Railway.

## 1. Qué pedía el ticket

En staging, la API guarda el adjunto del asesor y el worker lo lee para subirlo a Meta, pero no comparten volumen (`staging-evidence.md`). Hacer que el error se vea, documentar el disco compartido y dejar el checklist Meta y un informe para Codex al día.

## 2. Qué se hizo

- `ConversationAttachments::contents()` devuelve `null` si el archivo no está en el disco de este proceso (antes se convertía en un archivo vacío de 0 bytes y se enviaba).
- `OutboundDispatcher::claim()` lee los bytes **solo para WhatsApp** (el chat web no los necesita: el visitante descarga el archivo desde la API, así que en staging sigue funcionando; observación de Codex del 14/10) y **antes** de pasar el job a PROCESSING. Si falta, el job y el mensaje quedan `FAILED` con `ATTACHMENT_MISSING` (mismo camino que un bloqueo de `ChannelPolicy`) y se reporta el error con la pista de `PRIVATE_FILES_DISK`. Nada llega a Meta, no queda `UNKNOWN`.
- Tests: `ChannelPolicyTest::test_a_whatsapp_attachment_the_worker_cannot_read_fails_visibly_and_nothing_is_sent` (WhatsApp: FAILED, nada a Meta) y `ConversationAttachmentsTest::test_web_chat_does_not_need_the_bytes_on_the_worker` (web: SENT aunque el worker no vea el archivo).
- Docs: `meta-checklist.md` (§6 evals ya commiteados, §6b adjuntos) y `handoff-codex-meta.md` (informe senior para Codex).

## 3. Lo que falta (dueño)

Bucket S3 privado y en `api`, `worker` y `scheduler` de staging: `PRIVATE_FILES_DISK=s3` + `AWS_*`. El driver ya está instalado. Hasta eso, foto/PDF del asesor por WhatsApp falla visible en staging.

## 4. Verificación

Stack local Docker (MySQL 8.4, PHP 8.4), 2026-10-14, código de esta rama:
- `php artisan test`: 374 pasan, 1 omitido (eval con modelo real). Antes, la base de prueba local no tenía 3 scripts forward recientes de `develop` (`collection_email_attempts`, `rotator_role`, `web_push_out_of_hours`); se aplicaron solo a `bellomo_crm_test`.
- PHPStan sin errores; Pint limpio (290 archivos).
- Revisión de aislamiento: no hay queries nuevas; la lectura del adjunto sigue validando el prefijo `tenants/{id}/conversations/{id}/` y el job/mensaje se actualizan por `tenant_id`. Riesgo bajo: sin revisor externo.
- **No probado** con Railway real ni con S3: depende del bucket (§3).

## 5. Criterios de Codex (handoff 14/10) y estado

| # | Criterio | Estado |
|---|---|---|
| 1 | Almacenamiento privado común API/worker, sin URL pública larga | **Preparado, no publicado**: código listo para S3 privado (`PRIVATE_FILES_DISK=s3`); la lectura sigue pasando por endpoints autorizados, nunca URL pública. Falta bucket |
| 2 | Persistencia tras redeploy; controles tenant/conversación; negativos cross-tenant | API: volumen ext4 persistente. Prefijo `tenants/{id}/conversations/{id}/` sin cambios; negativos cross-tenant existentes en `ConversationAttachmentsTest` siguen verdes |
| 3 | Asesor → API → worker → transporte y descarga autorizada | Probado con Meta simulado; con disco faltante, WhatsApp falla visible y web envía |
| 4 | Inbound Meta → apertura en API | Sin cambios; solo simulado, no real |
| 5 | EXIF/XMP, tipo y tamaño | Sin cambios |
| 6 | Recuperabilidad, costo/proveedor, backups | **No verificado**: depende del proveedor del bucket que elija el dueño |
| 7 | Informe, revisión independiente, sin habilitar IA/envíos | Este informe; revisión `tenant-isolation-reviewer` (ver §6); flags sin tocar |

## 6. Revisión independiente (`tenant-isolation-reviewer`, 14/10)

Sin bloqueantes ni fugas cross-tenant: queries por `tenant_id`, prefijo de ruta intacto, FAILED coherente bajo lock y antes de PROCESSING, el reporte no expone rutas ni datos. Dos hallazgos medios:
1. **Archivo vacío** (`''`) pasaba como válido. **Corregido:** en WhatsApp, vacío = faltante (`ATTACHMENT_MISSING`).
2. **Falta un test** de `media_json` del tenant A apuntando a `tenants/B/...` en el dispatcher. El guard del prefijo no cambió y ya existía; queda como mejora, sin hacer en este ticket.

Re-verificación tras la corrección: 374 pasan, 1 omitido; PHPStan y Pint limpios.
