# EVP-204 — Detalle residencial flexible en inventario

Rama `ticket/EVP-204-residential-detail` · fecha 2026-11-25 · Álvaro Ruggeri / Codex

## 1. Qué pedía el ticket

Separar ambientes de dormitorios y guardar superficies cubierta/descubierta, piso, orientación, disposición, cocheras y expensas para departamentos y casas. Conservar unidades anteriores con valores nulos y exponer las características libres ya existentes con aislamiento por tenant y políticas de inventario. El panel corresponde al ticket EVP-205.

## 2. Qué se implementó

- `database/schema/forward/2026-11-25.001_residential_property_details.sql`: nueve columnas opcionales y registro de versión. El forward puede repetirse; MySQL 8.4 requiere `ALGORITHM=COPY` por el índice FULLTEXT existente en `properties`.
- `Property.php`, `StorePropertyRequest.php`, `UpdatePropertyRequest.php` y `PropertyResource.php`: persistencia, validación y lectura administrativa/pública de los nuevos campos. Las expensas se envían con moneda explícita y siguen los permisos de precios.
- `PropertyIndexRequest.php` e `InventoryFilters.php`: filtro y orden por ambientes, sin cambiar los filtros previos.
- `ProductionCheck.php` y `ProductionEnvironmentTest.php`: el arranque de producción exige columnas y versión aplicada.
- `InventoryWriteGuardsTest.php`: alta, edición, lectura, filtros, validaciones, versiones, permisos y características libres en departamentos/casas, incluidos accesos negativos entre tenants.

El CRUD de `PropertyFeature` ya existía en `AdminPropertyFeatureController`, con `PropertyFeaturePolicy` y búsquedas scoped por tenant. Se reutilizó y se probó; no se duplicó el contrato.

## 3. Por qué esta solución

Las columnas dedicadas permiten filtrar ambientes y mostrar detalles sin interpretar JSON libre. Los campos son nulos para preservar las unidades previas. Se usan los permisos, recursos y rutas existentes. El forward incorpora restricciones `CHECK` para superficies y expensas junto a las columnas en una única copia de tabla. Esta operación requiere una ventana controlada, que se debe medir con el tamaño real de `properties` antes de desplegar.

## 4. Cómo se verificó

- MySQL 8.4 aislado: baseline SHA-256 canónico, forwards completos, aplicación y repetición del forward EVP-204; nueve columnas presentes. `everprop:schema:verify` pasó con usuario de prueba sin privilegios de root.
- `pint --test`: 10 archivos PHP en verde.
- `phpstan analyse`: sin errores.
- `InventoryWriteGuardsTest`: 12 pruebas, 85 aserciones en verde.
- `ProductionEnvironmentTest`: 3 pruebas, 46 aserciones en verde.
- Suite API completa: 1203 pruebas pasaron, 2 omitidas y 7 fallaron en pruebas ajenas al diff bajo el contenedor manual. Las fallas afectaron backup, simulación, importadores y contrato global de esquema; falta repetir en el entorno Compose canónico/CI antes de dar por cerrada la verificación global.
- Revisión independiente de aislamiento/seguridad: sin hallazgos bloqueantes; se agregó la aserción solicitada de ocultamiento de expensas.
- Revisión independiente de esquema: se corrigió la repetición del forward y se conservaron los tres `CHECK` en la copia. Primera aplicación y replay pasaron en una base MySQL 8.4 nueva.

## 5. Pendientes y riesgos

- Repetir la suite completa en CI/Compose canónico y documentar la causa de los siete fallos del contenedor manual.
- Medir duración y bloqueo del `ALTER TABLE ... ALGORITHM=COPY` sobre una réplica con volumen comparable al real; programar la migración antes de desplegar el código que lee las columnas.
- Integrar el contrato con EVP-205 y recorrer el panel contra la API de prueba.
- No se aplicó ninguna migración en staging ni producción. Revisar dominios, permisos y configuración del entorno antes de cualquier despliegue.
