# Email marketing en EverProp — propuesta técnica y funcional

EVP-53 · 2026-10-20 · Ramiro con Claude. **Estado: propuesta para revisión.** Este documento no incluye código, migraciones ni envíos reales.

## 1. Resumen

- **Demo y staging: Brevo, plan gratuito.** Permite 300 correos por día (unos 9.000 por mes). Funciona por SMTP, que ya usa EverProp, y tiene webhooks de estado.
- **Producción: Amazon SES.** Cuesta unos USD 0,10 cada 1.000 correos. Los eventos de entrega llegan por webhook.
- **Alternativa en producción: Brevo pago**, desde unos USD 9 por mes, si no se quiere operar AWS.
- **El módulo vive en EverProp, no en el proveedor.** Plantillas, segmentos, consentimientos, bajas y métricas quedan en nuestra base. El proveedor solo entrega los correos. Así cambiar de proveedor implica cambiar una variable de configuración, no migrar datos.
- **Cobranzas no es marketing.** Los avisos a deudores son transaccionales: siguen saliendo por `CollectionMailer` (EVP-31), separados del flujo de campañas y sin depender del consentimiento de marketing. Mezclarlos arriesga que una baja de marketing corte un aviso de deuda, o que un mal envío de campaña afecte la reputación de los avisos de cobranza.

## 2. Qué existe hoy

| Pieza | Dónde | Reuso |
|---|---|---|
| Consentimiento por propósito | Tabla `contact_consents` (baseline), con `purpose_code`, estado `GRANTED` / `DENIED` / `WITHDRAWN` / `EXPIRED`, versión del texto legal y fecha de baja | Propósito nuevo `EMAIL_MARKETING`. Ya se carga desde el formulario público (`PublicLeadService`). |
| Envío auditado | `CollectionMailer` + `collection_email_attempts` | Mismo patrón: se reclama el envío antes de llamar al proveedor. Un resultado ambiguo queda `UNKNOWN` y nunca se reintenta a ciegas. |
| SMTP configurable | `config/mail.php`, `collections_mail.*` (EVP-48) | El mailer de marketing es otro mailer con sus propias credenciales. |
| Recepción de webhooks | `webhook_events` con verificación de firma (WhatsApp/Meta) | Los eventos del proveedor de email se reciben de la misma forma: se guarda el recibo, se deduplica y después se procesa. |
| Segmentos de origen | `contacts`, `leads` / `lead_properties` (interés), `installments` (cobranzas) | Los segmentos son consultas sobre datos que ya existen, no listas copiadas. |

No hay plantillas, campañas, bajas ni métricas de correo. Eso es lo que este módulo agrega.

## 3. Proveedores

Precios relevados el 2026-10-20 en fuentes públicas. **Confirmar en la página oficial antes de contratar**: varias fuentes no coinciden entre sí.

| Proveedor | Plan gratuito | Pago | Sirve para | Contras |
|---|---|---|---|---|
| **Brevo** | 300 correos por día, con la marca Brevo en el pie | Desde ~USD 9/mes, por volumen de envíos, contactos ilimitados | Demo con el cliente: alcanza para una campaña chica real. SMTP compatible con lo que ya hay. | El límite diario es estricto: una campaña de 1.000 contactos tarda 4 días. La marca no se puede quitar en el plan gratuito. |
| **Resend** | 3.000 por mes, máximo 100 por día | Pro ~USD 20/mes por 50.000 | Correos transaccionales con buena experiencia para desarrolladores | 100 por día no alcanza para mostrar una campaña. El plan de marketing se cobra aparte, por contactos. |
| **Amazon SES** | Créditos de prueba de AWS para cuentas nuevas | ~USD 0,10 cada 1.000; IP dedicada ~USD 25/mes | Producción con volumen: es el más barato por lejos | Arranca en sandbox (solo destinatarios verificados) hasta que AWS aprueba la salida. Hay que operar AWS: IAM, SNS y región. |
| **SendGrid** | Ya no existe: lo retiraron en 2025 y quedó una prueba de 60 días | Desde ~USD 20/mes | — | No conviene para la demo. |
| **Mailgun** | No pude confirmar si hoy tiene plan gratuito | — | — | Sin datos confiables; queda afuera. |

**Costo estimado en producción.** Bellomo con 20.000 contactos y 4 campañas por mes son ~80.000 correos:
- SES: unos USD 8 por mes.
- Brevo: entre USD 25 y 65 según el plan.

