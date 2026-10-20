# EVP-50 — Alertas de seguimiento de leads y reenganche de asesores

Rama `ticket/EVP-50-alertas-seguimiento-leads` desde `develop` (`dd3a166`) · 2026-10-20 · Claude con Ramiro.

## 1. Pedido

**Mauro:**
- Alertar cuando un asesor no responde a un lead.
- Avisar antes de que venza el plazo de seguimiento de 10 días.
- Integrar las alertas con la campana y la bandeja.

**Ramiro:**
- Alertar mucho antes, desde el día 2 sin seguimiento.
- Avisar también al gerente.
- Mandar los avisos solo por push.
- Mandar mensajes de reenganche cálidos, al estilo «Do not quit», cuando el asesor pasa 1 a 3 días sin entrar, con pocos emojis.
- Pulir los permisos de notificaciones y revisar la PWA de punta a punta.

## 2. Qué se implementó

**Base de datos.** Forward `2026-10-20.001_lead_follow_up_alerts.sql`:
- `users.last_active_at` y `users.last_nudged_at`, con `ALGORITHM=INSTANT`.
- Tabla `lead_follow_up_alerts`, con unique `(tenant_id, lead_id, user_id, level, touch_at)` y FKs compuestas.
- El contrato pasa a 62 tablas, 56 tablas de tenant y 134 FKs.

**Comando `everprop:leads:follow-up-alerts`.** Corre cada hora, con `withoutOverlapping()->onOneServer()`.

| Días sin contacto | Asesor | Gerente |
|---|---|---|
| 2 | «Un lead espera tu contacto» | — |
| 5 | «Este lead se está enfriando» | — |
| 8 | «Quedan 2 días de seguimiento» | Resumen del equipo |
| 10 | «Venció el seguimiento» | Resumen del equipo |

Cómo se cuentan los días y se mandan los avisos:
- Se cuenta desde el último contacto comercial registrado; las notas no cuentan. Si no hay ninguno, desde la creación del lead. Es el mismo reloj que usa el panel (`lead-follow-up.ts`), así que un cliente que vuelve a escribir no reinicia el ciclo.
- Cada lead recibe solo su nivel más alto pendiente, una única vez por ciclo. Un contacto nuevo abre un ciclo nuevo.
- Los leads cerrados, sin asignar o con más de 11 días quedan afuera, para no inundar de avisos al desplegar.
- Si un asesor junta más de 3 alertas en una corrida, recibe un solo resumen.

**Reenganche.**
- Lo reciben los asesores con leads abiertos que pasaron 1, 2 o 3 días sin usar el panel.
- Se manda un mensaje por día, entre las 10 y las 19 del horario del tenant.
- Cada aviso se reclama con un UPDATE atómico, así dos corridas simultáneas no lo mandan dos veces.

**Actividad.** El middleware `TouchLastActive` en las rutas autenticadas escribe `last_active_at` como mucho una vez por hora.

**Push.**
- `SendWebPush` usa el `push_body` de la notificación. Ese texto nunca incluye el nombre del cliente.
- El link de destino solo puede ser una ruta `/admin/` del propio sitio.
- Se respeta el horario de atención y la preferencia de cada dispositivo (EVP-L02).

**Panel:**
- Nuevo estado «Necesita contacto» (días 2 a 4) y «Enfriándose» (días 5 a 7), con color celeste.
- Filtro «Necesitan seguimiento»; el link de las notificaciones (`/admin/leads?seguimiento=1`) lo abre ya seleccionado.

**PWA y permisos:**
- La invitación a activar avisos explica para qué sirven.
- «Ahora no» espera 3 días antes de volver a preguntar.
- Si el permiso está bloqueado, la invitación no aparece (la persona ya dijo que no). Configuración muestra los pasos para reactivarlo según el dispositivo: iPhone, Android o escritorio.
- El service worker pone una marca en el ícono de la app instalada y la borra al abrir la notificación o el panel.
- Los mensajes de reenganche se cierran solos y no exigen interacción.
- El manifest suma el acceso directo «Leads para seguir».

## 3. Por qué esta solución

Reutiliza lo que ya existía, sin dependencias nuevas:
- las notificaciones de Laravel en base de datos;
- el listener que encola `SendWebPush`;
- la limpieza de suscripciones vencidas;
- el horario de atención;
- el cálculo de seguimiento que ya usaba el panel.

La deduplicación queda en la base, con una clave única y un UPDATE condicional, y no en memoria. Eso hace seguro correr el comando en varias réplicas.

## 4. Cómo se verificó

- **Tests de PHP:** `tests/Feature/CRM/FollowUpAlertsTest.php` cubre:
  - los niveles;
  - que no haya duplicados;
  - que un cliente que escribe no reinicie el ciclo, pero un contacto registrado sí;
  - que una nota no cuente como contacto;
  - el resumen al pasar de 3 alertas y el resumen del gerente;
  - el aislamiento entre tenants;
  - el reenganche diario solo en horario diurno;
  - `last_active_at`;
  - el payload del push sin datos del cliente ni links externos.

  **Pendiente:** correrlos en el CI. Docker no arranca en esta PC y el PHP del host es 8.2.
- **Pint y `php -l`:** pasan en los archivos tocados.
- **Front:**
  - `node --test tests/lead-follow-up-alerts.test.mjs`: 1/1.
  - ESLint sin errores en los archivos tocados.
  - `tsc --noEmit` y `next build`: pasan.
- **Navegador (build mock):** `/admin/leads?seguimiento=1` abre con el filtro «Necesitan seguimiento». Con el permiso bloqueado, la invitación no aparece. En el CI de #59 tapaba «Tomar control» y rompía el E2E del navegador; corregido.

- **Revisión `tenant-isolation-reviewer`:** sin bloqueantes ni altos, y sin fuga entre tenants.
  - **Corregido:** el join con `lead_follow_ups` ahora filtra por tenant en los dos lados. Se agregó un test con un seguimiento de otro tenant apuntando al mismo id de lead.
  - **Aceptado:** el resumen llega a todos los `SALES_MANAGER` del tenant. Es el mismo alcance que ya les da el listado de leads.
  - **Documentado en el código:** si `notify()` falla, el aviso ya reclamado se pierde. Se prefiere eso a mandarlo dos veces.

## 5. Pendientes y riesgos

- Probar el push real en Android, en un iPhone con la app instalada y en escritorio, sobre staging con VAPID configurado.
- El reenganche del día 1 empieza a contar desde el deploy, porque `last_active_at` nace vacío y se usa `last_login_at` como respaldo.
- La parte de «mensajes entrantes sin responder» que pide el ticket ya la cubre el aviso `CONVERSATION_NEEDS_ATTENTION` del módulo de conversaciones. Ese módulo vive solo en `develop`.
