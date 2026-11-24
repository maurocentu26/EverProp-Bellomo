# EVP-180: Panel Ficha del Cliente, UI de Perfil Extendido

Rama `ticket/EVP-180-datos-cliente` (desde `develop` @ `0d24671`) · un commit `EVP-180: …` en la rama · fecha 2026-11-24 · Claude (agente) con Mauro Centurión

## 1. Qué pedía el ticket

El cliente (Bellomo) quiere que la ficha del lead tenga los datos de su formulario comercial en papel: identidad y datos fiscales, domicilios, datos laborales, garante y vivienda actual del solicitante. El pedido original es EVP-160 (reunión del 16/11) y se reformuló en olas. El backend de esta ola (EVP-177, `contacts.profile_json.extended`) ya está en `develop` desde el PR #164.

Criterios de aceptación:
- Pestaña **"Datos del cliente"** en `/admin/leads/[id]`.
- Acordeón colapsable opcional en alta y edición, para no frenar el alta rápida.
- Campos con listas base y autocompletado con valores del tenant.
- Edad calculada en vivo.
- Domicilios y bienes en varias filas, con confirmación antes de borrar una fila que tenga datos.
- `version` (EVP-134) respetada al guardar.
- Tests en `tests/lead-extended-profile.test.mjs`.
- Lint, tsc, build y `check-pr-policy.mjs` en verde.
- Verificación en navegador (desktop, 375×812, claro/oscuro, texto Grande) y aprobación explícita de Ramiro o Álvaro antes de pasar a Listo.

Fuera de alcance:
- Fichas de interés y grupo familiar (EVP-181).
- Alta con solo teléfono (EVP-179).
- Búsqueda por DNI/CUIT en el listado. El backend ya la soporta (`?document=`), pero el ticket no pide UI.

## 2. Qué se implementó

- [`src/lib/lead-extended-profile.ts`](../../everprop-public/src/lib/lead-extended-profile.ts): lógica pura, sin imports en tiempo de ejecución.
  - Tipos del formulario y listas base: condición IVA, estado civil, provincias y situación de vivienda.
  - `mapApiProfile` (línea 47): pasa el perfil de la API (o `null`) al formulario.
  - `computeAge` (línea 71): calcula la edad con la fecha de Argentina (`America/Argentina/Buenos_Aires`), no la UTC.
  - `validateProfile` (línea 85): aplica los mismos límites que `ContactExtendedProfile::rules()`.
  - `cleanProfile` (línea 132): arma el payload. Los campos vacíos van como `null`; un bloque vacío va como `null` (el backend lo borra); las filas vacías se descartan y los números se convierten.
- [`src/components/admin/LeadExtendedProfileSection.tsx`](../../everprop-public/src/components/admin/LeadExtendedProfileSection.tsx): el formulario controlado de los cinco bloques.
  - Autocompletado con `<datalist>` nativo: lista base más los valores previos del tenant de `GET /admin/leads/profile-suggestions`. Si ese pedido falla, quedan las listas base.
  - Pide confirmación con un diálogo antes de quitar una fila con datos.
  - Usa container queries (`@container`): las columnas dependen del ancho del bloque en rem, así que se adaptan a la barra lateral y al texto Grande.
  - Con `showSensitive=false` (READ_ONLY) oculta DNI, CUIT, ingresos y garante, que la API tampoco envía.
- [`LeadDetailView.tsx`](../../everprop-public/src/components/admin/LeadDetailView.tsx):
  - Nueva pestaña `client` (línea 948), con borrador local, "Descartar cambios" y "Guardar datos del cliente".
  - Guardado en `handleSaveClientProfile` (línea 254): manda `PUT` con `profile` y `version` y después recarga el lead, porque la API es la fuente de verdad del perfil combinado.
  - Si hay conflicto 409, conserva el borrador y toma la nueva versión, como el resto de la ficha (EVP-134).
  - READ_ONLY ve la pestaña en solo lectura, porque la API le devuelve 403 al editar.
  - El desplegable móvil de la columna lateral pasa a llamarse "Gestión y contacto", para no repetir el nombre de la pestaña.
