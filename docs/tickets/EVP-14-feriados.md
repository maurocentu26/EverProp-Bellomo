# EVP-14 — Feriados en el horario de atención

Rama `ticket/EVP-14-feriados` (desde `develop`) · fecha 2026-10-13 · Claude Code con Ramiro Ruggeri
Ticket Jira [EVP-14](https://eversys.atlassian.net/browse/EVP-14).

## 1. Qué pedía el ticket

Que el administrador cargue los feriados del equipo y que el horario de atención los respete en todo lo que ya usa el horario: el aviso fuera de horario, los avisos push, los KPIs y el asistente fuera de horario (EVP-5).

**Alcance** (decisión de Ramiro, 2026-10-13): solo feriados. Las "guardias" quedan para otro ticket, cuando se defina si son un horario especial por fecha o un asesor de guardia.

**Criterios:**
- lista de fechas por tenant, validada;
- un feriado cuenta como fuera de horario;
- la próxima apertura saltea los feriados;
- tests, incluido el caso de otro tenant.

## 2. Qué se implementó

**Servicio** ([BusinessHours.php](../../everprop-api/app/Domain/Conversations/Services/BusinessHours.php))
- Los feriados se guardan en `settings_json.conversations.holidays`: fechas `AAAA-MM-DD`, en la zona horaria del tenant, hasta 60.
- `normalizeHolidays` valida la lista: debe ser una lista, con strings de fechas reales. Ordena y saca duplicados, y rechaza cualquier valor mal formado.
- `isOpen`: un feriado está cerrado todo el día.
- `nextOpening` saltea los feriados. El límite del recorrido es una semana más un día por feriado (68 como máximo).
- `backPhrase`: si la vuelta del equipo cae a más de una semana, que solo pasa con feriados, agrega la fecha ("a partir del martes 20/10 a las 9:00").
- **Sin horario sigue siendo "siempre abierto":** los feriados solo aplican si hay horario cargado.
- **Un valor guardado mal formado se ignora** (se trata como sin feriados) y no rompe ni avisos ni push.

**Endpoint** ([AdminBusinessHoursController.php](../../everprop-api/app/Domain/Conversations/Http/Controllers/AdminBusinessHoursController.php))
- `PUT /admin/business-hours` acepta `holidays` como campo opcional. Si es inválido, responde 422 `INVALID_HOLIDAYS`.
- **Si no se envía el campo, se conservan los feriados guardados:** un cliente viejo no los borra. Una lista vacía los borra.
- Mismos permisos (`MANAGE_INTEGRATIONS`), mismo bloqueo y misma auditoría (`CONVERSATIONS_BUSINESS_HOURS_UPDATED`, con los feriados en el antes y el después).
- `GET` devuelve `holidays`.

**Panel** ([BusinessHoursSettings.tsx](../../everprop-public/src/components/admin/BusinessHoursSettings.tsx))
- Sección "Feriados" con selector de fecha, lista con la fecha escrita completa y botón para quitar cada una.
- Se guarda con "Guardar horario".

**Lo que hereda el cambio sin tocarlo:** el aviso fuera de horario, el filtro de avisos push, los KPIs por horario y el prompt del asistente fuera de horario, porque todos usan `isOpen`, `nextOpening` y `backPhrase`.

**ADR 0005:** se documentó la clave nueva.

## 3. Por qué esta solución

- **Reutiliza la excepción de ADR 0005** (`settings_json`), igual que el horario y los interruptores de IA. No hace falta esquema nuevo.
- **Se modificó un solo servicio**, así que todos los lugares que lo usan quedan consistentes.
- **Las fechas tienen formato estricto** y el texto para el cliente lo arma el servidor, así que no hay texto libre del administrador que llegue al prompt.

## 4. Cómo se verificó

Entorno: stack Docker aislado `everprop-lote3` (PHP 8.4, MySQL 8.4, base sintética), 2026-10-13.

| Comprobación | Resultado |
|---|---|
| `BusinessHoursTest` (3 tests nuevos) y `OutOfHoursAssistantTest` | 22 tests OK |
| Tests nuevos | Un feriado cierra un día hábil y la próxima apertura lo saltea. El visitante que escribe un feriado recibe el aviso con la vuelta real. Un cierre largo nombra la fecha. Feriados sin horario no cambian nada. Se rechazan fechas inválidas, formatos raros, listas con claves y más de 60 fechas. Hay auditoría. No enviar el campo conserva los feriados. Otro tenant responde 404 y queda intacto |
| Suite backend completa | 376 tests, 0 fallos |
| Pint y PHPStan | OK |
| Panel: eslint del componente y `npm run build` | OK |
| Revisión `tenant-isolation-reviewer` | Sin hallazgos bloqueantes, altos ni medios |

**No verificado:** la pantalla en el navegador. El build compila, pero no se probó la interacción en el panel.

## 5. Pendientes y riesgos

- **Guardias:** van en otro ticket, cuando se definan.
- **Sugerencias de la revisión que no se aplicaron:**
  - `max:60` en la validación: devolvería el error genérico de Laravel en lugar de `INVALID_HOLIDAYS`, y el límite global de tamaño de request ya acota el caso.
  - Avisar en el panel que los feriados no tienen efecto sin horario: hoy el texto de la tarjeta dice "sin horario, se considera abierto siempre".
