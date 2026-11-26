# EVP-210: copiar el catálogo de Bellomo de staging a la base local

Fecha: 2026-11-26. Rama: `ticket/EVP-210-catalogo-local`, desde `develop` (40a5f48).

## 1. Problema

La base local de desarrollo (`bellomo_crm`) tenía el tenant `bellomo` con 0 proyectos y 0 propiedades. En staging ya está el catálogo real. Probar el asistente en local no encontraba ninguna unidad, y EVP-206 no se podía contrastar con datos reales.

## 2. Qué se hizo

- **Script nuevo** [`everprop-api/scripts/copy-staging-catalog.ps1`](../../everprop-api/scripts/copy-staging-catalog.ps1). Sin cambios de esquema ni de código de la app.
  1. **Lectura de staging, solo lectura.**
     - Resuelve los ids de Railway con `railway list --json`.
     - Ejecuta con `railway ssh` dentro del servicio `mysql84` un `mysqldump --no-create-info --where="tenant_id=<id>" --single-transaction` de las tablas del catálogo.
     - Lo trae comprimido y en base64, así llega sin alterarse.
     - La contraseña de MySQL nunca sale del contenedor de staging: se usa su propia variable de entorno.
     - Staging no expone la base a Internet y no se abrió ningún proxy.
  2. **Validación:** el volcado solo puede tener `INSERT INTO` de las tablas permitidas; cualquier otra sentencia aborta antes de tocar la base.
  3. **Importación local.**
     - Carga el volcado en una base temporal (`everprop_catalog_import`), creada con `CREATE TABLE … LIKE` de las tablas locales.
     - En una sola transacción sobre `bellomo_crm`, borra el catálogo del tenant local y lo inserta desde la temporal. Remapea `tenant_id` al tenant local y usa solo las columnas comunes, sin las generadas.
     - Si algo falla (por ejemplo, un lead o una visita local que apunte a una unidad que se va a reemplazar), la transacción se revierte y no cambia nada.
  4. **Verificación automática:**
     - conteo por tabla igual al del volcado;
     - las tablas no relacionadas no cambian (`leads`, `contacts`, `conversations`, `messages`, `visits`, `visit_requests`, `users`, `lead_properties`, `channel_accounts`);
     - no queda ninguna clave de persona del ERP.
  5. Borra la base temporal y el volcado. El volcado se escribe en `%TEMP%`, nunca en el repo; con `-KeepDump` se conserva.
- **Tablas copiadas:** `legacy_property_types`, `legacy_property_statuses`, `legacy_localities`, `projects`, `properties`, `property_media`, `property_features`, `project_landing`, `project_landing_assets`. Las imágenes van como URL, sin descargar archivos.
- **Excluidas:**
  - leads, contactos, conversaciones, mensajes, visitas, usuarios, canales, conocimiento (RAG), intakes, cobranzas, tokens y secretos;
  - dentro de `legacy_data_json`, las claves del ERP que apuntan a personas: `projects.EdDueId` (dueño), `properties.SocId` (socio), `properties.ProCamUsuId` (usuario del ERP) y `properties.AdmCod` (administrador).
- **Base local:** se aplicó el forward `2026-11-25.001_residential_property_details.sql` (EVP-204), que ya estaba en develop y en staging pero no en local, a `bellomo_crm` y `bellomo_crm_test`, para que las columnas coincidan.

## 3. Cómo correrlo

Requisitos:
- Docker local levantado: basta `everprop-api-mysql`.
- `railway whoami` con acceso a `bellomito-staging`.
- Autorización expresa del usuario para leer staging.

Desde `everprop-api/`:

```powershell
.\scripts\copy-staging-catalog.ps1                          # lee staging e importa
.\scripts\copy-staging-catalog.ps1 -KeepDump                # conserva el volcado en %TEMP%
.\scripts\copy-staging-catalog.ps1 -DumpFile <ruta.sql>     # reimporta un volcado previo sin leer staging
```

Por defecto copia el tenant `bellomito-staging` de staging al tenant `bellomo` local. Se puede cambiar con `-StagingTenantSlug` y `-LocalTenantSlug`.

Si la base local está atrasada en forwards, aplicarlos antes con `scripts/import-schema.ps1` o con el forward puntual.

## 4. Verificación (2026-11-26, autorizada por el usuario)

| Tabla | Staging | Local |
|---|---|---|
| legacy_property_types | 17 | 17 |
| legacy_property_statuses | 8 | 8 |
| legacy_localities | 102 | 102 |
| projects | 36 | 36 |
| properties | 3578 | 3578 |
| property_media | 0 | 0 |
| property_features | 0 | 0 |
| project_landing | 33 | 33 |
| project_landing_assets | 0 | 0 |

- **Repetible:** una segunda corrida con `-DumpFile` dejó los mismos conteos, sin duplicados.
- **Tablas no relacionadas:** sin cambios. Claves de personas en `legacy_data_json`: 0.
- **Textos:** una muestra de `ProDes1` y `ProDes2` solo tiene medidas ("LOTE DE 300 M2", "LOCAL 2.35 X 3.80").
- **Herramientas del asistente** sobre el catálogo copiado, con el código de EVP-200 (PR #178) montado en el contenedor:
  - `buscar_propiedades` devuelve lotes en venta (San Pablo 1) y locales en alquiler (Galería Norte 1);
  - `consultar_propiedad` devuelve el detalle de un lote (barrio, superficie, descripción);
  - ninguna respuesta incluye precio, moneda ni estado.
- **Composición del catálogo copiado** (insumo para EVP-206):

  | Tipo | Operación | Unidades |
  |---|---|---|
  | Lotes | venta | 2500 |
  | Lotes | sin operación definida | 808 |
  | Cocheras | venta / alquiler / sin operación definida | 16 / 69 / 34 |
  | Locales | alquiler | 122 |
  | Departamentos | venta | 24 |

  El asistente solo ve las unidades en estado `AVAILABLE`, que son 255. Los 24 departamentos figuran como vendidos, así que no aparecen.

## 5. Pendientes y riesgos

- **`buscar_propiedades` no filtra por nombre de proyecto ni por barrio**, solo por `project_id` (uuid), ciudad, tipo y operación. Con el catálogo real, la mayoría de las unidades están en San Salvador de Jujuy, así que "lotes en San Pablo" depende de que el modelo ya conozca el id. Va para EVP-206 o un ticket propio.
- **No se copió el conocimiento aprobado** (`knowledge_documents` y `knowledge_chunks`). El asistente local responde sobre unidades pero no sobre procesos. Si hace falta, sería un ticket aparte, porque los documentos pueden tener datos internos.
- Los ids de staging se conservan. En una base local con otros tenants podrían chocar; en ese caso la transacción se revierte sin cambios.
- No se probó una conversación completa con Gemini sobre este catálogo, para no generar costo sin autorización.
- **Para producción:** este script no aplica a producción ni escribe en staging.