- [`NewLeadForm.tsx`](../../everprop-public/src/components/admin/NewLeadForm.tsx):
  - Acordeón `<details>` "Datos del cliente · Opcional" (línea 1117), cerrado por defecto.
  - En el alta, el perfil se manda solo si tiene datos. En la edición, solo si se tocó; si no, no se reenvía.
  - La validación abre el acordeón si encuentra un error.
  - La revisión previa muestra qué pasa con los datos del cliente.
- [`everprop-api.ts`](../../everprop-public/src/lib/everprop-api.ts):
  - `mapLead` conserva `profile` (línea 566).
  - `createEverpropLead` y `updateEverpropLead` aceptan el payload ya armado (línea 670).
  - Nueva función `loadEverpropProfileSuggestions` (línea 693).
  - Sin imports nuevos en tiempo de ejecución: los tests cargan este archivo aislado.
- `admin-sample.ts`: `Lead.profile`.
- Sin cambios de esquema, configuración ni variables.

## 3. Por qué esta solución

- Se reutilizó lo que ya había:
  - El contrato y las reglas del backend de EVP-177 (el frontend replica sus límites).
  - El patrón `datalist` de `ProjectBasicsFields`.
  - `JUJUY_CITIES`.
  - `Dialog` y `Button` de la UI.
  - El manejo de conflicto de versión de EVP-134.
- El formulario guarda todo como texto y `cleanProfile` convierte al final. Así hay un solo punto de conversión, fácil de testear.
- Cada bloque se manda completo, con `null` en los campos vacíos. La API combina los bloques campo por campo, así que vaciar un campo en la UI lo vacía también en la base.
- **Alternativa descartada:** mapear el perfil dentro de `everprop-api.ts`. Los tests de la API cargan ese archivo sin `require` y fallarían. Por eso la conversión vive en el helper y en los componentes.
- **Alternativa descartada:** guardar el perfil en el borrador de `sessionStorage` del alta. No se hizo a propósito, para no dejar DNI, CUIT ni ingresos en el almacenamiento del navegador. Al recargar el alta, el perfil sin guardar se pierde.

## 4. Cómo se verificó

Desde `everprop-public/`:
- `node --test tests/lead-extended-profile.test.mjs`: 6/6. Cubre:
  - Edad con fecha de Argentina a las 22:30, 29 de febrero, fechas inválidas y futuras.
  - Validaciones.
  - Payload con `null` y filas vacías.
  - Agregar y quitar filas.
  - Ida y vuelta API → formulario → API, y respuesta de READ_ONLY.
  - Que `createEverpropLead` y `updateEverpropLead` manden el perfil, y que no lo manden en el alta rápida ni en otras ediciones.
- Suite completa (`node --test tests/*.test.mjs`): 234/238.
  - Las 4 que fallan ya fallaban en `develop` limpio (verificado en un worktree aparte a `0d24671`): "assistant trace…", "EVP-72 cards…" y dos de "Conversations route…". Ninguna toca leads.
  - Se ajustaron 2 tests existentes: `qa-ux-ui-regression` ahora espera la pestaña `client`, y `leads-redesign` inyecta el helper real del perfil.
- `npx tsc --noEmit`: OK.
- `npm run lint`: 0 errores (127 warnings, todos previos).
- `NEXT_PUBLIC_DATA_MODE=api npm run build`: OK.
- `BASE=develop HEAD=ticket/EVP-180-datos-cliente node .github/scripts/check-pr-policy.mjs`: OK.
- Navegador, primera pasada (navegador integrado, `next dev` en **modo mock**), con capturas en [`evidence/EVP-180/`](evidence/EVP-180/):
  - Se cargaron los cinco bloques (2 domicilios y 1 bien), se guardó y se recargó: se conservó todo.
  - Edad "36 años" para el 10/05/1990.
  - Un ingreso negativo bloquea el guardado y muestra el error en el campo.
  - Diálogo de confirmación al quitar un domicilio con datos.
  - Desktop 1440×900, en claro y oscuro.
  - Móvil 375×812, sin scroll horizontal (`scrollWidth` = 375).
  - Texto Grande: pasa a 2 columnas y ningún input queda cortado.
  - Alta con el acordeón: la revisión muestra "Datos del cliente: Se guardan los datos cargados" y el lead queda guardado con su perfil.
