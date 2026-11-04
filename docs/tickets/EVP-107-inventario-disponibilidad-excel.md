# EVP-107 — Inventario Bellomo: corregir disponibilidad y datos comerciales según Excel oficial y copy

Rama `ticket/EVP-107-inventario-disponibilidad-excel` · fecha 2026-11-03 · autor: Claude (agente) con Mauro Centurión; textos de la web delegados en Codex

## 1. Qué pedía el ticket

Que la app, la web y el agente de IA muestren como disponible solo lo que Bellomo tiene en venta o en alquiler. El contraste en la base local dio 1.216 unidades visibles, cuando el Excel tiene 221 en venta y 25 en alquiler dentro de esos proyectos.

Fuente de verdad: el Excel exportado por sistemas de Bellomo para inventario, estados y disponibilidad, y el copy oficial para textos, servicios y etapas de obra. Si difieren, prevalece el Excel. Lo que ninguno confirma, como la moneda, queda sin publicar.

Fuera de alcance: calcular el porcentaje vendido, cargar unidades de proyectos que no están en el Excel, cargar una lista de precios, borrar proyectos y aplicar en producción.

## 2. Qué se implementó

**La causa:** en la base local nunca se aplicó el forward `2026-09-15.001`, cuyo `CHECK` admite los estados `NOT_SELLABLE`, `NOT_MARKETED` y `UNKNOWN`, ni el importador `everprop:inventory-import`. Por eso los estados del Excel estaban reducidos a `SOLD` y `AVAILABLE`, y la operación a `SALE`. El importador ya mapeaba bien las unidades, así que la corrección de datos es ejecutarlo.

**El código** cubre lo que impedía usarlo sin efectos secundarios:

- [InventorySourceImport.php](../../everprop-api/app/Domain/Inventory/Services/InventorySourceImport.php): un proyecto existente conserva `status` y `progress`. El campo `EdEst` del Excel está casi siempre vacío, y tomarlo dejaba 26 de 27 proyectos con estado no público. Un proyecto borrado que revive queda `UNKNOWN`, para no republicar sus unidades.
- [SeedBellomoOfficialCopy.php](../../everprop-api/app/Console/Commands/SeedBellomoOfficialCopy.php):
  - `projectStatus()` deriva la etapa de la etiqueta del copy y ante una etiqueta desconocida da `UNKNOWN`, que no es público.
  - Nunca hace público un proyecto: si su estado no es público o su ficha está oculta, sigue así hasta que se publique desde el panel.
  - Solo acepta el tenant `bellomo` y un ID numérico.
  - Los proyectos que no están en el Excel y no tienen unidades pierden `progress` y `total_units` inventados.
  - Completa la ciudad vacía desde el copy (El Rocío) en el proyecto y sus unidades.
  - Sus escrituras nuevas y dos heredadas quedan acotadas por `tenant_id`.
- Textos del mismo archivo, hechos por Codex y revisados en el diff:
  - Las Colinas 1 y Los Perales pasan a "Vendido completamente".
  - San Pablo 1, La Arbolada 2 y Los Cardinales dejan de mostrar el porcentaje vendido.
  - Se ajustan San Pablo 2, Palpalá y Huasi VII al copy.
- [inventory-production-import.md](../../everprop-api/docs/inventory-production-import.md): explica la conservación de etapas y el orden correcto (`verify` antes del seed).

Sin forwards nuevos, variables de entorno, dominios, CORS, Sanctum ni proveedores. No se configuró ningún entorno.

## 3. Por qué esta solución

- Se reutilizó el importador existente, que ya tenía plan, backup, ensayo con reversión y verificación, en lugar de escribir una corrección de datos aparte.
- Precio y moneda con `--currency=unset`: el Excel no trae moneda y solo 4 de las 225 unidades en venta tienen precio. El valor original se conserva en `legacy_data_json`.
- "Proyecto futuro" pasa a `PLANNING`, que no es público. Esos proyectos siguen en el catálogo de la web, que usa `project_landing`, pero dejan de salir en `/public/projects`.

## 4. Cómo se verificó

**Aplicado en una copia aislada, no en `bellomo_crm`.** Copia `bellomo_crm_evp107` de la base local, con el código final: forward `prepare`, plan, ensayo con reversión, aplicación, forward `relations`, `verify` y seed. Datos del Excel con últimos cambios del 2026-09-14.

