# EVP-L02 — Horario de atención (base)

Rama `ticket/EVP-L02-horario-atencion` · fecha 2026-10-11 · Claude Code con Ramiro Ruggeri
ID local provisorio: la serie EVP-L la revisa el PM al final. Sale de `develop`, no de EVP-L01.

## 1. Qué pedía el ticket

**Objetivo.** Que cada inmobiliaria defina su horario de atención y que el sistema lo respete:
- quien escribe fuera de horario sabe cuándo lo atienden;
- cada asesor decide si recibe avisos en el celular fuera de horario;
- los KPIs distinguen lo que entra dentro y fuera de horario.

**Decisiones de Ramiro (11/10):**
- El chatbot tiene que ayudar todo lo posible fuera de horario hasta poder derivar. Va en un ticket aparte, **EVP-L10**, porque cambia el prompt y necesita revisión de seguridad de IA y evals.
- La preferencia de avisos es de cada asesor.
- Los feriados van en otro ticket.
- El horario se guarda en `settings_json`, con la misma excepción que EVP-L01.

**Cómo lo resuelven otros** (investigado, base del diseño de L02 y L10). Zendesk, Intercom y las guías de atención por WhatsApp coinciden en esto:
- el asistente atiende las 24 horas;
- lo que cambia con el horario es la derivación: en vivo dentro de horario, y fuera de horario junta los datos y avisa cuándo vuelve el equipo;
- los avisos dan la hora real de vuelta, no un "te respondemos pronto";
- la cola de la mañana tiene prioridad.

**Fuera de alcance:** el asistente fuera de horario (EVP-L10), feriados, guardias y calendario externo.

## 2. Qué se implementó

**Servicio de horario** — [BusinessHours.php](../../everprop-api/app/Domain/Conversations/Services/BusinessHours.php)
- Se guarda en `tenants.settings_json.conversations.business_hours`: `{"mon": [["09:00","18:00"]], …}`, hasta dos franjas por día, en la zona horaria de `tenants.timezone`. Tiene además un `away_message` opcional.
- `isOpen`, `nextOpening` y `describe` (por ejemplo, "lunes a viernes de 9:00 a 18:00 y sábado de 9:00 a 13:00").
- `awayMessage`: un texto fijo, nunca generado por el modelo. Usa el del cliente o, si no hay, uno por defecto con el horario y la vuelta ("a partir de hoy / de mañana / del lunes a las 9:00").
- `normalize`: validación estricta. Un horario mal formado se rechaza, no se interpreta.
- **Sin horario = siempre abierto:** un cliente que no lo configura se comporta igual que antes.
- Si la zona horaria del cliente está mal escrita, usa la zona por defecto en lugar de fallar.

**Aviso de ausencia** — [InboundMessageService.php](../../everprop-api/app/Domain/Conversations/Services/InboundMessageService.php) y [ConversationControl.php](../../everprop-api/app/Domain/Conversations/Services/ConversationControl.php)
- **Cuándo sale:** con el primer mensaje sin leer de una espera en "Espera asesor", la misma condición que ya disparaba el aviso al asesor, y solo si el cliente está fuera de horario.
- **Cómo:** `queueAwayNotice` toma el lock de la conversación, vuelve a comprobar que siga en `WAITING_HUMAN` y lo encola con la marca de aviso que el dispatcher ya deja pasar, con el epoch actual. La clave es `away:<id del mensaje>`.
- **Límites:**
  - como mucho uno cada 12 h por conversación: leer el chat reinicia el aviso al asesor, pero no la espera del cliente;
  - si un asesor toma el control, el aviso pendiente se cancela;
  - un error al enviarlo nunca convierte en 500 un mensaje ya guardado.

**API del horario** — [AdminBusinessHoursController.php](../../everprop-api/app/Domain/Conversations/Http/Controllers/AdminBusinessHoursController.php)
- `GET` y `PUT /api/v1/admin/business-hours`, con el permiso `manageIntegrations`.
- Devuelve 422 `INVALID_SCHEDULE` si el horario no es válido, y 404 entre clientes.
- Auditoría `CONVERSATIONS_BUSINESS_HOURS_UPDATED` con antes y después, solo si hubo cambio.

**Avisos push por dispositivo**
- Forward [2026-10-11.001_web_push_out_of_hours.sql](../../everprop-api/database/schema/forward/2026-10-11.001_web_push_out_of_hours.sql): columna `web_push_subscriptions.out_of_hours`, por defecto 1 (sigue recibiendo, como hoy).
- [WebPushController.php](../../everprop-api/app/Domain/Identity/Http/Controllers/WebPushController.php): `PUT /api/v1/admin/push/subscriptions/preferences`, que solo puede usar el dueño del dispositivo. `config` devuelve la preferencia de cada dispositivo y si el cliente tiene horario.
- [SendWebPush.php](../../everprop-api/app/Jobs/SendWebPush.php): fuera de horario solo envía a los dispositivos que eligieron recibir. La campana del panel conserva el aviso igual.