- **API real (2026-11-24):** con autorización del usuario, usé el stack local `everprop-bellomo-api` (127.0.0.1:18095), que corre `repo/everprop-api` sobre la base de `develop` con EVP-177. Frontend de esta rama en `next dev -p 3100`, modo API, por el proxy del mismo origen, con la cuenta de prueba `admin@bellomo.com` de `LOCAL-DEVELOPMENT.md`. No toqué contenedores, esquema ni otros datos.
  - **Alta** con el acordeón (DNI, condición IVA, empleador, ingreso): `POST` 200. El `GET` devuelve el perfil con esos datos y `version: 1`.
  - **Pestaña:** se agregaron 2 domicilios, garante, vivienda (Inquilino) con 1 bien y la fecha de nacimiento. `PUT` 200. Al recargar, la UI y la API coinciden campo por campo; la versión del lead pasó de 1 a 2.
  - **Vaciar y quitar:** se quitó el domicilio 2 (con diálogo de confirmación) y se vació el ingreso del garante. En la base quedó 1 domicilio e `income: null`.
  - **Conflicto 409:** otra edición (`PUT notes`, versión 2 → 3) mientras el borrador estaba abierto. El guardado devolvió `409` y mostró el aviso, el borrador quedó intacto, y el segundo guardado reemplazó (versión 4). Las `notes` de la otra edición se conservaron, porque el perfil no las pisa.
  - **Autocompletado:** `GET /admin/leads/profile-suggestions` 200, y sus valores aparecen en los `datalist` junto con las listas base.
  - **Limpieza:** borré el lead de prueba con `DELETE` (200, `GET` posterior 404). Quedaron en la base local una notificación "Lead pendiente de asignación" y el contacto con su perfil (ver punto 5).
  - Captura del 409: [`evidence/EVP-180/11-api-real-conflicto-409.jpg`](evidence/EVP-180/11-api-real-conflicto-409.jpg).
- Revisión `tenant-isolation-reviewer`: no se corrió. El cambio es solo de frontend, sin queries, policies ni cachés; el aislamiento lo garantiza el backend de EVP-177, que tiene tests cross-tenant.

**No verificado:**
- El rol READ_ONLY en navegador: no hay usuario READ_ONLY en los seeds y no creé cuentas. Está cubierto por el test de backend `test_read_only_does_not_see_sensitive_fields_nor_search_by_document` y por el test de mapeo del frontend.
- Staging.
- La aprobación de Ramiro o Álvaro con las capturas, que el ticket exige antes de pasar a Listo.

## 5. Pendientes y riesgos

- **Dependencia EVP-179 sin hacer:** el alta todavía pide nombre y contacto. Este ticket no lo cambia.
- `Fecha de alta` se muestra en solo lectura desde `created_at`: no está en el contrato del perfil.
- Las listas base (condición IVA, estado civil, provincias) son una propuesta. Conviene que Mónica las confirme.
- El autocompletado de barrio solo muestra valores previos del tenant (no hay lista base de barrios).
- Mirar en la revisión:
  - El reemplazo de `sm:`/`xl:` por container queries `@md`/`@2xl`/`@3xl` en el componente nuevo.
  - El cambio de nombre "Datos del cliente" → "Gestión y contacto" en el desplegable móvil de la columna lateral.
- EVP-160 sigue En curso en Jira aunque EVP-177/178/180/181 lo reemplazan. Conviene vincularlo y cerrarlo.
- **Hallazgo de backend, fuera de alcance:** al eliminar un lead, el contacto queda con su `profile_json.extended` (DNI, CUIT, ingresos, garante). `/profile-suggestions` sigue ofreciendo sus valores, porque filtra contactos sin `deleted_at`, no leads. Para privacidad, conviene un ticket que defina si borrar el lead también borra o anonimiza el perfil del contacto (relacionado con EVP-124).
