# EVP-19 — Adjuntos entre API y worker + informe Meta para Codex

Rama `ticket/EVP-19-adjuntos-worker`, desde `develop` `03adb4f` · 2026-10-14 · Claude con Ramiro Ruggeri.
Jira: https://eversys.atlassian.net/browse/EVP-19, En curso. Sin despliegue ni cambios en Railway.

## 1. Qué pedía el ticket

En staging, la API guarda el adjunto del asesor y el worker lo lee para subirlo a Meta, pero no comparten volumen (`staging-evidence.md`). Hacer que el error se vea, documentar el disco compartido y dejar el checklist Meta y un informe para Codex al día.

## 2. Qué se hizo

- `ConversationAttachments::contents()` devuelve `null` si el archivo no está en el disco de este proceso (antes se convertía en un archivo vacío de 0 bytes y se enviaba).
- `OutboundDispatcher::claim()` lee el adjunto **antes** de pasar el job a PROCESSING. Si falta, el job y el mensaje quedan `FAILED` con `ATTACHMENT_MISSING` (mismo camino que un bloqueo de `ChannelPolicy`) y se reporta el error con la pista de `PRIVATE_FILES_DISK`. Nada llega a Meta, no queda `UNKNOWN`.
- Test: `ConversationAttachmentsTest::test_a_worker_that_cannot_see_the_file_fails_the_send_instead_of_sending_an_empty_one`.
- Docs: `meta-checklist.md` (§6 evals ya commiteados, §6b adjuntos) y `handoff-codex-meta.md` (informe senior para Codex).

## 3. Lo que falta (dueño)

Bucket S3 privado y en `api`, `worker` y `scheduler` de staging: `PRIVATE_FILES_DISK=s3` + `AWS_*`. El driver ya está instalado. Hasta eso, foto/PDF del asesor por WhatsApp falla visible en staging.

## 4. Verificación

Stack local Docker (MySQL 8.4, PHP 8.4), 2026-10-14, código de esta rama:
- `php artisan test`: 373 pasan, 1 omitido (eval con modelo real). Antes, la base de prueba local no tenía 3 scripts forward recientes de `develop` (`collection_email_attempts`, `rotator_role`, `web_push_out_of_hours`); se aplicaron solo a `bellomo_crm_test`.
- PHPStan sin errores; Pint limpio (290 archivos).
- Revisión de aislamiento: no hay queries nuevas; la lectura del adjunto sigue validando el prefijo `tenants/{id}/conversations/{id}/` y el job/mensaje se actualizan por `tenant_id`. Riesgo bajo: sin revisor externo.
- **No probado** con Railway real ni con S3: depende del bucket (§3).