Lo que pesa no es el precio sino la entregabilidad: dominio autenticado, bajas que se respeten y listas limpias.

## 4. Diseño funcional

### 4.1 Plantillas
- Hay dos tipos: **transaccional** (bienvenida a un lead, confirmación de visita, aviso de cobranza) y **marketing** (lanzamiento de proyecto, nuevas unidades, novedades).
- Se guardan en EverProp, por tenant, con versión. Los envíos de una campaña quedan atados a una versión, así lo que se mandó no cambia si después se edita la plantilla.
- **Variables cerradas**, por ejemplo `{{nombre}}`, `{{proyecto}}` o `{{asesor}}`. Se validan al guardar la plantilla. Nada de HTML libre con scripts, y el contenido se escapa siempre.
- Hay vista previa y envío de prueba solo a usuarios del panel.
- **Datos comerciales en vivo.** Si una plantilla muestra precio o disponibilidad, los toma de Inventory en el momento de armar el envío, igual que el resto del sistema. Nunca se escriben a mano en la plantilla.

### 4.2 Segmentos
Un segmento es un filtro guardado que se evalúa en el momento del envío, no una lista estática:

| Segmento | Origen |
|---|---|
| Leads por interés | `leads` abiertos + `lead_properties` (proyecto o tipología), con filtro de etapa y antigüedad |
| Compradores | Contactos con una unidad vendida o cuotas en `installments` |
| Morosos de cobranzas | Cuotas vencidas impagas. **Solo se usa con plantillas transaccionales de cobranza**, nunca para marketing. |

Todo segmento de marketing aplica, en este orden y siempre en el servidor:
1. El tenant del usuario, nunca uno que mande el cliente.
2. Consentimiento `EMAIL_MARKETING` vigente (`GRANTED`, sin baja y sin vencer).
3. Que el correo no esté en la lista de supresión: bajas, rebotes permanentes y quejas de spam.
4. Un solo envío por dirección dentro de la misma campaña.

Antes de confirmar, el panel muestra cuántos contactos quedan después de cada filtro, por ejemplo: «1.240 leads → 870 con consentimiento → 852 enviables».

### 4.3 Campañas y envío
- Una campaña pasa por los estados `DRAFT → SCHEDULED → SENDING → SENT`, o `CANCELLED`.
- La lanza un `SALES_MANAGER` o un `TENANT_ADMIN`, con los roles que ya existen y sin un sistema de permisos aparte.
- Al lanzar, se genera una fila por destinatario con clave única `(tenant_id, campaign_id, contact_id)`. Un job encolado envía por tandas, respetando el límite del proveedor: en Brevo gratuito, 300 por día.
- **Cada envío sigue el patrón de `CollectionMailer`:**
  - se marca `SENDING` antes de llamar al proveedor;
  - pasa a `SENT` con el id de mensaje que devuelve el proveedor;
  - si el resultado es ambiguo, queda `UNKNOWN` y no se reintenta solo.
- **Requisitos de Gmail y Yahoo para envíos masivos:**
  - encabezados `List-Unsubscribe` y `List-Unsubscribe-Post`, para la baja en un clic;
  - un link de baja visible;
  - remitente de un subdominio propio (por ejemplo `novedades.bellomo…`) autenticado con SPF, DKIM y DMARC.
- **Tráfico separado:** el marketing sale de un subdominio distinto al de cobranzas, así un problema de reputación en uno no afecta al otro.

### 4.4 Bajas
- El link de baja lleva un token firmado por el servidor. Funciona sin iniciar sesión, no expone datos y es idempotente.
- Al dar la baja, el consentimiento `EMAIL_MARKETING` pasa a `WITHDRAWN` y el correo entra en la lista de supresión del tenant.
- Una baja de marketing no frena los correos transaccionales de cobranza ni los de una visita pedida.

### 4.5 Entregabilidad y métricas (webhooks)
- **Recepción de eventos del proveedor:**
  - SES envía los eventos por SNS y Brevo por webhook.
  - Se verifica la firma o un secreto antes de guardar nada.
  - Cada evento se guarda como recibo en `webhook_events`, deduplicado por id de evento del proveedor, y se procesa en un job.
- **Eventos:** entregado, rebote permanente, rebote temporal, queja de spam, apertura, click y baja.
- **Efectos de cada evento:**
  - Un rebote permanente o una queja agrega el correo a la lista de supresión automáticamente.
  - Un rebote temporal no suprime el correo; recién lo suprime el tercero seguido.
