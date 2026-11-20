# EVP-176 — Alta de lead con solo teléfono y normalización con libphonenumber

Rama: `hotfix/EVP-176-alta-solo-telefono` (base `main`). Sin commit. Sin forwards SQL. Nada del módulo IA.

## Causa
- `AdminLeadController::store` exigía `name`; `phone` era opcional.
- `PhoneNumber::e164` era manual y rechazaba móviles con 0/15 (`0388 15 412-3456`) porque no sabía dónde termina la característica.

## Cambios
- `everprop-api/app/Domain/CRM/Support/PhoneNumber.php`: `e164()` usa `libphonenumber` (región por defecto `AR`, `isValidNumber`); resuelve 0/15 en cualquier característica y `+`/`00` de cualquier país. Número sin código de área → `null` → 422 en el controller (no se adivina). Nuevo `international()` para la etiqueta (`+54 9 388 412-3456`). Único caller: `AdminLeadController::normalizedPhone` (store y update). `PublicLeadService` no lo usa (recibe E.164 validado por regex), así que no cambia.
- `AdminLeadController::store`: `phone` `required|string|max:32`, `name` `nullable|string|max:200`. Sin nombre, `contacts.display_name`, `leads.title`, la respuesta y `LeadAssignedNotification` usan el teléfono formateado internacional; con nombre el título sigue siendo `Interés: <nombre>`. Mensaje 422 de teléfono reescrito pidiendo código de área o de país. `update` ya permitía completar `name` con control de versión EVP-134 (sin cambios).
- Tests: nuevo `tests/Unit/CRM/PhoneNumberTest.php` (11, 351, 387, 388 con 0/15, +1, +591, 00591, sin área → null, etiqueta). `ManualLeadContactTest`: se movió el data provider al unit test; idempotencia ahora con teléfono; nuevos: alta solo con teléfono (filas en contacts, contact_identities, leads y notificación), reintento en otro formato → `duplicate: true`, completar nombre con 409/200 por versión, 422 sin teléfono (aun con name/email) y sin código de área, cross-tenant 404. Se agregó `phone` a los POST de alta que solo mandaban `name` en `CommercialStatisticsTest`, `LeadAssignmentHistoryTest`, `LeadInventoryGuardsTest`, `LeadVersionConflictTest`, `RotatorTest`, `TodayVisitsTest`, `UnassignedLeadNotificationTest`.

## Correcciones de la revisión de aislamiento
- Sin nombre, `contacts.first_name` queda `null` (antes `"+54"`); test lo asegura.
- `store`: se quitó la rama muerta "sin teléfono ni email" (condición previa a `resolve` y el `insertGetId` de contacto sin identidad); el contacto siempre sale de la identidad PHONE. `normalizedPhone` conserva su rama null porque `update` la usa con `phone` nullable.
- Nuevo test cross-tenant: mismo teléfono y mismo Idempotency-Key en otro tenant → 201 sin `duplicate`, otro lead, otro `contact_id` y una fila PHONE por tenant.

## Canonicalización +549 (decisión del usuario)
- `PhoneNumber`: si el resultado es +54 sin 9 y la variante con 9 es válida y de tipo MOBILE, se devuelve +549. `11 5555-0000`, `0054 11 5555 0000` y `+54 9 11 5555-0000` dan `+5491155550000`; `0351 422-1234` → `+5493514221234`. Etiqueta: `+54 9 11 5555-0000`.
- `ponytail:` sin el 15 no se distingue fijo de celular, así que un fijo cuyo rango +549 sea móvil válido también recibe el 9. Mejora: preguntar fijo/celular en el formulario si los fijos importan.
- Tests: unit actualizado + casos +54 sin 9 en Jujuy, Córdoba y Salta (`54 387...` sin +); feature nuevo `'11 5555-0000'` y luego `'+54 9 11 5555-0000'` → `duplicate: true`; asserts cross-tenant y web form pasaron a `+5491155550000`.
- Re-corrida (mismos contenedores, detenidos al final): pint PASS (había 1 issue de espaciado en `ManualLeadContactTest`, corregido con pint), phpstan `[OK] No errors`, `php artisan test`: 203 tests, 0 fallos (50 limpios + 153 con el warning ambiental de `.env`), 1337 aserciones.
- Riesgo: leads ya guardados como `+54XXXXXXXXXX` (sin 9) no matchean con altas nuevas del mismo número (ahora +549); no se migran datos.

## Verificación
Entorno (2026-11-20): imagen `everprop-api-php:local` (PHP 8.4.27) con el worktree montado; `mysql:8.4` y `redis:8` descartables (`everprop-w176-mysql`, `everprop-w176-redis`) con contraseña aleatoria efímera; baseline + todos los forwards importados en `bellomo_crm_test`. Sin `.env` (el guard lo prohíbe): variables de `.env.example` pasadas por `-e`. Docker sin pools de red libres, por eso `--link` en el bridge por defecto. Contenedores detenidos al final (no borrados).
- `composer require giggsey/libphonenumber-for-php`: instaló 9.0.43; el constraint quedó `*` (falló `package:discover` por falta de `.env`) y se fijó a `^9.0` con `composer update --lock`; `composer validate` OK.
- `pint --test`: PASS (207 archivos).
- `phpstan analyse`: `[OK] No errors`.
- `tests/Unit/CRM/PhoneNumberTest.php`: 17/17 OK (confirma `5491155550000` → `+5491155550000` y la etiqueta `+54 9 388 412-3456`).
- `php artisan test` completo (MySQL): **199 tests, 0 fallos** (47 limpios + 152 con warning ambiental `file_get_contents(...)` por la ausencia de `.env` en el worktree; 1328 aserciones). Correcciones hechas en el camino: `RotatorTest` usaba `+5493881234567`, que libphonenumber rechaza (rango 388-1 inválido) → `+5493884123456`; el test cross-tenant nuevo necesitó `refreshApplication()` porque el router reutiliza el controller con el tenant de la primera request. `CollectionsTest` falló solo al montar en `/app` (chequeo `base_path('..')`); montado en `/var/www/html` como en compose, pasa.
- Nota: `UserProvisioningTest` también usa `+5493881234567`, pero no pasa por `PhoneNumber` (pasa).
- `check-pr-policy.mjs`: con `HEAD=hotfix/EVP-176-alta-solo-telefono` FALLA (la regex exige minúsculas: `^(release|hotfix)\/[a-z0-9]...`). Con `hotfix/evp-176-alta-solo-telefono` y el árbol de HEAD: OK.

## Pendiente
1. Riesgo: números guardados antes con formato válido por regex pero fuera de rango real (ej. `+5493881234567`) ahora dan 422 al editarlos con `phone`.
2. Renombrar la rama a minúsculas (`hotfix/evp-176-alta-solo-telefono`) o ajustar la política antes del PR.
3. Panel: el formulario de alta debe dejar de exigir nombre y exigir teléfono (no incluido; es frontend).
4. Smoke en navegador, verificar que Railway instale la dependencia, port a `develop`. Producción: no hay forwards; revisar solo que el build instale vendor nuevo.
