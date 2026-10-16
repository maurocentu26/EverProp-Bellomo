# EVP-32 — Release a producción: cobranzas con email (sin módulo de IA)

**Rama:** `release/evp-32-cobranzas-email`, desde `main` (`d8e2672`). **PR:** hacia `main`.

## Qué entra

Solo lo de cobranzas por email que ya estaba integrado y probado en `develop` (EVP-31 y el trabajo previo de cobranzas). Se copió archivo por archivo desde `develop`, sin mergear `develop`.

| Área | Archivos |
|---|---|
| Dominio | `Collections/CollectionEmail.php`, `CollectionMailer.php`, `CollectionEmailController.php`, `CollectionBillingController.php` |
| Comandos | `EmailCollection` (manual, con vista previa), `NotifyUpcomingInstallments` (aviso de cuota próxima, cada hora) |
| Config | `config/collections_mail.php`, mailer `collections` en `config/mail.php`, variables en `.env.example` |
| Rutas | `GET installments/{id}/email-preview`, `GET collections/billing-export`; scheduler de `notify-upcoming` |
| Esquema | forwards `2026-10-07.001_collection_email_attempts.sql` y `2026-10-15.002_collection_email_kind.sql` |
| Panel | vista previa del correo y exportación de pagos en Cobranzas |
| Tests y docs | `CollectionEmailTest`, `docs/collections-email.md` |

**Qué no entra:** nada del módulo de IA ni de conversaciones, ni el resto de `develop`. La política de EVP-17 lo verifica en el PR.

## Cómo sale a producción

Lo hace una persona, con autorización:

1. Backup de la base.
2. Forwards en orden: `2026-10-07.001` y después `2026-10-15.002`.
3. Deploy de la API y del panel.
4. Confirmar que el scheduler corre (`schedule:run` cada minuto).
5. Cargar las variables `COLLECTIONS_MAIL_*`: SMTP del proveedor, remitente, reply-to y datos de pago aprobados por Bellomo.
6. `php artisan everprop:collections:notify-upcoming --dry-run` y un envío de prueba a un destinatario controlado.
7. Recién después, `COLLECTIONS_MAIL_ENABLED=true`.

Mientras falte cualquier dato, el envío queda bloqueado por el código (`CollectionMailer::blocker`) y no sale ningún email.

## Bloqueantes externos

- **Proveedor transaccional** con el dominio de Bellomo verificado (SPF, DKIM y DMARC).
- **Remitente y reply-to** definidos.
- **Datos de pago** aprobados por Bellomo.
- **Política de retención** de la auditoría.

## Evidencia

- Policy check local (`check-pr-policy.mjs` de `develop`, BASE=main): ver commit.
- CI del PR: pendiente.
