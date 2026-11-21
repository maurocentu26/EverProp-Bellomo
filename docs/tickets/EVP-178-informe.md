# EVP-178 — lead_interests (1..N sin unidad) y Grupo Familiar / Cotitular

Rama `ticket/EVP-178-lead-interests`, base `develop` (`f0a9796`). Sin commit (pendiente de revisión).

## Qué cambió y por qué

`lead_properties` exige `property_id` y no admite interés por Proyecto + Prototipo + Operación sin unidad. Se agregó `lead_interests` (1..N por lead) sin tocar `lead_properties`, que sigue siendo lo que leen visitas, estadísticas y cobranzas.

- **Forward `2026-11-21.001_lead_interests.sql`** (aditivo e idempotente):
  - `CREATE TABLE IF NOT EXISTS` con FKs compuestas `(tenant_id, …)` a leads, projects y properties, FK a tenants y `UNIQUE(tenant_id, id)`.
  - CHECKs: `interest_level`, `status` y `quote` copiados de `lead_properties`. `operation` y `category` usan las listas vigentes de `properties` después de `2026-09-15.001`: `operation` suma LEASING y UNKNOWN, `category` suma UNKNOWN. La validación del API usa las mismas listas.
  - `participants_json` debe ser un array.
  - Backfill `INSERT … SELECT … WHERE NOT EXISTS`: una ficha por vínculo existente, con operation, category y proyecto de la unidad. Al repetirse no duplica y no revive fichas borradas (el NOT EXISTS incluye soft-deleted).
- **Registro del forward:**
  - `config/database-contract.php`: tables 67, tenant_tables 61, foreign_keys 147.
  - `ProductionCheck` (`Schema: lead interests`): exige las columnas y además la fila `2026-11-21.001` en `schema_versions` (patrón EVP-124), porque la tabla sola no prueba que corrió el backfill.
  - `ProductionEnvironmentTest` cubre el OK y el FAIL sin esa fila.
- **API** (`LeadInterestController` + servicio `LeadInterests`):
  - `POST /api/v1/admin/leads/{lead}/interests` y `PATCH|DELETE /api/v1/admin/leads/{lead}/interests/{interest}`.
  - `GET /api/v1/admin/lead-interest-suggestions`: valores distintos por tenant de `prototype_label`, `how_heard` y `payment_method`, ordenados por frecuencia (hasta 50 de cada uno).
  - `GET /api/v1/admin/leads/{lead}` agrega `interests`.
- **Aislamiento y permisos:**
  - El tenant sale de `TenantContext`; `tenant_id` en el payload está prohibido y da 422.
  - Devuelven 404: lead, interés, proyecto o unidad de otro tenant; un interés de otro lead del mismo tenant; una unidad fuera del alcance de inventario del actor. Una unidad `12A` de otro tenant es otra entidad: también 404.
  - `LeadAccessPolicy::update`: un asesor solo opera sus leads y READ_ONLY recibe 403.
  - `quoted_price` se oculta sin permiso de precios, igual que en `show`.
- **`LeadAccessPolicy::viewSensitiveProfile(User)`:** devuelve false solo para READ_ONLY. Tiene el mismo nombre y la misma semántica que en EVP-177, así que en el merge queda una sola definición. Con false, `document`, `phone` e `income` de los participantes salen en null.
- **Validación:**
  - `operation` es obligatorio si no hay unidad (si la hay, se toma de ella).
  - `quoted_price` y `quoted_currency_code` van juntos.
  - `installments_count` va de 1 a 600.
  - `participants`: hasta 20 filas; `role` es FAMILY, COTITULAR o GUARANTOR; `name` es obligatorio; `document`, `phone` y `relationship` son opcionales; `income` debe ser ≥ 0. Una clave desconocida en una fila da 422.
  - Si la unidad no pertenece al proyecto indicado, también da 422.
- **Sincronización con `lead_properties`** (decisión documentada; `syncUnitLink` bloquea primero el vínculo, o su hueco, y después lee las fichas):
  - Al crear o editar una ficha con `property_id`, se actualiza o crea el vínculo `(lead, unidad)` con interest_level, status y cotización de la ficha viva más reciente. Si el vínculo lo crea una ficha, queda marcado con `metadata_json.source = lead_interest`.
  - Al borrar la ficha (soft delete) o cambiarle el `property_id`, si ninguna ficha viva nombra esa unidad, solo un vínculo creado por fichas pasa a `DISCARDED`, y nunca se borra.
  - Un vínculo creado a mano no se toca y conserva su último status. Eso incluye `attachProperty`, el formulario público y los vínculos previos al backfill. Este comportamiento está fijado en un test.
  - Una ficha que vuelve a la unidad reactiva el vínculo.
  - Una referencia ya existente se conserva aunque la unidad o el proyecto salieran del alcance o estén borrados. Las referencias nuevas exigen recurso vivo y dentro del alcance.
- **Unidades soft-deleted:** `forLead` muestra las fichas aunque su unidad o proyecto se haya borrado, porque son historia comercial. Expone `property_deleted: true` para que la UI no ofrezca esa unidad.

## Decisiones conservadoras / ambigüedades

