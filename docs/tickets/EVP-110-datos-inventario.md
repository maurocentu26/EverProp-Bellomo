# EVP-110 — Inventario: restaurar nombres oficiales y corregir tipos y datos incompletos de proyectos y unidades

Rama `ticket/EVP-110-datos-inventario` · un commit sobre `develop` `4c8084b` · fecha 2026-11-05 · autor: Claude (agente) con Mauro Centurión

## 1. Qué pedía el ticket

El panel y el asistente de IA mostraban el texto de sistema del Excel como nombre y ciudad de los proyectos (`LA ARBOLADA.`, `MONTERICO`), porque al aplicar EVP-107 el importador pisó `name` y `city`. Además, Huasi VIII figuraba como loteo, las cocheras de Huasi VII como departamentos, muchas unidades sin superficie, una fila vacía y una unidad sin proyecto.

Criterios: reimportar no pisa nombre ni ciudad; los proyectos con copy oficial recuperan nombre y ciudad; tipos, superficie y filas incompletas según decida Producto, sin borrar registros; contadores iguales al Excel (225 en venta, 30 en alquiler, 9 reservadas); códigos de unidad sin cambios; aplicación en staging con autorización, backup y ensayo.

Decisiones de Producto (Mauro, 2026-11-05):

1. Huasi VIII: proyecto Comercial y sus pisos como Local.
2. Cocheras de Huasi VII: tipo Cochera.
3. Superficie: tomarla de la descripción cuando trae un único valor claro en m².
4. Fila vacía de Los Cardinales y unidad sin proyecto: no borrarlas y marcarlas como no comercializadas.

Fuera de alcance: precios y moneda, producción, rediseño de Proyectos (EVP-109) y permisos.

## 2. Qué se implementó

- **Importador:** [InventorySourceImport.php](../../everprop-api/app/Domain/Inventory/Services/InventorySourceImport.php), en `plan()`. Al reimportar sin `--replace-metadata`, un proyecto existente conserva `name`, y también `city` y `address` si ya tenían valor. Un proyecto nuevo sigue tomando los datos del Excel.
- **Copy oficial:** [SeedBellomoOfficialCopy.php](../../everprop-api/app/Console/Commands/SeedBellomoOfficialCopy.php) restaura `name`, `city` y `address` del copy solo si el nombre actual es exactamente el rótulo del Excel (`LEGACY_PROJECT_MAP[...]['legacy_name']`). Un nombre editado en el panel se conserva.
- **Normalización del Excel:** [WorkbookInventorySource.php](../../everprop-api/app/Domain/Inventory/Services/WorkbookInventorySource.php):
  - Piso `COCH` → tipo Cochera (`GARAGE`).
  - Tipos de lote (`ProTId` 9, 10, 12) en un piso `1P`…`4P` → Local. Así Huasi VIII queda sin lotes y su proyecto pasa a Comercial con la regla de tipo de proyecto que ya existía.
  - El título usa el rótulo del tipo corregido, por ejemplo «LOCAL COMERCIAL 1 — 1P». `legacy_type_id` conserva el tipo original del Excel.
  - `areaFromDescription()` completa la superficie cuando falta, solo si el texto tiene un único «N M2» y ninguna otra cifra decimal, y el valor no es una ochava. Cada caso queda registrado como `Area taken from description` en el reporte de la importación.
  - Una unidad sin proyecto padre, o sin piso ni número, queda `NOT_MARKETED`. `legacy_status_id` conserva el estado original.
- **Tests:** [WorkbookImportTest.php](../../everprop-api/tests/Feature/Inventory/WorkbookImportTest.php) suma `test_workbook_types_areas_and_orphan_rows_are_corrected_without_guessing` y `test_official_copy_restores_workbook_labels_but_keeps_names_edited_in_the_panel`, y amplía el test de etapa con nombre, ciudad y dirección.

Sin forwards, variables de entorno, dominios, CORS, Sanctum ni proveedores. No se configuró ningún entorno.

## 3. Por qué esta solución

- Se corrige en el importador y no con un script de una vez, para que la próxima importación del Excel no vuelva a romper los datos.
- Se reutilizaron `LEGACY_PROJECT_MAP` del copy oficial y la regla existente de tipo de proyecto. No hay dependencias nuevas.
- **Superficie:** se prefiere dejar vacío antes que adivinar. Quedan sin superficie casos como «LOTE DE 296 M2 OCH. 4 M2», «LOTE DE 973.18 ESQUINA OCH 2.65 M2» o «1HA.1980.40M2».
- **Límites conocidos:**
  - Las reglas `COCH` y `\dP` son propias de este Excel. Se verificó que solo afectan a las 16 cocheras de Huasi VII y a los 4 pisos de Huasi VIII.
  - La unidad sin proyecto (`EdId` 109) estaba vendida: pasa a no comercializada y su estado original queda en `legacy_status_id`.
  - Una superficie editada en el panel se pisa en la próxima importación, como antes de este ticket.

