# EVP-177 — CRM API: perfil extendido del contacto

Rama `ticket/EVP-177-perfil-extendido-contacto` (desde `develop` 918abf4) · sin commit · fecha 2026-11-20 · autor: Claude (agente) para Ramiro Ruggeri

## 1. Qué pedía el ticket
Guardar en el contacto del lead identidad/fiscal, domicilios, datos laborales, garante y vivienda actual del solicitante, reutilizando `contacts.profile_json` con contrato versionado y validación estricta; exponerlo en `GET/POST/PUT /api/v1/admin/leads`, con actualizaciones parciales sin perder sub-bloques, conservando `version`/409 `LEAD_VERSION_CONFLICT` (EVP-134), y sugerencias de autocompletado por tenant. Opcional: búsqueda por DNI/CUIT.
Fuera de alcance: panel (frontend), columna indexada para DNI/CUIT, alta solo con teléfono (EVP-176, aún no en `develop`).

## 2. Qué se implementó
- `everprop-api/app/Domain/CRM/Support/ContactExtendedProfile.php` [nuevo]: contrato v1 bajo `profile_json.extended` (`version`, `personal`, `addresses[]`, `employment`, `guarantor`, `currentHousing{status,notes,assets[]}`).
  - `rules()`: reglas Laravel; cada objeto usa `array:<claves>` → claves desconocidas = 422. `birthDate` `Y-m-d` real, entre 1900 y hoy; `status` ∈ `AGREGADO|LOAN_FOR_USE|TENANT|OWNER`; montos `min:0`; topes de largo y de cantidad (10 domicilios, 20 bienes).
  - `apply()`: merge parcial. Bloque ausente se conserva; objeto se mezcla campo a campo; lista (`addresses`, `assets` dentro de `currentHousing`) se reemplaza entera; bloque `null` se elimina. Las demás claves de `profile_json` (`declared_phone`, `unverified_fields` del runtime IA) no se tocan.
  - `suggestions($tenantId)`: barrios, ciudades, provincias y condiciones fiscales distintas del tenant (filtro `tenant_id`, sin borrados).
- `AdminLeadController.php`: `store` y `update` aceptan `profile` (reglas sumadas, sin tocar las de `name`/`phone` para no chocar con EVP-176) y lo guardan con `saveProfile()` (bloqueo de fila del contacto, dentro de la transacción existente; en `update` después del chequeo de `version`, que sigue subiendo con cada guardado). `show` devuelve `profile` (`null` si nunca se cargó). `index` acepta `?document=` (solo dígitos; compara DNI o CUIT normalizados). Nueva acción `profileSuggestions`.
- `routes/api.php`: `GET /api/v1/admin/leads/profile-suggestions` (antes del `apiResource`), permiso `LeadAccessPolicy::viewAny`.
- Sin cambios de esquema, configuración ni dependencias.

## 3. Por qué esta solución
- Se reutilizó `profile_json` (ya en baseline), `LeadAccessPolicy`, el control de versión EVP-134 y la transacción existente.
- Clave propia `extended` para no colisionar con claves que escribe el runtime IA.
- Búsqueda DNI/CUIT: filtro SQL sobre JSON (`REGEXP_REPLACE(JSON_EXTRACT…)`) dentro del tenant ya filtrado, sin índice (`ponytail:`). Columna generada indexada requiere forward SQL: queda pendiente.
- Sugerencias: recorre en PHP los 2000 perfiles más recientes del tenant (`ponytail:`).
- Respuesta de `store` sin `profile` (el panel lee `show`); si `store` encuentra un lead abierto del mismo contacto (EVP-135) devuelve ese lead y no aplica el perfil enviado.

## 4. Cómo se verificó
Entorno: imagen `everprop-api-php:local` montando el worktree; MySQL 8.4 y Redis temporales (`everprop-w176-*`, base `bellomo_crm_test` recreada con baseline + 28 forwards de `develop`); variables de `.env.example` con `APP_ENV=testing`.
- `tests/Feature/CRM/LeadExtendedProfileTest.php` [nuevo]: round-trip de todos los bloques con 2 domicilios y 2 bienes; parcial conserva sub-bloques y claves ajenas (`declared_phone`); 409 con versión vieja sin escritura; bloque `null`; búsqueda por DNI y CUIT con guiones; 422 por fecha inválida, status fuera de enum, montos negativos, clave desconocida y `tenant_id` en payload (en POST y PATCH); aislamiento (sugerencias sin valores de otro tenant, DNI de otro tenant no aparece, 404 cross-tenant en GET/PATCH) y RBAC (asesor asignado sí, otro asesor 403/404, READ_ONLY no edita, ROTATOR edita según EVP-21); READ_ONLY no recibe DNI, CUIT, ingresos ni garante y `?document=` le da 403; búsqueda por DNI: otro asesor del mismo tenant obtiene [], mismo DNI en tenants A y B solo devuelve el propio; PATCH solo con `profile` y versión vieja → 409 con `profile_json` byte a byte intacto.
- `pint --test`: PASS (365 archivos). `phpstan analyse`: OK, sin errores.
- `php artisan test --filter=LeadExtendedProfileTest`: 6/6 pasan (avisos solo por falta de `.env` en el worktree). `LeadVersionConflictTest` y `ManualLeadContactTest`: pasan.
- `php artisan test tests/Feature/CRM tests/Unit`: 223 pasan, 1 falla (`StatisticsDemoTest`, exige MySQL local por host; depende del entorno, no del cambio).
- Suite completa (junit): 90 fallas en la rama y 90 en `origin/develop` 918abf4 limpio, mismo entorno y contenedores; listas idénticas, ninguna falla solo en la rama. Son de entorno (sin `.env`/secretos de proveedores): `Conversations`, `Integrations/WhatsApp*`, `Evals`, `ImportLandingContent`, `StatisticsDemoTest`.
- `BASE=develop HEAD=ticket/EVP-177-perfil-extendido-contacto PR_TREE=<árbol temporal> node .github/scripts/check-pr-policy.mjs`: OK.
- No se ejecutaron `tenant-isolation-reviewer` ni pruebas en navegador (no hay panel en este ticket).

## 5. Pendientes y riesgos
- Columna generada indexada para DNI/CUIT (forward SQL + `ProductionCheck.php` + `ProductionEnvironmentTest.php`) si el volumen lo pide.
- Panel: formulario del perfil y uso de `profile-suggestions` (otro ticket).
- Datos sensibles: `LeadAccessPolicy::viewSensitiveProfile` (role_code existente, sin RBAC paralelo) los oculta a READ_ONLY en `show` (`documentNumber`, `taxId`, `*.income`, `guarantor`) y le prohíbe `?document=` (403, elegido sobre [] para que el panel distinga "sin permiso" de "sin resultados"). La búsqueda tiene límite de 30 por minuto por usuario (`RateLimiter`, 429). No se loguean.
- El perfil vive en el contacto: lo comparten todos los leads del mismo contacto (editarlo desde un lead lo cambia en los otros).
- Las sugerencias son de todo el tenant, también para asesores y READ_ONLY (barrios, ciudades, provincias, condición fiscal): aceptado por baja sensibilidad.
- Revisión obligatoria por `tenant-isolation-reviewer` pendiente (el hilo principal orquesta).
- Producción/staging: no hay forwards; igual verificar accesos de entorno (dominios, CORS, Sanctum) al desplegar. Integración con EVP-176: ambos tocan `store`; conflicto de merge esperable solo de contexto.