- El ticket pide copiar `category` y `preferences` de `lead_properties`, pero esa tabla no tiene esas columnas. `category` usa el tipo y el CHECK vigente de `properties.category` (nullable). `preferences` queda como `TEXT NULL` (texto libre de hasta 5000 caracteres).
- Los endpoints viejos `/leads/{lead}/properties` no crean ni modifican fichas. Los vínculos creados por ahí después del forward no aparecen en `interests` hasta que se unifique (ticket aparte).
- Las sugerencias son por tenant, también para asesores, como pide el ticket. Son texto libre que escribe el equipo.

## Deuda y despliegue

- **Deuda:** `TenantContext` se inyecta por constructor en los controladores. En los tests, un segundo request de otro tenant dentro del mismo test resuelve el tenant anterior, por eso el interés ajeno se inserta directo en la base. Corregirlo es un ticket aparte.
- **Despliegue:**
  - Aplicar el forward **antes** de desplegar el código: `show` consulta `lead_interests` y `production-check` falla sin la fila de versión.
  - Hacerlo en una ventana de baja actividad, porque el backfill recorre `lead_properties` (`lock_wait_timeout = 10`).
## Archivos

- `everprop-api/database/schema/forward/2026-11-21.001_lead_interests.sql` (nuevo)
- `everprop-api/app/Domain/CRM/Services/LeadInterests.php` (nuevo)
- `everprop-api/app/Domain/CRM/Http/Controllers/LeadInterestController.php` (nuevo)
- `everprop-api/app/Domain/CRM/Http/Controllers/AdminLeadController.php` (`show` expone `interests`)
- `everprop-api/app/Domain/CRM/LeadAccessPolicy.php` (`viewSensitiveProfile`)
- `everprop-api/routes/api.php`
- `everprop-api/config/database-contract.php`, `everprop-api/app/Console/Commands/ProductionCheck.php`
- `everprop-api/tests/Feature/CRM/LeadInterestsTest.php` (nuevo), `everprop-api/tests/Feature/CRM/ReleaseSchemaTest.php`, `everprop-api/tests/Feature/ProductionEnvironmentTest.php`

## Verificación (Docker local, MySQL 8.4, 2026-11-21)

Contenedores `everprop-w176-mysql` y `everprop-w176-redis`, imagen `everprop-api-php:local` montando el worktree. `bellomo_crm_test` se recreó con baseline y todos los forwards. Los tests corrieron con un usuario de aplicación no root.

- **Forward 2 veces** sobre una base con 3 vínculos en `lead_properties` (SALE/HOUSE, LEASING/UNKNOWN, UNKNOWN/UNKNOWN): quedaron 3 fichas sin duplicados y `lead_properties` intacta. Con los CHECK anteriores, el backfill sobre inventario real habría fallado.
- **ReleaseSchemaTest** (backfill con LEASING/UNKNOWN, ejecutado 2 veces), `SchemaContractVerifierTest`, `ProductionEnvironmentTest` (OK y FAIL sin la fila de versión) y `ForwardScriptsTest`: OK.
- **LeadInterestsTest** (6 tests), todos OK. Cubre:
  - ficha RENT con proyecto y prototipo sin unidad, y ficha SALE con forma de pago, cuotas y participantes;
  - errores de validación 422 y `tenant_id` prohibido;
  - negativos cross-tenant (incluida la unidad `12A` de otro tenant), interés de otro lead del mismo tenant, unidad fuera del alcance de un asesor SCOPED y negativos por rol;
  - READ_ONLY sin datos sensibles de participantes;
  - un vínculo creado a mano que no pasa a DISCARDED.
- **Regresión de `tests/Feature/CRM` y `tests/Feature/Inventory`:** todo OK salvo `StatisticsDemoTest` y `ImportLandingContentTest`, que también fallan en `develop` limpio.
- **pint --test:** PASS. **phpstan:** sin errores.
- **Suite completa con junit**, en las mismas condiciones para la rama y para `develop` limpio (`f0a9796`, worktree temporal y base `bellomo_base_test` recreada, ambos ya borrados):
  - La rama tiene 89 fallas; `develop` limpio, 98.
  - Ninguna falla de la rama es nueva: las 89 están todas en el conjunto de `develop`.
  - Las 9 extra de `develop` (`PrepareMetaReviewTest` ×7, `WhatsAppParallelQueueTest`, `WebhookReceiverMySqlTest`) son de entorno o carrera y no tocan este cambio.
  - La medición de 90 en EVP-177 se hizo en otro entorno y momento. El total varía según el estado del entorno; lo que vale es la comparación prueba a prueba de esta corrida.
- **check-pr-policy** (BASE=develop): OK.

## Pendiente / entorno

- Staging y producción: aplicar el forward `2026-11-21.001` con autorización expresa y verificar con `everprop:schema:verify` y `everprop:production-check --connections`. El contenedor falla el check hasta que el forward esté aplicado.
- Antes de producción hay que verificar `schema_versions`, dominios, CORS/R2, `tenant_domains`/Sanctum/cookies, credenciales, base y storage. Una prueba local no valida producción.
- UI de fichas en `everprop-public` y unificación de los endpoints `/properties` con las fichas: tickets aparte.
- Sin revisión independiente todavía (`tenant-isolation-reviewer` y `schema-migration-guardian`).
