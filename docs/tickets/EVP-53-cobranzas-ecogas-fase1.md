# EVP-53: email de cobranzas modelo Ecogas, fase 1

Rama `ticket/EVP-53-cobranzas-ecogas` desde `develop` · 2026-10-21 · Claude con Ramiro.

## Pedido
Ramiro aprobó el 2026-10-21, después de hablarlo con Bellomo, implementar la propuesta `docs/email-marketing/propuesta-email-cobranzas.md`. El objetivo es que el comprador de un lote en cuotas reciba los recordatorios como con Ecogas.

## Qué hace ahora
El comando horario `everprop:collections:notify-upcoming` manda la secuencia completa de cada cuota impaga. Cada aviso sale una sola vez por cuota:

| Momento | Tipo | Asunto |
|---|---|---|
| 1 a 5 días antes (ya existía, EVP-31) | `UPCOMING` | «Tu cuota 3 de 24 vence el 10/11/2026 — Bellomo» |
| El día del vencimiento (**nuevo**) | `DUE_TODAY` | «Hoy vence tu cuota 3 de 24 — Bellomo» |
| 3 días después, si sigue impaga (**nuevo**) | `PAST_DUE` | «Tu cuota 3 quedó pendiente — Bellomo» |

**Formato del correo:** se manda en HTML como un resumen de cuenta, con el importe y el vencimiento destacados, el número de cuota, la propiedad y cómo pagar. Lleva también la versión en texto plano. Todo dato se escapa.

**Reglas que se mantienen:**
- Antes de enviar, se recalcula el saldo bajo el lock del tenant. Una cuota pagada no recibe nada.
- Un resultado dudoso queda `UNKNOWN` y frena los avisos siguientes de esa cuota hasta que alguien lo revise.
- Hay un tope de envíos por corrida.
- Un solo correo por cuota por día.

**El aviso de cuota pendiente solo sale para vencimientos de los últimos 10 días.** Así, el día que se active, no le llega un correo a toda la deuda vieja: eso sigue siendo una decisión de una persona, con el comando manual `everprop:collections:email`.

**El aviso previo deja de salir el mismo día del vencimiento**, porque ese día corresponde «Hoy vence».

**Configuración nueva** (en `.env.example`):
- `COLLECTIONS_PAST_DUE_DAYS=3`: días después del vencimiento para el aviso de cuota pendiente.
- `COLLECTIONS_PAST_DUE_MAX_DAYS=10`: antigüedad máxima del vencimiento para mandarlo.

## Base de datos
Forward `2026-10-21.001_collection_email_sequence.sql`, idempotente y solo de expansión:
- Amplía el CHECK de `kind` con `DUE_TODAY` y `PAST_DUE`.
- Agrega una columna generada y una clave única que garantizan un solo aviso de cada tipo por cuota, igual que `UPCOMING` en `2026-10-15.002`.
- No crea tablas ni FKs, así que el contrato del esquema no cambia.

## Cómo se verificó
- `php -l` y Pint pasan.
- Tests nuevos en `tests/Feature/Collections/CollectionEmailTest.php`:
  - la secuencia completa del día del vencimiento y del día +3, que sale una sola vez, en HTML y con el nombre escapado;
  - la deuda de más de 10 días no recibe el aviso automático, y un pago corta la secuencia;
  - la base rechaza un segundo aviso de cuota pendiente;
  - un recordatorio manual ya enviado frena el aviso automático.
- **Pendiente:** los tests de PHP y PHPStan corren en el CI, porque Docker no arranca en esta PC.
- Revisiones: `tenant-isolation-reviewer` y `schema-migration-guardian` (resultado en la sección siguiente).

## Revisiones
- **`tenant-isolation-reviewer`:** sin fugas entre tenants y sin bloqueantes ni altos. Todas las queries y joins filtran tenant en los dos lados, el tenant sale solo de la configuración y el HTML se escapa. Ajustes aplicados:
  - El envío se frena si falta el forward 2026-10-21.001. Sin esa columna, el CHECK viejo rechazaría los avisos nuevos en silencio y gastarían el tope de envíos.
  - El aviso automático de cuota pendiente no sale si un operador ya mandó el recordatorio manual de esa cuota. Tiene un test.
  - **Aceptado:** como hay un solo correo por cuota por día, si un operador manda el recordatorio manual el mismo día que toca el automático, el automático no sale.
- **`schema-migration-guardian`:** el script es expand-only, idempotente y seguro para la app anterior. Ajustes aplicados:
  - El CHECK se amplía en un solo ALTER atómico.
  - Se agregó `lock_wait_timeout`.
  - El índice se crea con `ALGORITHM=INPLACE, LOCK=NONE`.
  - Copiar la tabla de auditoría, que es chica, es aceptable. Conviene correrlo en un horario de poca actividad.

## Falta (fases siguientes, de la propuesta)
- **Fase 2:**
  - estado de entrega y rebote por webhook del proveedor, con aviso al asesor si el correo rebota;
  - historial de avisos por cuota en el panel de cobranzas;
  - textos y días configurables por tenant;
  - aviso de deuda formal a los 15 días, revisado por una persona.
- **Fase 3:** link de pago o débito automático.
- **Para producción:** hay que confirmar que el envío de cobranzas esté encendido y configurado: `COLLECTIONS_MAIL_ENABLED`, tenant, remitente, SMTP y datos de pago.