- **Métricas por campaña:** enviados, entregados, rebotes, quejas, aperturas y clicks.
  - **Las aperturas son aproximadas:** Apple Mail las adelanta y otros clientes de correo bloquean el píxel. Se muestran como referencia; los clicks son el indicador confiable.
- **Alertas al gerente**, con la campana y el push de EVP-50:
  - más de 5 % de rebotes en una campaña;
  - más de 0,1 % de quejas de spam.

  Gmail exige quedar por debajo de 0,3 % de quejas.

## 5. Datos (borrador para el script forward)

Todas las tablas llevan `tenant_id`, `UNIQUE(tenant_id, id)`, FKs compuestas, `DATETIME(3)` y CHECK en los estados.

| Tabla | Para qué | Claves |
|---|---|---|
| `email_templates` / `email_template_versions` | Plantillas con versión | `UNIQUE(tenant_id, template_id, version)` |
| `email_segments` | Filtro guardado como JSON validado contra una lista cerrada de criterios, nunca SQL libre | — |
| `email_campaigns` | Campaña, versión de plantilla, segmento y estado | — |
| `email_campaign_recipients` | Una fila por destinatario, con estado y `provider_message_id` | `UNIQUE(tenant_id, campaign_id, contact_id)`, índice por `provider_message_id` |
| `email_events` | Eventos ya normalizados | `UNIQUE(tenant_id, provider, provider_event_id)` |
| `email_suppressions` | Bajas, rebotes y quejas por dirección | `UNIQUE(tenant_id, email_normalized)` |

Reuso sin tablas nuevas: `contact_consents` (propósito `EMAIL_MARKETING`) y `webhook_events` (recibos).

**Revisiones obligatorias del script forward:** `schema-migration-guardian` y `tenant-isolation-reviewer`.

## 6. Hoja de ruta

| Fase | Contenido | Proveedor |
|---|---|---|
| **1. Demo** | Plantillas, un segmento de leads por interés, envío de una campaña, baja en un clic y webhooks de entrega y rebote. Contactos de prueba y del equipo. | Brevo gratuito, subdominio de staging |
| **2. Piloto Bellomo** | Más segmentos (compradores), métricas, alertas al gerente y envío de prueba. Los contactos reales solo si tienen consentimiento registrado. | Brevo gratuito o Starter |
| **3. Producción** | Salida de sandbox en SES, eventos por SNS, IP dedicada solo si el volumen lo justifica (más de ~100.000 por mes) y DMARC en `p=quarantine`. | Amazon SES |

**Cambiar de proveedor entre fases:** se cambia la configuración del mailer y se agrega el receptor de webhooks del nuevo proveedor. Plantillas, segmentos, bajas e historial no se tocan.

## 7. Decisiones que necesitan al cliente o al equipo

1. **Base legal de los contactos actuales.** Muchos leads llegaron sin consentimiento explícito de marketing. Hay que decidir si solo se envía a quienes tienen `EMAIL_MARKETING` registrado (lo que recomiendo) o si se arma primero una campaña de pedido de consentimiento.

   **Marco aplicable:** la Ley 25.326 de Datos Personales exige una vía de baja y permite al titular pedir que lo saquen de la base.
2. **Dominio de envío:** qué subdominio usar y quién administra el DNS de Bellomo para cargar SPF, DKIM y DMARC.
3. **Cuenta del proveedor:** a nombre de quién se abre. Las credenciales van a los secretos del entorno, nunca al repo.
4. **Volumen esperado:** cuántos contactos hay y cuántas campañas por mes. Define si conviene Brevo pago o SES.

## Fuentes

- [Precios de Amazon SES (AWS)](https://aws.amazon.com/en/ses/pricing/)
- [Plan gratuito de Resend 2026 (automationatlas)](https://automationatlas.io/answers/resend-free-tier-explained-2026/)
- [Reseña de Resend 2026 (WP Mail SMTP)](https://wpmailsmtp.com/resend-review/)
- [Precios de Brevo 2026 (ecommerce-platforms)](https://ecommerce-platforms.com/email-marketing-services-reviews/sendinblue-pricing)
- [Brevo: gratuito vs. pago (dreamlit)](https://dreamlit.ai/blog/brevo-review)
- [Fin del plan gratuito de SendGrid (dreamlit)](https://dreamlit.ai/blog/best-sendgrid-alternatives)
