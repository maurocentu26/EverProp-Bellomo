# EVP-134 — Leads: control de versión al editar

Rama `ticket/EVP-134-version-lead` (desde `develop` @ `c2fa989`) · fecha 2026-11-14 · autor Claude y Mauro Centurión · sin commit todavía

## 1. Qué pedía el ticket

Hallazgo P2-4 de la auditoría `QA_STAGING_BELLOMO.md` (GES-H). Un asesor guardó las notas «Version A del asesor». Después, un admin que tenía la ficha abierta desde antes guardó «Version B del admin». Los dos recibieron 200 y el cambio del asesor se perdió sin aviso. La columna `leads.version` ya existía, pero nadie la usaba.

## 2. Qué se implementó

**API** (`AdminLeadController`):

- `index` y `show` devuelven `version`.
- `PUT/PATCH /admin/leads/{id}`:
  - acepta `version`;
  - si no coincide con la del lead, responde **409 `LEAD_VERSION_CONFLICT`** con la versión actual y no guarda nada;
  - cada edición exitosa hace `version + 1` y la devuelve en la respuesta (`{status, version}`).
- La comparación se hace con el lead bloqueado (`lockForUpdate`), que ya estaba: dos guardados simultáneos con la misma versión no pueden pasar los dos.

**Panel** (`everprop-public`):

- **API del panel** (`src/lib/everprop-api.ts`):
  - `Lead.version` y `ApiLead.version`; `mapLead` lo mapea;
  - `updateEverpropLead` acepta `version` y devuelve la nueva;
  - funciones nuevas: `isLeadVersionConflict()` y un mensaje común.
- **Ficha del lead** (`LeadDetailView`):
  - el editor «Editar ficha del cliente» manda la versión con la que se cargó;
  - después de cada guardado (ficha, etapa, asesor), la ficha se queda con la versión nueva, para no generar un conflicto consigo misma;
  - **ante un 409:** carga los cambios de la otra persona en la ficha, deja el editor abierto con el texto del usuario intacto y avisa: «Otra persona modificó este lead… revisalo y guardá de nuevo». El editor no se vuelve a montar porque su `key` (`lastActivity`) se conserva.
- **Página de edición** (`NewLeadForm`, `/admin/leads/{id}/edit`):
  - manda la versión del lead cargado;
  - **ante un 409:** guarda la versión nueva en una ref, sin tocar `activeLead`, porque ese efecto reescribiría el formulario. Avisa que los cambios siguen ahí y que guardar de nuevo reemplaza los de la otra persona.

## 3. Por qué esta solución

- **`version` es opcional en la API:** si la API se despliega antes que el panel, el panel viejo no manda versión y debe seguir funcionando. Los editores del panel nuevo siempre la mandan.
- **Las acciones de un solo campo no mandan versión:** mover la tarjeta de etapa en el kanban o en el cockpit, o reasignar desde la cola del rotador, no pisan un borrador (el usuario elige ese valor). Igual incrementan la versión, así que un editor abierto en otro lado se entera.
- **Guardar de nuevo después del aviso es una decisión del usuario:** ya vio los cambios del otro (en la ficha) o fue avisado (en la página de edición). No se intenta combinar campo por campo.

## 4. Cómo se verificó

**API**, en el contenedor `everprop-api-php` (PHP 8.4, MySQL 8.4; Laravel 13.40), con una copia aislada en `/tmp/evp134`:

- `tests/Feature/CRM/LeadVersionConflictTest.php` (nuevo): **1 test, 15 assertions, PASS**.
  - `show` e `index` devuelven la misma versión.
  - El asesor guarda «Version A» con la versión cargada (200, versión + 1).
  - El admin guarda «Version B» con la misma versión: **409 `LEAD_VERSION_CONFLICT`** con la versión actual. Las notas siguen siendo «Version A».
  - Con la versión nueva, el admin guarda a propósito (200).
  - Un guardado sin versión sigue funcionando e incrementa la versión; `version = 0` da 422.
- **Suite `tests/Feature/CRM`:** 39 tests, PASS.
- **Suite completa:** las 14 fallas son las mismas que en `develop` sin este cambio (`CollectionEmailTest` ×11, `WebChatAndUsageTest`, `PrepareMetaReviewTest`, `ProductionEnvironmentTest`). Vienen del `.env.testing` local.
- **Calidad:** Pint PASS (343 archivos) y PHPStan sin errores.

**Panel**:

- `node --test tests/leads-api.test.mjs`: 4/4. El test nuevo cubre:
  - la versión que llega de `show`;
  - la versión que se manda en la edición y la nueva que vuelve;
  - que las acciones de un solo campo no mandan versión;
  - que un 409 se reconoce como conflicto.
- `tsc --noEmit`: OK.
- ESLint en los archivos tocados: 0 errores. Los 24 warnings de `any` ya estaban.

## 5. Pendientes y riesgos

- **Sin probar en el navegador:** el modo mock no pasa por la API, así que el aviso de conflicto se ve recién con la API real (staging).
- **Otras escrituras del lead no incrementan la versión:** seguimientos, propiedades vinculadas, procedimiento de alta y asignación desde conversaciones no cambian los campos del editor. Si alguna empieza a cambiarlos, tiene que incrementar `version`.
- **El conflicto no muestra qué campo cambió:** en la ficha, los datos nuevos se ven detrás del editor; en la página de edición solo se avisa.
