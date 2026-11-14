# EVP-136 — Notificaciones: un lead sin asignar avisa a admins y gerentes

Rama `ticket/EVP-136-lead-sin-asignar` (desde `develop` @ `6f412ca`) · fecha 2026-11-14 · autor Claude y Mauro Centurión · sin commit todavía

## 1. Qué pedía el ticket

Hallazgo P2-6 de la auditoría `QA_STAGING_BELLOMO.md` (NOT-04 y NOT-08). Un lead que queda sin asesor no avisaba a nadie:

- **Alta manual sin asesor:** 0 avisos (admin, asesor 1 y asesor 2).
- **Lead web con la rueda vacía:** `sp_create_or_get_open_lead` lo deja `UNASSIGNED` y `PublicLeadService` solo avisaba si había asesor.
- **Admins y gerentes:** nunca recibían aviso de leads nuevos.

## 2. Qué se implementó

**API** (`everprop-api`)

- **`LeadAssignedNotification::sendUnassigned()`** (nuevo método estático): manda «Lead pendiente de asignación» a cada usuario `TENANT_ADMIN` y `SALES_MANAGER` activo y no borrado del tenant. El texto dice de dónde vino el lead (cargado a mano, web o del chat) y el link lleva a la ficha.
- **El tipo de evento es `LEAD_CREATED_UNASSIGNED`,** el mismo nombre del evento que el procedimiento ya escribe en `domain_outbox` (y que nadie consumía, así que no hay avisos dobles). El panel ya lo clasifica en la pestaña «Equipo» de la campana (`notification-tray.ts`), así que no hizo falta tocar el panel.
- **Se llama en los tres lugares donde nace un lead:**

  | Origen | Dónde | Cuándo avisa | Link |
  |---|---|---|---|
  | Alta manual | `AdminLeadController::store` | sin asesor elegido | ficha del lead |
  | Formulario web | `PublicLeadService` | lead nuevo que la rueda dejó sin asesor | ficha del lead |
  | Chatbot | `ConversationControl::assignLead` | lead nuevo sin asesor, con `notify` activo | la conversación |

- **Lead asignado:** sin cambios. Avisa solo al asesor, como antes.

## 3. Por qué esta solución

- **Un solo método en la notificación que ya existía,** en lugar de una clase nueva: es el mismo aviso de base de datos, con otro tipo y otros destinatarios.
- **Mismo manejo de errores que el aviso al asesor en cada lugar.** En el alta manual y en el formulario web, si falla el aviso se revierte la operación, igual que ya pasaba con el aviso al asesor. En el chatbot va dentro de `rescue`, igual que su aviso al asesor, para no cortar la conversación.
- **El chatbot avisa solo cuando el lead es nuevo.** Si el contacto ya tenía un lead abierto, no se repite el aviso. `DerivarAAsesor` llama con `notify: false` porque la derivación ya tiene su propio aviso, y eso se respeta.
- **El filtro «Sin asignar»,** que el ticket proponía como opcional, ya existe en la lista de leads del admin (`/admin/leads`, filtro de asesor).

## 4. Cómo se verificó

**API**, en el contenedor `everprop-api-php` (PHP 8.4, MySQL 8.4, Redis; Laravel 13.40), con una copia aislada en `/tmp/evp136`:

- `tests/Feature/CRM/UnassignedLeadNotificationTest.php` (nuevo, con datos commiteados y limpieza en `tearDown`): **4 tests y 28 assertions, PASS**.
  - **Alta manual sin asesor:** 1 aviso `LEAD_CREATED_UNASSIGNED` al admin y 1 al gerente, con link a la ficha. Nada al asesor ni al admin deshabilitado.
  - **Alta manual con asesor:** aviso `LEAD_CREATED` solo al asesor. Nada a admin ni gerente.
  - **Formulario web sin rueda configurada:** el lead queda sin asesor, y admin y gerente reciben 1 aviso cada uno.
  - **Chatbot:** un lead existente (`created = false`) no avisa. Uno nuevo sin asesor avisa a admin y gerente con link a la conversación.
- **Suites `tests/Feature/CRM`, `tests/Unit/CRM`, `tests/Feature/Conversations` y `tests/Feature/AgentRuntime`:** 282 tests. La única falla es `WebChatAndUsageTest`, de entorno.
- **Suite completa:** 579 tests. Las 14 fallas son las mismas que en `develop` sin este cambio (`CollectionEmailTest` ×11, `WebChatAndUsageTest`, `PrepareMetaReviewTest`, `ProductionEnvironmentTest`). Vienen del `.env.testing` local.
- **Calidad:** Pint PASS (346 archivos) y PHPStan sin errores.

## 5. Pendientes y riesgos

- **Choque con EVP-135 (PR pendiente):** los dos cambian `AdminLeadController::store`. EVP-135 reindentó el cuerpo de `store`, así que el `else` que agrega este ticket probablemente choque. El que se mergee segundo tiene que resolverlo.
- **Los asesores siguen sin ver los leads sin asignar en su lista.** Es a propósito: el lead lo asigna un admin o gerente.
- **Si no hay admins ni gerentes activos, nadie recibe el aviso.** Es improbable porque el tenant siempre tiene un admin.
- **Sin probar en el navegador:** el modo mock no pasa por la API. El panel ya conocía el tipo de evento.
