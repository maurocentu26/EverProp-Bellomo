# EVP-198 — Release parcial a main: perfil extendido del cliente (EVP-177 + EVP-180)

Rama `release/evp-198-datos-cliente` (desde `main` @ `6b15285`) · commits `415db65` (EVP-177), `16ac01d` (EVP-180) y el de este informe · fecha 2026-11-24 · Claude (agente) con Mauro Centurión

## 1. Qué pedía el ticket

Llevar a producción la ficha ampliada del cliente que pidió Bellomo (pedido original EVP-160, reunión del 16/11). Incluye la pestaña **"Datos del cliente"** en `/admin/leads/[id]` y un acordeón opcional en alta y edición, con estos bloques:

- Identidad y datos fiscales.
- Domicilios.
- Datos laborales.
- Garante.
- Vivienda actual.

`main` solo acepta PRs desde `release/*`, por eso se crea este ticket de release (mismo criterio que EVP-172).

Fuera de alcance:

- EVP-178 / EVP-181 (fichas de interés).
- EVP-179 (alta solo con teléfono, frontend).
- Módulos de IA y conversaciones, que no van a `main`.

## 2. Qué se implementó

Son dos cherry-picks con `-x` sobre `main`. Los commits conservan su autor original:

- **`415db65` ← `c865772` (EVP-177, backend).**
  - `ContactExtendedProfile` y el bloque `profile` en `AdminLeadController` (`index`/`show`/`store`/`update`).
  - Búsqueda por DNI/CUIT.
  - `LeadAccessPolicy::viewSensitiveProfile`.
  - Ruta `GET /admin/leads/profile-suggestions`.
  - `LeadExtendedProfileTest`.
- **`16ac01d` ← `e6294e7` (EVP-180, frontend).**
  - `LeadExtendedProfileSection`.
  - Pestaña nueva en `LeadDetailView`.
  - Acordeón en `NewLeadForm`.
  - `lead-extended-profile.ts` y sus tests.
  - Informe y evidencia de EVP-180.

**Conflictos resueltos:**

- `everprop-api/routes/api.php`: se conservan las dos rutas, `/commercial-statistics` (de `main`) y `leads/profile-suggestions` (EVP-177).
- `AdminLeadController::store`: en `main`, EVP-176 ya resuelve o crea el contacto antes de este punto. Se conserva `$contactId = $contact['id'];` de `main` y solo se agrega el guardado del perfil. Es lo mismo que quedó en `develop` después de integrar EVP-176.
- `everprop-public/tests/qa-ux-ui-regression.test.mjs`: no existe en `main`, así que se omitió el ajuste que EVP-180 le hacía.
- `LeadExtendedProfileTest`: en `main`, EVP-176 hace obligatorio `phone` en el alta. En `develop`, el test se adaptó en el merge de EVP-176 (`11397a5`), pero el cherry-pick trajo la versión original de EVP-177, y el CI del PR dio 6 fallos por 422 "The phone field is required". Se tomó la versión de `develop`, que solo agrega `phone` a cada alta.
- Hotfix EVP-199 (`web-token/jwt-library` 4.2.8) integrado desde `main` (`060bc25`) para destrabar `composer audit` en el CI.

**Esquema:** no hay scripts forward. `contacts.profile_json` ya existe en el baseline. EVP-178 (`lead_interests`, con forward) no está incluido.

## 3. Por qué esta solución

- EVP-180 solo no alcanza. Sin EVP-177, la API de `main` no valida ni guarda `profile`: la UI diría "guardado" y los datos se perderían sin aviso.
- Cherry-pick en lugar de llevar `develop` entero, porque `develop` trae IA y conversaciones y otros tickets todavía no aprobados para producción.
- Alternativa descartada: integrar primero EVP-180 en `develop` y recién después hacer la release. Se eligió ir directo a `main` por pedido del usuario. El PR de `main` es la revisión humana de estos cambios.

## 4. Cómo se verificó

En la rama de release (árbol `main` + los dos commits):

- `npx tsc --noEmit`: OK.
- `npm run lint`: 0 errores (137 warnings, previos).
- `node --test tests/*.test.mjs`: 124/124.
- `NEXT_PUBLIC_DATA_MODE=api npm run build`: OK, con un `npm ci` limpio de las dependencias de `main`.
- `BASE=main HEAD=release/evp-198-datos-cliente PR_TREE=<árbol> node .github/scripts/check-pr-policy.mjs`: OK, sin rutas ni referencias de IA o conversaciones.
- `php -l` (imagen local `everprop-api-php:local`) de `AdminLeadController.php` y `routes/api.php`: sin errores de sintaxis.
- No hay marcadores de conflicto en el árbol.

**No verificado localmente:**

- Los tests de backend con MySQL sobre `main`, incluido `LeadExtendedProfileTest` con la resolución del conflicto de `store`. Los corre el CI del PR (`api.yml`, `php artisan test` con MySQL y Redis), y su resultado es el que vale.
- El flujo de punta a punta sobre `main`. Sobre `develop` + EVP-180, en cambio, sí se probó contra la API local: alta con perfil, guardar y recargar, quitar filas, vaciar campos, conflicto 409 y autocompletado. Está en el informe de EVP-180.

## 5. Pendientes y riesgos

- **Antes de desplegar a producción**, verificar los accesos de producción: dominios definitivos, CORS, hosts de tenant, Sanctum y cookies (`tenant_domains`). No hay forwards SQL nuevos, pero conviene contrastar `schema_versions` igual. Una prueba local no valida producción.
- **Después del merge a `main`**, mergear `main` en `develop` (regla del repo). Va a haber conflicto con los mismos commits ya presentes en `develop`: elegir la versión de `develop`.
- EVP-180 no pasó todavía por revisión en `develop`. Falta la aprobación de Ramiro o Álvaro con las capturas (`docs/tickets/evidence/EVP-180/`).
- Hallazgo pendiente de EVP-180: al borrar un lead, el perfil del contacto (DNI, CUIT, ingresos, garante) queda en `contacts`. Conviene un ticket de privacidad.
