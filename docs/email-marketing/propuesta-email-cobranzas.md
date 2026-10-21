# Email de cobranzas en EverProp: propuesta técnica y funcional (modelo Ecogas)

EVP-53 · 2026-10-21 · Ramiro con Claude. **Estado: propuesta para revisión.** Este documento no incluye código, migraciones ni envíos reales.

> **Alcance aclarado por Ramiro:** el «email marketing» de este ticket es para el sector de **cobranzas**. Se trata de avisar a cada comprador antes y después del vencimiento de su cuota, como hace Ecogas con la factura. No son campañas promocionales.

## 1. Resumen

- **Qué hace Ecogas:**
  - Manda todos los meses la factura por correo, con importe, vencimiento, período y detalle.
  - Empuja el débito automático para evitar recargos por pagar tarde.
  - Antes de cortar el servicio, emite un aviso de deuda formal.

  No encontré evidencia pública de que mande un recordatorio aparte el día del vencimiento.
- **Qué ya tiene EverProp (EVP-31):**
  - Un aviso automático cuando faltan 5 días para el vencimiento, una sola vez por cuota, a la hora local del tenant.
  - Un recordatorio de deuda que un operador manda a mano.
  - Los dos se auditan en `collection_email_attempts`, y un resultado dudoso nunca se reintenta a ciegas.
- **Qué propongo:**
  1. Pasar de un aviso suelto a una **secuencia de avisos** por cuota.
  2. Un **correo con formato de estado de cuenta**.
  3. Saber si el correo **llegó, rebotó o se abrió**.
  4. Un **panel de seguimiento** para el equipo de cobranzas.
- **Proveedor:**
  - Demo y staging: **Brevo gratuito**, con 300 correos por día por SMTP, que ya es como envía `CollectionMailer`.
  - Producción: **Amazon SES**, a unos USD 0,10 cada 1.000 correos.

  Detalle en la sección 6.

## 2. Ecogas vs. EverProp hoy

| Pieza del modelo Ecogas | Ecogas | EverProp hoy | Propuesta |
|---|---|---|---|
| Comprobante por correo con importe, vencimiento y detalle | Sí, todos los meses | Texto plano con cuota, vencimiento, importe e instrucciones de pago | Correo HTML tipo estado de cuenta, con versión de texto plano (§3.2) |
| Aviso antes del vencimiento | Implícito en la factura | Sí, a 5 días (`COLLECTIONS_UPCOMING_DAYS`) | Se mantiene y se suma el aviso del día del vencimiento (§3.1) |
| Aviso después del vencimiento | Aviso de deuda antes del corte | Manual, lo lanza un operador | Automático a +3 días; el aviso formal a +15 días queda en manos de una persona (§3.1) |
| Pago sin fricción | Débito automático | Instrucciones de pago fijas por configuración | Fase 3: link de pago o débito, a decidir con Bellomo |
| Saber si llegó | No es público | No: SMTP solo confirma que el servidor aceptó el correo | Webhooks de entrega, rebote y apertura (§3.4) |
| Medio alternativo | Sí, la factura física | No | Si el correo rebota, se alerta al asesor para que llame o escriba por WhatsApp |

## 3. Diseño funcional

### 3.1 Secuencia por cuota

| Momento | Tipo | Asunto (borrador) | Automático |
|---|---|---|---|
| D−5 | `UPCOMING`, ya existe | «Tu cuota 3 de 24 vence el 10/11» | Sí |
| D0, a las 9 hora local | `DUE_TODAY`, nuevo | «Hoy vence tu cuota 3» | Sí |
| D+3 | `OVERDUE`, ya existe y pasa a automático | «Tu cuota 3 quedó pendiente» | Sí, una vez |
| D+15 | `DEBT_NOTICE`, nuevo | «Aviso de deuda — cuota 3» | **No.** El operador lo revisa y lo manda. |

**Reglas comunes a todos los avisos:**
- Antes de cada envío se vuelve a calcular el saldo, igual que hoy en `CollectionMailer`, con el lock del tenant. Si la cuota ya está pagada, no sale nada.
- Cada cuota recibe una sola vez cada tipo de aviso, gracias a la clave única por `(tenant, cuota, tipo)`.
- Los días de anticipación y el horario se configuran por tenant. Si el día del vencimiento cae en feriado o fin de semana, se usa el horario de atención de EVP-14 y el aviso sale el día hábil anterior.
- Cada correo aclara que puede no reflejar pagos de los últimos días.
- Un pago registrado corta la secuencia de esa cuota.
- Las cuotas con un aviso en estado `UNKNOWN` frenan la secuencia hasta que una persona las revise. Es la regla actual.

