# EVP-31 — Cobranzas: aviso automático de cuota próxima por email (modelo Ecogas)

Rama `ticket/EVP-31-aviso-cuota-email` (desde `develop`) · fecha 2026-10-15 · Claude Code con Ramiro Ruggeri
Ticket Jira [EVP-31](https://eversys.atlassian.net/browse/EVP-31). El pase a producción va en EVP-32.

## 1. Qué pedía el ticket

Que Bellomo lleve el control de las cobranzas "como Ecogas": el cliente recibe por email el aviso de su próxima cuota, como la factura digital, antes del vencimiento.

**Decisiones de Ramiro (2026-10-15):**
- solo el **aviso de cuota**;
- **automático desde el día 1**;
- **proveedor transaccional por SMTP**;
- **datos de pago confirmados por Bellomo** antes de cualquier envío.

**Investigación de referencia (Ecogas):**
- la factura digital llega por email con importe, vencimiento, período y detalle;
- el aviso de deuda se manda después del vencimiento, con el detalle de cada comprobante adeudado, la fecha de emisión y un plazo no menor a 2 días hábiles. Ese aviso queda fuera de este ticket.

## 2. Qué se implementó

**`CollectionEmail` (aviso `UPCOMING`):**
- **Asunto:** "Tu cuota n de N vence el dd/mm/aaaa".
- **Cuerpo:** cuota, vencimiento, importe pendiente (descontando pagos parciales), proyecto, los datos de pago aprobados y "si ya pagaste, no tenés que hacer nada".
- **Elegibilidad:** acuerdo activo, cuota con saldo, email válido y vencimiento entre hoy y hoy + `COLLECTIONS_UPCOMING_DAYS` (5), en la hora del cliente.

**`CollectionMailer`:** la lógica de envío, sacada del comando manual para que el manual y el automático usen el mismo camino.
- se vuelven a verificar el saldo y el estado bajo el bloqueo del tenant;
- el registro `SENDING` se guarda antes de contactar al SMTP;
- un `UNKNOWN` nunca se reintenta;
- `blocker()` impide cualquier envío, manual o automático, si falta algo: habilitación, tenant, remitente, reply-to, SMTP, **datos de pago aprobados** o el esquema de auditoría.

**`everprop:collections:notify-upcoming`:**
- corre cada hora en el scheduler y envía desde las 9 hora del cliente;
- tope de 200 envíos por corrida;
- `--dry-run` muestra qué saldría sin enviar nada;
- solo considera cuotas con saldo y email, y falla en voz alta si una corrida saltea tantas como el tope.

**Forward `2026-10-15.002_collection_email_kind.sql`:**
- columna `kind`: `UPCOMING` u `OVERDUE`, con `OVERDUE` por defecto para las filas que ya existen;
- CHECK sobre esa columna;
- **índice único `uq_collection_email_upcoming`** sobre una columna generada: la base garantiza un solo aviso de cuota próxima por cuota;
- índice de consulta por cuota y tipo.

**Configuración:** `.env.example` y `docs/collections-email.md`, con la guía del proveedor (SPF, DKIM, credenciales SMTP y orden de activación).

## 3. Por qué esta solución

- **Reutiliza lo que ya está probado:** el bloqueo de concurrencia, la auditoría y la regla de no reenviar a ciegas. No se suma una dependencia nueva: el proveedor transaccional se usa por SMTP.
- **Una sola vez por cuota, garantizado en dos niveles:** la consulta y el bloqueo en el código, y el índice único en la base.
- **Si falta configuración, no se envía nada.** El texto con los datos de pago es lo que el cliente va a usar para pagar, así que nunca se completa con un valor inventado.
- **Ejecución cada hora con compuerta horaria:** si una corrida falla, la siguiente la recupera, sin cron diario frágil.

## 4. Cómo se verificó

| Comprobación | Resultado |
|---|---|
| Pint y PHPStan | OK, en un contenedor sin red ni base de datos |
| `ForwardScriptsTest` | OK |
| `CollectionEmailTest` (14 tests, 8 nuevos) | Escritos. Corren en el CI del PR |
| Qué cubren los nuevos | El aviso sale una vez dentro de la ventana, no antes de la hora y no se repite; lleva importe, fecha y datos de pago. Usa el saldo y saltea cuotas pagadas. Sin datos de pago no sale nada, ni el automático ni el manual. Solo se avisa al tenant habilitado, aunque otro tenant tenga un contacto con el mismo email. El tope no se agota con cuotas pagadas. Un intento sin resolver bloquea el aviso, y la base rechaza un segundo `UPCOMING`. `--dry-run` no envía, y `UNKNOWN` no se reintenta |
| Revisión `tenant-isolation-reviewer` | Sin fugas entre clientes, envíos dobles ni reintentos de `UNKNOWN`. Se corrigió su hallazgo alto (cuotas que nunca se avisaban por el tope) y se agregaron los tests que pidió |
| Revisión `schema-migration-guardian` | Sin bloqueantes. Se documentó el COPY del CHECK y se agregó la unicidad en la base que sugirió |

**No verificado en local:**
- **La suite de PHP y el forward:** el stack de pruebas aislado perdió su archivo de secretos, que estaba en una carpeta temporal del sistema. Los dos se ejecutan en el CI sobre una MySQL 8.4 limpia, con baseline, forwards y `schema:verify`.
- **Un envío real:** no se hizo ninguno.

## 5. Pendientes y riesgos

- **Antes de activarlo** (EVP-32):
  - la cuenta del proveedor, con el dominio de Bellomo verificado (SPF, DKIM y DMARC);
  - el remitente y el reply-to;
  - los **datos de pago aprobados por Bellomo**;
  - un envío de prueba a un destinatario controlado.
- **Política de retención** de la auditoría: contiene emails e importes.
- **Fuera de alcance:** el aviso de deuda al estilo Ecogas, el recordatorio el día del vencimiento y la confirmación de pago.
