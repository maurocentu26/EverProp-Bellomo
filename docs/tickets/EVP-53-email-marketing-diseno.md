# EVP-53 — Email marketing: diseño, análisis funcional y proveedores

Rama `ticket/EVP-53-email-marketing-diseno` desde `develop` (`4460655`) · 2026-10-20 · Claude con Ramiro.

## Pedido (Mauro)
- Comparar proveedores gratuitos o baratos para demo y staging, y armar una hoja de ruta para producción.
- Diseño funcional: plantillas, segmentación (leads por interés, compradores, morosos) y entregabilidad con webhooks.
- Entregable: un documento con la recomendación de proveedor.

## Entregable
`docs/email-marketing/propuesta-email-cobranzas.md`.

## Recomendación
- **Alcance aclarado por Ramiro (2026-10-21):** es para cobranzas, con el modelo Ecogas: avisos antes y después del vencimiento de cada cuota, no campañas promocionales.
- **Demo y staging:** Brevo, plan gratuito (300 correos por día, por SMTP).
- **Producción:** Amazon SES (~USD 0,10 cada 1.000 correos).

Se extiende EVP-31: el aviso a 5 días pasa a ser una secuencia D−5, D0, D+3 y D+15 (esta última la revisa una persona), con correo tipo estado de cuenta, estados de entrega por webhook y un panel de seguimiento para cobranzas.

## Cómo se verificó
- Leí el código actual: `contact_consents`, `CollectionMailer`, `PublicLeadService` y `RoleCode`.
- Relevé los precios en fuentes públicas el 2026-10-20; están citados en el documento. Antes de contratar hay que confirmarlos en la página oficial.
- No incluye código, migraciones ni envíos reales.

## Pendientes
Las decisiones de la sección 7 del documento: base legal de los contactos actuales, dominio de envío, titular de la cuenta del proveedor y volumen esperado. La implementación va en tickets nuevos, uno por fase.