**Tono:** cordial y claro, como Ecogas: importe, fecha y cómo pagar. El aviso de deuda es formal, sin amenazas ni cargos que no estén en el contrato, y lo revisa una persona.

### 3.2 El correo

- **Estructura:**
  - logo de la empresa;
  - un bloque con el importe y la fecha de vencimiento destacados;
  - proyecto y unidad, cuota N de M y saldo restante del plan;
  - cómo pagar;
  - datos de contacto de cobranzas.
- HTML simple con versión de texto plano, porque muchos clientes de correo bloquean imágenes. Todo dato se escapa.
- Los textos los edita un administrador por tenant y por tipo de aviso, con **variables cerradas**: `{{nombre}}`, `{{cuota}}`, `{{total_cuotas}}`, `{{vencimiento}}`, `{{importe}}`, `{{moneda}}`, `{{proyecto}}`, `{{unidad}}`, `{{saldo_plan}}` y `{{como_pagar}}`.
  - Importe, moneda y saldo **siempre salen de la base al momento del envío**; nunca se escriben a mano.
  - Cada intento guarda la versión del texto que se usó.
- El remitente es fijo y el correo de respuesta lo atiende cobranzas, como hoy.
- **Sin link de baja:** son avisos de un contrato vigente, no publicidad. Sí hay que respetar un pedido explícito de no recibir correos, que se registra como supresión y se le avisa a cobranzas para usar otro medio.

### 3.3 Panel de cobranzas

**Por cuota:** una línea de tiempo con cada aviso y su estado:
- Programado, Enviado o Entregado.
- Abierto, como referencia; ver §3.4.
- Rebotado o Dudoso (`UNKNOWN`).

**Vista del día:** qué sale hoy, qué rebotó y qué necesita revisión.
- El aviso de deuda D+15 aparece como tarea para el operador.
- Si un correo rebota, se notifica al asesor del comprador por la campana y el push de EVP-50, para que lo contacte por otro medio y corrija el correo en la ficha.

**Métricas por mes:**
- % de cuotas pagadas antes del vencimiento;
- % pagadas después de cada aviso;
- rebotes.

Es el indicador que muestra si la secuencia sirve.

### 3.4 Entregabilidad y estados (webhooks)

- **Recepción de eventos:**
  - SES los manda por SNS y Brevo por webhook.
  - Se verifica la firma o un secreto antes de guardar nada.
  - Cada evento se guarda como recibo en `webhook_events`, deduplicado por id de evento, y se procesa en un job, con el mismo patrón que WhatsApp.
- **Cómo se vincula:** se guarda el `provider_message_id` en `collection_email_attempts`, que es lo que une el evento con el aviso.
- **Eventos:** entregado, rebote permanente, rebote temporal, queja y apertura.
  - Con un rebote permanente, el correo queda suprimido y se alerta al asesor.
  - Con una queja, el correo queda suprimido y se avisa a cobranzas.
- **Las aperturas son aproximadas:** Apple Mail las adelanta y otros clientes de correo bloquean el píxel. Sirven de referencia, no como prueba de que el cliente leyó el aviso.
- **Autenticación del remitente:** dominio de envío propio con SPF, DKIM y DMARC, por ejemplo `cobranzas.<dominio de Bellomo>`. Sin esto, Gmail manda el correo a spam.

## 4. Datos (borrador para el script forward)

Primero se extiende lo que ya existe; solo se crea lo indispensable.

| Cambio | Detalle |
|---|---|
| `collection_email_attempts` | Agregar `provider_message_id`, `delivered_at`, `opened_at`, `bounced_at`, `bounce_type` y `template_version`. Ampliar el CHECK de `kind` con `DUE_TODAY` y `DEBT_NOTICE`. |
| `collection_email_templates`, nueva | Texto por tenant y tipo de aviso, con versión. `UNIQUE(tenant_id, kind, version)`. |
| `email_suppressions`, nueva | Rebotes, quejas y pedidos de no contacto por dirección de correo. `UNIQUE(tenant_id, email_normalized)`. |
| `webhook_events` | Se reutiliza para guardar los recibos del proveedor. |
| Configuración por tenant | Días de anticipación, días después del vencimiento y horario. Hoy son variables de entorno globales (`COLLECTIONS_UPCOMING_DAYS`, `COLLECTIONS_UPCOMING_HOUR`) y pasan a ser por tenant. |