## 4. Cómo se verificó

Contenedor local de PHP con el código del worktree y su propio `vendor`, MySQL 8.4.

- `tests/Feature/Inventory`: 65 de 65. Pint sin errores en los archivos tocados; PHPStan sin errores.
- **Prueba de mutación:** al quitar `$after['name'] = $before['name']`, falla `test_existing_project_keeps_its_stage_unless_metadata_is_replaced`. El cambio se revirtió.
- **Excel completo:** las 16 cocheras de Huasi VII quedan como Cochera y los 8 registros de Huasi VIII como Local. Huasi VIII pasa a Comercial y Huasi VII sigue como Edificio. La superficie se completa en 704 unidades, y 850 siguen sin ella.
- **Ensayo sobre la copia aislada `bellomo_crm_evp107`** (con la importación de EVP-107 aplicada; precios conservados):
  - Plan sin altas ni bajas, con 27 proyectos y 3.577 unidades. Cambian: 1 tipo de proyecto (Huasi VIII), 20 tipos de unidad, 20 títulos, 704 superficies y 1 estado (la unidad sin proyecto). Nombre, ciudad, precio y moneda no cambian.
  - `rehearse` revirtió todo. Después se aplicó en la copia; `verify` coincide con el plan.
  - Con `everprop:seed-bellomo-copy`, 24 proyectos recuperan nombre y ciudad oficiales, por ejemplo `LA ARBOLADA.` → «La Arbolada 1» y `LAS COLINAS` → «Las Colinas 1».
  - Contadores después de aplicar: 225 en venta, 30 en alquiler y 9 reservadas, iguales al Excel. Las 4 cocheras en venta siguen en venta.
- **Revisión de aislamiento (`tenant-isolation-reviewer`, leyendo el diff, sin correr tests):** sin bloqueantes y sin fugas entre tenants. Las lecturas y escrituras nuevas usan el tenant del snapshot o `tenant_id` + `id`, y la regla `NOT_MARKETED` solo baja visibilidad.
  - **Alto, corregido:** la superficie podía leerse mal en textos como «1.002 M2» (punto de miles), «10X30M2» (una medida) o «2 HAS. 5000 M2» (hectáreas). Ahora esos casos quedan vacíos y el test los incluye. En el Excel real no aparece ninguno: siguen siendo 704 superficies completadas.
  - **Medio, pendiente:** un usuario con alcance por categoría (`user_inventory_scopes` con `CATEGORY`) gana o pierde acceso a las 20 unidades recategorizadas, por ejemplo las cocheras de Huasi VII si su alcance es Cochera. El plan no lo avisa. La copia local no tiene alcances; en staging hay que revisarlo antes de aplicar.
  - **Bajo, anotado:** el copy oficial también pisa `city` y `address` cuando el nombre sigue siendo el rótulo del Excel, y no cambia la ciudad de las unidades. Una unidad sin piso o sin número, pero no sin ambos, sigue con su estado.
- **Sin verificar:** staging, el panel y la web pública contra estos datos, y una respuesta real del asistente con el nombre oficial. El asistente lee `projects.name` (`PublicInventory.php:80`), pero no se probó con el modelo.

## 5. Pendientes y riesgos

- **Staging:** falta aplicarlo, con autorización expresa, backup previo, ensayo con reversión y `everprop:seed-bellomo-copy`, y verificarlo en la base y desde el panel desplegado. Antes, revisar si hay `user_inventory_scopes` por categoría (hallazgo medio de la revisión).
- **Sin copy oficial:** Cochera Alto Padilla, Cochera Huasi III y Fracción Arenales conservan el nombre y la ciudad del Excel, en mayúsculas. Producto tiene que confirmar sus nombres.
- **Sin tipo:** tres unidades siguen sin tipo (una en Huasi VII, una en Los Cardinales y una en La Toma). Las decisiones de Producto no las cubrieron.
- **Producción:** fuera de alcance. Antes de un pase hay que verificar forwards SQL pendientes (`schema_versions`), dominios definitivos, CORS/R2, hosts/Sanctum/cookies (`tenant_domains`), credenciales y permisos de proveedores, base de datos y storage.