- Excel contra base: 3.577 unidades por lado, sin diferencias de estado, operación, superficie ni descripción.
- Visibles con `publiclyVisible` y `PublicInventory`: 221 en venta y 25 en alquiler, en total 246.
- Precio y moneda: `null` en las 3.577. Los lotes 59-AP6-17 y 59-AP6-18 quedan no comercializados, y 8-P1-2 vendido.
- `total_units` coincide con las unidades reales en todos los proyectos.
- 32 proyectos siguen visibles en la web y los 3 ocultos siguen ocultos.
- 0 textos con la codificación rota.
- Los 1.510 vínculos de leads con propiedades y los `public_id` no cambiaron.
- `bellomo_crm` quedó igual: 2.313 `SOLD`, 1.264 `AVAILABLE` y sin las tablas del forward.

**Tests** (MySQL local, PHP 8.4, base `bellomo_crm_test`, código del worktree cargado en el contenedor): `tests/Feature/Inventory` 58 de 58, Pint y PHPStan sin errores en los archivos tocados. Suite completa: 548 tests, con 5 errores y 10 fallas, los mismos 15 casos que dan los archivos afectados sobre `origin/develop` sin estos cambios. Se agregaron tests de conservación de etapas, proyecto revivido, visibilidad por estado (incluido `PublicInventory`), proyecto retirado, tenant rechazado y negativos entre tenants.

**Revisiones:**
- Codex, en solo lectura: encontró un test que no probaba la limpieza de cifras y que reaplicar un plan después del seed falla. El test se corrigió y lo segundo quedó documentado.
- `tenant-isolation-reviewer`: sin fugas entre tenants. Corregidos sus hallazgos altos y, en una segunda vuelta, dos medios; esa última corrección no volvió a pasar por el revisor. Quedan sin cambiar: una ficha nueva se crea visible aunque su proyecto no sea público (muestra solo el copy, sin unidades), una consulta heredada de `deleteIfOrphanDuplicate` sin `tenant_id` que falla hacia el lado seguro, y falta un negativo de la búsqueda por `legacy_name`.

**Sin verificar:**
- La API pública por HTTP: se comprobó con el mismo scope que usa, en proceso.
- Las pantallas en el navegador con estos datos.
- Staging y producción: no se consultaron.

## 5. Pendientes y riesgos

- **No está aplicado en ningún entorno.** Falta decidir si se aplica en `bellomo_crm`, que comparten otros procesos. Para staging hace falta autorización expresa y que Bellomo confirme que el Excel sigue vigente o entregue uno nuevo.
- **Dependencias con Bellomo:** moneda y lista de precios vigente, y el criterio del porcentaje vendido. Mauro confirmó el 2026-11-04 que el Excel es la fuente de verdad y que "no vendible" es no disponible.
- **Contenido web:** el seed reescribe `cover`, `gallery`, `documents` y textos de los proyectos oficiales. Antes de correrlo en staging hay que revisar lo editado a mano.
- **Sin precios:** con `--currency=unset` no se muestra ningún precio hasta tener la lista vigente, tampoco en el panel como `price`.
- **Comercial:** la cantidad de unidades disponibles baja mucho, y hay 219 vínculos de leads con unidades que dejan de estar disponibles. La lista se entregó fuera del repo, que es público.
- **Avance:** San Pablo 1 (65) y Valle Verde (30) conservan un avance sin fuente; el Excel no lo trae. Queda para definir con Bellomo.
- **Tests ajenos:** 15 fallas en Cobranzas, Conversaciones, Identidad y `ProductionEnvironment` ocurren igual sin estos cambios. Varias son por una columna `kind` que falta en la base de pruebas.
- **Copia aislada:** `bellomo_crm_evp107` sigue en el MySQL local con permisos para `everprop_app`. Se puede borrar cuando no haga falta.
- **Producción:** una prueba local o de staging no la valida. Antes de un pase hay que verificar forwards SQL pendientes (`schema_versions`), incluidos los de inventario, dominios definitivos, CORS/R2, hosts/Sanctum/cookies (`tenant_domains`), credenciales y permisos de proveedores, base de datos y storage. Conviene comprobar si esos entornos tienen el mismo problema.