**Revisiones obligatorias del script forward:** `schema-migration-guardian` y `tenant-isolation-reviewer`.

## 5. Hoja de ruta

| Fase | Contenido |
|---|---|
| **1. Demo** | Aviso D0 y D+3 automáticos, correo en HTML, webhooks de entrega y rebote, línea de tiempo por cuota. Sobre compradores de prueba en staging, con Brevo gratuito. |
| **2. Piloto Bellomo** | Textos editables por tenant, aviso de deuda D+15 revisado por una persona, alerta al asesor por rebote, métricas por mes. Con Brevo gratuito o Starter, según el volumen de cuotas. |
| **3. Producción** | Amazon SES fuera del modo sandbox, eventos por SNS y DMARC estricto. Además, a definir con Bellomo: link de pago o débito automático, la pieza de Ecogas que más reduce la mora. |

## 6. Proveedores

Precios relevados en fuentes públicas el 2026-10-20. **Hay que confirmarlos en la página oficial antes de contratar.**

| Proveedor | Plan gratuito | Pago | Veredicto |
|---|---|---|---|
| **Brevo** | 300 correos por día, con la marca Brevo | Desde ~USD 9/mes | **Demo y piloto.** El límite diario sobra para avisos de cuotas. Funciona por SMTP, que ya usa `CollectionMailer`. |
| **Amazon SES** | Créditos de prueba de AWS | ~USD 0,10 cada 1.000 | **Producción.** Es el más barato y confiable. Arranca en sandbox hasta que AWS lo aprueba. |
| Resend | 3.000 por mes, máximo 100 por día | ~USD 20/mes | Sirve, pero no le gana a Brevo para la demo. |
| SendGrid | Lo retiraron en 2025 | ~USD 20/mes | No. |
| Mailgun | No pude confirmarlo | — | Sin datos. |

**Volumen esperado:** 1.000 compradores con 4 avisos al mes dan ~4.000 correos. En SES cuesta menos de USD 1 por mes; con Brevo pago, unos USD 9.

## 7. Decisiones que necesitan a Bellomo

1. **Secuencia:** si se aprueban los cuatro momentos D−5, D0, D+3 y D+15, y el tono del aviso de deuda. Conviene que lo revise su área legal o contable.
2. **Dominio de envío:** qué subdominio y quién administra el DNS para cargar SPF, DKIM y DMARC.
3. **Cómo pagar:** qué medios de pago se informan, y si hay link de pago o débito automático para la fase 3.
4. **Correos faltantes o inválidos:** quién los corrige. Si un comprador no tiene correo en su ficha, no recibe nada.

## Fuentes

**Ecogas:**
- [Adherir a la factura digital (Cadena 3)](https://www.cadena3.com/noticia/ecogas/cinco-razones-para-adherirte-a-la-factura-digital_242150)
- [El Sol](https://www.elsol.com.ar/?p=1540464)
- [Beneficios del pago automático (Diario de Cuyo)](https://diariodecuyo.com.ar/sanjuan/Beneficios-de-adherir-la-factura-de-ECOGAS-al-pago-automatico-20200605-0081.html)
- [Aviso de deuda antes del corte (Tiempo de San Juan)](https://www.tiempodesanjuan.com/sanjuan/2018/5/23/ecogas-todavia-no-la-notifican-mantiene-los-cortes-por-falta-de-pago-216951.html)

Son notas de prensa de 2018 a 2021: confirmar los detalles vigentes en ecogas.com.ar.

**Proveedores de correo:**
- [Precios de Amazon SES](https://aws.amazon.com/en/ses/pricing/)
- [Plan gratuito de Resend](https://automationatlas.io/answers/resend-free-tier-explained-2026/)
- [Precios de Brevo](https://ecommerce-platforms.com/email-marketing-services-reviews/sendinblue-pricing)
- [Fin del plan gratuito de SendGrid](https://dreamlit.ai/blog/best-sendgrid-alternatives)
