# EVP-133 — Leads: historial y método de la asignación manual

Rama `ticket/EVP-133-historial-asignacion` (desde `develop` @ `cd3ad17`) · fecha 2026-11-14 · autor Claude y Mauro Centurión · sin commit todavía

## 1. Qué pedía el ticket

Hallazgo P2-3 de la auditoría `QA_STAGING_BELLOMO.md` (GES-B, GES-G y NOT-05). Al asignar o reasignar un lead desde el panel (`PATCH /admin/leads/{id}` con `agent_id`):

- no se guardaba nada en `lead_assignments`;
- `assignment_method` quedaba en `UNASSIGNED`;
- `first_assigned_at` y `last_assigned_at` quedaban vacíos;
- la primera asignación llegaba con el título «Lead reasignado»;
- el asesor que perdía el lead no recibía aviso.

## 2. Qué se implementó

- **`App\Domain\CRM\Services\LeadAssignments::change()`** (nuevo): registra un cambio manual de responsable dentro de la transacción que tiene el lead. Hace lo mismo que `sp_create_or_get_open_lead` en la asignación automática:
  - cierra la asignación abierta (`ended_at`);
  - inserta la nueva fila con `from_user_id`, `to_user_id`, `actor_user_id` y el motivo: `MANUAL` (el lead no tenía responsable), `REASSIGNMENT` (tenía otro) o `UNASSIGNED` (se lo deja sin responsable);
  - actualiza en `leads` el responsable, `assignment_method`, `first_assigned_at` (solo si estaba vacío) y `last_assigned_at`;
  - si el responsable no cambia, no hace nada.
- **`AdminLeadController::update`:** usa el servicio, y los avisos ahora distinguen los casos:
  - al nuevo responsable: «Nuevo lead asignado» (`LEAD_ASSIGNED`) en la primera asignación y «Lead reasignado» (`LEAD_REASSIGNED`) en las siguientes;
  - al responsable anterior: «Lead asignado a otro asesor» (`LEAD_REASSIGNED_AWAY`), con a quién pasó o si quedó sin asignar. El link va a la lista de leads, porque ya no puede abrir ese lead. No se avisa si quien hace el cambio es el propio asesor anterior.
  - si falla un aviso, se deshace el cambio, como antes.
- **`AdminLeadController::store`:** si el lead se crea con un responsable, registra la asignación inicial `MANUAL` con sus fechas. El aviso «Nuevo lead asignado» ya existía.
- **`AdminConversationController::lead`:** cuando un asesor toma desde una conversación un lead sin responsable, ahora también queda registrado. Este camino no estaba en el ticket pero tenía el mismo problema. Se bloquea la fila del lead para que dos asesores no lo tomen a la vez.

## 3. Por qué esta solución

- **Un solo servicio para los tres caminos manuales:** así ninguno vuelve a quedar sin historial. La asignación automática ya se registra en el procedimiento.
- **Sin cambios en la base:** la tabla, los motivos (`ck_lead_assignments_reason`) y los métodos (`ck_leads_assignment_method`) ya existían.
- **Sin cambios en el panel:** los avisos nuevos son de tipo `LEAD_*`, así que la bandeja de notificaciones los muestra en «Leads» y «Para mí».

## 4. Cómo se verificó

En el contenedor `everprop-api-php` (PHP 8.4, MySQL 8.4; Laravel 13.40), con una copia aislada en `/tmp/evp133`:

- `tests/Feature/CRM/LeadAssignmentHistoryTest.php` (nuevo): **2 tests, 29 assertions, PASS**.
  - **Asignar y reasignar:** quedan 2 filas en el historial (`MANUAL` y luego `REASSIGNMENT`), la anterior se cierra, se guardan el actor y el método, `first_assigned_at` se conserva y `last_assigned_at` avanza.
  - **Avisos:** el asesor 1 recibe «Nuevo lead asignado» y luego «Lead asignado a otro asesor»; el asesor 2 recibe «Lead reasignado».
  - **Mismo responsable:** no agrega filas.
  - **Dejar sin asignar:** fila `UNASSIGNED`, método `UNASSIGNED` y aviso al anterior.
  - **Alta con responsable:** una fila `MANUAL` con actor y fechas.
- `ConversationLeadTest`: se agregó que el asesor que toma el lead desde la conversación deja una fila `MANUAL` con método y fecha. 3 tests, PASS.
- **Suites `tests/Feature/CRM`, `ConversationLeadTest` y `RegistrarContactoTest`:** 50 tests, PASS.
- **Suite completa:** las 14 fallas son las mismas que en `develop` sin este cambio (`CollectionEmailTest` ×11, `WebChatAndUsageTest`, `PrepareMetaReviewTest`, `ProductionEnvironmentTest`). Vienen del `.env.testing` local.
- **Calidad:** Pint PASS (343 archivos) y PHPStan sin errores.

## 5. Pendientes y riesgos

- **Datos viejos:** los leads asignados antes de este cambio (en staging, el lead 4) siguen con `UNASSIGNED` y sin historial. Se corrigen solos en la próxima reasignación. Si hacen falta estadísticas por método de los datos históricos, sería un script de corrección aparte, sin cambiar el baseline.
- **Primera asignación:** cuenta como `MANUAL` cuando el lead no tiene responsable en ese momento, aunque haya tenido uno antes y lo hayan dejado sin asignar.
- **Sin probar en staging ni en el navegador:** el cambio es solo de API. Los títulos de los avisos se ven en la campana una vez desplegado.
