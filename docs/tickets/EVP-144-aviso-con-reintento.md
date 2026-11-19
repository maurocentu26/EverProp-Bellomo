# EVP-144: el aviso de conversación que necesita a una persona no se pierde ante una falla transitoria

Rama `ticket/EVP-144-aviso-con-reintento`, creada desde `develop` @ `57af421` · 2026-11-16 · Ramiro Ruggeri con Claude

## Problema

Hallazgo NOT-09 de la auditoría QA de staging del 2026-11-12.

`ConversationNeedsAttention::sendFor` mandaba el aviso después del commit, dentro de un `try/catch` que solo hacía `report()`. Si fallaba la resolución de destinatarios o la inserción en `notifications`, el aviso se perdía y solo quedaba el log. Una falla transitoria alcanzaba: un deadlock o una conexión caída.

Además, `Notifier::send` corta en el primer error: si fallaba un destinatario, tampoco recibían el aviso los que venían después.

## Cambios

### Envío en tres niveles

- **1. Tres intentos inmediatos.** `retry([100, 400])`, hasta unos 0,5 s extra, solo cuando hay falla. Cubre los casos de milisegundos.
- **2. Job en cola.** Si los tres intentos fallan, se reporta el error y se encola `SendConversationAlert`:
  - 5 intentos, con espera de 10, 30, 60 y 120 s;
  - va en el carril `outbound`, que es rápido;
  - si agota los intentos, `failed()` deja un `warning` solo con ids.

  Cubre una caída más larga de la base.
- **3. Último recurso.** Si también falla encolar, queda el log, como hasta ahora.

### Sin duplicados

- **Clave por aviso:** cada aviso tiene una clave propia y cada notificación un id derivado de (clave, usuario).
- **Reintentos:** si llegan a alguien que ya lo recibió, chocan con la clave primaria y se saltean. Esto vale para los intentos inmediatos, para el job y para una corrida duplicada del job.
- **Un envío por destinatario:** si uno falla, se sigue con los demás. Al final se lanza un error para reintentar solo a los que faltan; los que ya lo recibieron se saltean.
- **Web push:** el envío sigue pasando por `notify()`, así que el listener que manda el push sigue funcionando sin cambios.

### El aviso tardío no llega a quien ya no corresponde

`deliver()` vuelve a leer la conversación en cada intento:
- **Si cambió el control** (otro `control_epoch`: alguien la tomó, se cerró o se reabrió), el aviso quedó viejo y se descarta. Es la misma regla de D11.
- **Si se reasignó** (mismo epoch), el aviso va al asignado actual. El anterior no recibe el nombre ni el teléfono del cliente en su pantalla bloqueada.
- **Si la conversación ya no existe,** se descarta.

### Sin datos del cliente en la cola ni en los logs

- **Payload del job:** lleva solo ids y el código del motivo (por ejemplo `USER_REQUEST:`). El texto libre del motivo, que puede ser un resumen del modelo con el nombre o el teléfono del cliente, no se guarda en la cola ni en `failed_jobs`. El texto del aviso se arma solo a partir del código, así que no cambia.
- **Excepción que se reporta y se guarda:** no incluye el SQL ni la excepción original, porque sus valores contienen el título del aviso. Solo lleva la conversación, la cantidad de destinatarios que fallaron y el SQLSTATE.

### Sin cambios

- El mensaje del cliente ya está guardado antes del commit, así que nunca se revierte.
- Los destinatarios y los textos siguen iguales.

## Verificación

Stack aislado `everprop-rag` (PHP 8.4, MySQL 8.4), contenedor `everprop-rag-php144`. Test nuevo `tests/Feature/Conversations/ConversationAlertRetryTest.php`. Usa conversaciones reales del chat web y simula la falla con un evento `creating` que lanza error las veces indicadas.

- **Falla transitoria:** la primera inserción falla, el intento siguiente la entrega y cada asesor recibe exactamente 1 aviso. No se encola nada. Antes del cambio, nadie recibía el aviso.
- **El primer destinatario falla siempre:**
  - el segundo recibe el aviso igual;
  - el job encolado no lleva el teléfono que figura en el motivo, solo `USER_REQUEST:`;
  - al correr el job, el primero recibe el suyo con el texto de USER_REQUEST;
  - si se corre dos veces, nadie recibe un duplicado.
- **Reasignación y cambio de control:**
  - la conversación de X se reasigna a Y antes del job: X recibe 0 avisos, Y recibe 1 y los supervisores 0;
  - con otro epoch, el aviso viejo no le llega a nadie.
- **Otro tenant:** un usuario de otro tenant indicado como dueño no recibe nada; el aviso va a los asesores del tenant.
- **Sin regresiones:** `ConversationAlertsTest` (16 tests) y `HandoffAndDispatchTest` siguen pasando.
- **Calidad:** Pint PASS y PHPStan sin errores.
- **Suite completa:** **607 passed, 1 skipped** (5708 assertions).

## Revisión `tenant-isolation-reviewer`

No encontró fugas entre tenants.

| Hallazgo | Severidad | Resolución |
|---|---|---|
| El job tardío usaba al dueño tal como estaba al momento del evento. Podía avisarle con los datos del cliente a un asesor que ya no tenía la conversación. | Alta | `deliver()` vuelve a leer la conversación, descarta el aviso si cambió el epoch y usa el asignado actual. Test de reasignación y de cambio de epoch. |
| El payload de la cola guardaba el resumen libre del modelo, que puede traer datos personales. | Media | Solo se guarda el código del motivo. Test. |
| Si el primer destinatario fallaba siempre, el resto quedaba sin aviso. | Media | Envío por destinatario. Test con la falla en el primero. |
| La excepción guardada en `failed_jobs` y en los logs podía llevar el SQL con el título del aviso. | Media | Mensaje sin SQL ni excepción previa. |
| Si se pierde la respuesta de un insert que sí se hizo, el reintento lo da por entregado y no manda el push. | Baja | Aceptado: la campana muestra el aviso. Reenviar el push en ese caso mandaría pushes duplicados en el caso normal. |
| `retry` reintenta cualquier error, también los de programación. | Baja | Aceptado: terminan en `failed_jobs` con un mensaje claro. El bloqueo máximo es de unos 0,5 s y solo ocurre cuando hay falla. |
| El job no tenía `failed()`. | Baja | Agregado, solo con ids. |

## Pendientes

- Sin forwards SQL ni variables nuevas. El job usa el carril `outbound`, que ya existe (EVP-131).
- Va con el módulo de conversaciones.