**KPIs** — [ConversationKpis.php](../../everprop-api/app/Console/Commands/ConversationKpis.php)
- Bloque `by_business_hours`, separado en `in_hours` y `out_of_hours` según cuándo llegó el primer mensaje del cliente.
- Usa el horario vigente hoy.

**Panel**
- [BusinessHoursSettings.tsx](../../everprop-public/src/components/admin/BusinessHoursSettings.tsx), en Configuración, solo para administradores: días, franjas, aviso opcional (con el texto por defecto como ejemplo), resumen y si ahora está abierto o cerrado.
- [OutOfHoursAlerts.tsx](../../everprop-public/src/components/admin/OutOfHoursAlerts.tsx): la opción "Avisos fuera del horario de atención" dentro de "Avisos con el panel cerrado", para el dispositivo actual.

**Tests y documentación**
- [BusinessHoursTest.php](../../everprop-api/tests/Feature/Conversations/BusinessHoursTest.php): 12 tests.
- `ConversationKpisTest`: bloque nuevo.
- `ReleaseSchemaTest`: aplica dos veces el forward nuevo.
- ADR 0005: la excepción.

## 3. Por qué esta solución

- **Reutiliza:**
  - el aviso al asesor "uno por espera" para decidir cuándo avisar al cliente;
  - la marca de aviso del dispatcher, el epoch y la cancelación por toma de control para el aviso;
  - `manageIntegrations` y `audit_logs`;
  - la tabla de suscripciones para la preferencia del asesor.
- **La preferencia es por dispositivo**, no por usuario: la tabla `users` no tiene preferencias, y el asesor puede querer avisos en la compu y no en el celular. Además es una columna nueva con valor por defecto, sin tocar `users`.
- **Texto fijo y no generado:** sin modelo encendido no hay otra opción, y aun con IA es la práctica de la industria para mensajes de sistema que prometen algo (Zendesk varía por horario los mensajes de sistema, no los generados).
- **Sin horario = abierto:** no cambia nada para quien no lo configura.
- **Descartado:**
  - silenciar los push para todos (Ramiro eligió que lo decida cada asesor);
  - una tabla de preferencias de usuario (más esquema para un solo booleano);
  - `tenant_config_versions` (Ramiro eligió la excepción).

## 4. Cómo se verificó

Entorno: stack Docker aislado `everprop-lote3` (PHP 8.4.24, MySQL 8.4, base `bellomo_crm_test` con datos sintéticos), 2026-10-11.

| Comprobación | Resultado |
|---|---|
| Forward `2026-10-11.001` aplicado dos veces | La segunda corrida no hace nada; columna `tinyint(1) NOT NULL DEFAULT 1`; versión registrada |
| `BusinessHoursTest` | 12 tests, 74 assertions, OK |
| `BusinessHoursTest`, `ConversationKpisTest`, `ReleaseSchemaTest`, `WebPushTest` | 19 tests, 125 assertions, OK |
| Suite backend completa | 342 tests, 0 fallos. Las "warnings" son el aviso conocido del runner sin `.env` |
| Pint (285 archivos) y PHPStan | OK, sin errores |
| Panel: `tsc`, `npm run lint`, 73 tests `node --test`, `npm run build` | OK. Lint: 0 errores, las 153 advertencias que ya existían |
| Revisión `schema-migration-guardian` | Sin bloqueantes. Aplicado: el forward entra en `ReleaseSchemaTest`. Pendientes operativos abajo |
| Revisión `tenant-isolation-reviewer` | Sin bloqueantes ni fugas. Aplicado: zona horaria inválida, tope de 12 h para el aviso, 5 tests negativos (toma de control, asesor en control, sin 500, permisos del GET, preferencias entre clientes) y comentarios |

No lleva revisión de seguridad de IA: no toca el prompt, el modelo ni las herramientas.

**No verificado:**
- Las tarjetas del panel en el navegador (solo typecheck, lint y build).
- Push real en un celular.
- Staging.

## 5. Pendientes y riesgos

- **Orden de despliegue obligatorio:** aplicar `2026-10-11.001` **antes** de desplegar el código. Sin la columna, `push/config` da 500 y `SendWebPush` falla fuera de horario. La versión anterior de la app tolera la columna nueva.
- **Al aplicar el script en staging o producción:** correr antes `SET SESSION lock_wait_timeout = 5;`, porque el `ALTER` instantáneo igual toma un lock breve. Preflight: `ROW_FORMAT` = Dynamic y `TOTAL_ROW_VERSIONS` < 64.
- **EVP-L10:** el primer aviso cuando la IA deriva fuera de horario dentro de un turno es parte de "el asistente fuera de horario".
- **Feriados:** otro ticket.
- **KPIs:** se clasifican con el horario vigente; si se edita, cambia la clasificación de semanas pasadas.
- **Hallazgos aparte**, para otros tickets:
  - los dos forwards `2026-10-07.001` (ver EVP-L01);
  - `web_push_subscriptions` arrastra `TIMESTAMP` y claves foráneas simples desde `2026-09-14.002`.
- **Integración con EVP-L01:** las dos ramas tocan `InboundMessageService`, `ConversationControl` y `routes/api.php`, en zonas distintas. Al mergear la segunda va a haber conflictos chicos.
