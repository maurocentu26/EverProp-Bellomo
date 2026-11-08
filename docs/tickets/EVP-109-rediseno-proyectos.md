# EVP-109 — Proyectos: rediseño de lista y ficha con todos los estados de las unidades

Rama `ticket/EVP-109-rediseno-proyectos` · un commit en la rama, sin push al escribir este informe · fecha 2026-11-04 · autor: Claude (agente) con Mauro Centurión

## 1. Qué pedía el ticket

Poder comparar unos 30 proyectos y entender el estado real de sus unidades. La tarjeta anterior solo contaba disponibles, reservadas y vendidas, así que las no vendibles, alquiladas y no comercializadas no se veían en ningún lado. La ficha dibujaba una tarjeta por unidad, sin filtros ni paginación.

Criterios: contadores por estado en la API; lista en filas con barra de estados, búsqueda, filtros y orden por disponibles; ficha con filtros por estado y unidades paginadas; texto de 17 y 20,4 px; botones de 44 y 52 px; claro y oscuro; teclado; sin desborde entre 320 y 1440 px; sin inventar precio ni moneda.

Fuera de alcance: datos de inventario, precios y moneda; matriz de lotes y vista de Inventario; editor Web y alta de proyecto; Conversaciones (EVP-67); esquema SQL.

## 2. Qué se implementó

- **API:**
  - [AdminProjectController.php](../../everprop-api/app/Domain/Inventory/Http/Controllers/AdminProjectController.php): `propertyCounts()` suma disponibles en venta y en alquiler, alquiladas, no vendibles y no comercializadas, en la misma consulta del listado. Cada contador filtra `properties.tenant_id` de forma explícita, además del scope global.
  - [ProjectResource.php](../../everprop-api/app/Domain/Inventory/Http/Resources/ProjectResource.php) los expone con `whenCounted`. Solo agrega campos.
- **Estados:** [project-labels.ts](../../everprop-public/src/lib/project-labels.ts) define `UNIT_STATES`, `unitState()` y `projectUnitSummary()`. Lo que los contadores no explican queda como «sin estado informado», y una unidad disponible en leasing o temporal queda como «disponible», sin decir que está en venta.
- **Lista:**
  - [desarrollos/page.tsx](../../everprop-public/src/app/admin/desarrollos/page.tsx): resumen del catálogo, búsqueda sin distinguir tildes, filtros por tipo y disponibilidad, y orden por más disponibles.
  - [ProjectCard.tsx](../../everprop-public/src/components/admin/ProjectCard.tsx): pasa a ser una fila con miniatura, etapa, tipo, barra de estados, leyenda en palabras y cifra de disponibles. Sin portada muestra iniciales.
- **Ficha:** [desarrollos/[id]/page.tsx](../../everprop-public/src/app/admin/desarrollos/[id]/page.tsx):
  - Barra y filtros por estado. Arranca en lo que se ofrece: en venta, en alquiler, o «disponibles» si hay de los dos; sin disponibles, en el total.
  - Unidades en filas de a 24, con «Ver más», en orden natural por sector y código.
  - El nombre de la unidad une tipo y código, y debajo van manzana o sector y la descripción cargada. `unitDisplay()` no convierte los códigos: 12, 12A y 12B siguen separados.
  - Secciones Unidades, Matriz y Materiales; el plano pasa a Materiales.
  - Enlace «‹ Proyectos» para quien no es asesor; el asesor conserva su «Atrás».
- **Estilos:** [admin-catalog.css](../../everprop-public/src/app/admin-catalog.css) agrega el bloque EVP-109 con un color por estado en claro y oscuro. Se borran las reglas de la tarjeta anterior en ese archivo y en [admin-design.css](../../everprop-public/src/app/admin-design.css).
- **Tests:** [projects-redesign.test.mjs](../../everprop-public/tests/projects-redesign.test.mjs) se reescribe para la nueva vista. [TenantIsolationAndRbacTest.php](../../everprop-api/tests/Feature/Inventory/TenantIsolationAndRbacTest.php) suma contadores por estado, unidades de otro tenant y borradas, usuario con alcance por proyecto y usuario sin acceso. [PublicInventoryTest.php](../../everprop-api/tests/Feature/Inventory/PublicInventoryTest.php) comprueba que los contadores no salen por las rutas públicas.

Sin forwards, variables de entorno, dominios, CORS, Sanctum ni proveedores. No se configuró ningún entorno.

## 3. Por qué esta solución

- Se reutilizaron `propertyCounts()`, `inventoryPriceLabel`, `propertyStatusLabel`, `InventoryMatrix`, `ProjectMaterials`, `GenerateLotsModal` y los tokens `--panel-*`. No hay dependencias nuevas.
- Contadores en SQL en lugar de cargar unidades en la lista: EVP-106 ya había bajado esa pantalla a una sola petición.
- «Ver más» en vez de páginas numeradas: la ficha ya carga todas las unidades del proyecto para los contadores y la matriz, así que paginar es solo no dibujarlas.
- **Límites conocidos:**
  - La ficha sigue pidiendo todas las páginas de unidades de un proyecto, como antes.
  - La lista ya no tiene el acceso directo «Ver matriz», según la maqueta aprobada: ahora se llega desde la ficha o desde Inventario.
  - El test `tests/projects-redesign.test.mjs` cubre la lógica de filtros con renderizado simulado; el recorrido real se probó aparte, con un script que no queda en el repo.

## 4. Cómo se verificó

- **Backend** (contenedor local con el código del worktree, MySQL 8.4): `tests/Feature/Inventory` 63 de 63. Pint y PHPStan sin errores en los archivos tocados.
  - **Suite completa:** 552 tests con 5 errores y 10 fallas en Cobranzas, Conversaciones, Identidad y `ProductionEnvironment`. Son las mismas cantidades y áreas que EVP-107 registró antes de este ticket. Esta vez no se volvieron a correr sobre `develop`.
  - **Prueba de mutación:** al quitar el filtro de tenant y los scopes globales de los contadores, el test `test_project_counters_split_every_status_and_ignore_foreign_and_deleted_units` falla. El cambio se revirtió.
- **Frontend:** `tsc --noEmit` sin errores; `node --test tests/*.test.mjs` 208 de 209; `eslint src tests` 0 errores y 123 advertencias; `npm run build` compila. El test que falla es `assistant-trace`, ya registrado en EVP-104 y EVP-105 como falso positivo ajeno.
- **Navegador sin interfaz (Edge, `localhost:3109`, `NEXT_PUBLIC_DATA_MODE=mock`, cifras por proyecto del Excel cargadas en el navegador de prueba, códigos de unidad sintéticos):**
  - Lista y dos fichas a 1440, 1024, 768, 390 y 320 px, en Chica y Grande; claro en todos los anchos y oscuro a 1440 y 390. Son 42 casos como administrador y 42 como asesor, sin desborde, sin controles bajo 44 o 52 px y sin texto de botón cortado.
  - Tamaños medidos: H1 34 y 40,8 px, texto 17 y 20,4 px, detalle 15 y 18 px. En móvil, H1 28 y 33,6 px.
  - Recorrido: búsqueda «galeria», filtros, «Ver más» hasta el final, filtros por estado, secciones, Enter con foco visible y apertura de «Cargar manzana y lotes». Sin errores de página.
  - El tamaño y el tema se aplicaron cambiando el atributo y la clase de la página, no con el selector del panel.
- **Revisión de aislamiento (`tenant-isolation-reviewer`, sobre el diff anterior a estos ajustes):** sin fugas y sin hallazgos bloqueantes ni altos. Revisó el SQL generado, pero no ejecutó los tests. Sus hallazgos M1 (test débil) y M3 (filtro de tenant solo por scope global) se corrigieron en este ticket y no volvieron a pasar por el revisor. M2 queda en la sección 5.
- **Panel contra la API real (2026-11-04):** panel en `localhost:3000` y API de este ticket en el contenedor, sobre la copia aislada `bellomo_crm_evp107`, con un usuario de prueba creado y borrado después.
  - Los contadores de todos los proyectos coinciden con el Excel por estado y operación.
  - Los totales de la lista coinciden con el Excel, sin pedidos a `/admin/properties`.
  - Fichas probadas: Valle Verde, Galería Norte 2, Huasi VII, Huasi VIII, La Toma y Quintas. Sin errores de página ni respuestas 4xx o 5xx.
  - Lista a 1440, 390 y 320 px, y fichas de Valle Verde y Huasi VIII a 1440 y 390 px: sin desborde, controles chicos ni texto cortado.
  - La lista suma una unidad menos que el Excel, porque esa unidad no pertenece a ningún proyecto.
- **Staging (solo lectura, 2026-11-04):** estados, operaciones y tipos coinciden con el Excel. Los hallazgos de datos de la sección 5 salen de esa consulta. Staging todavía no tiene el código de este ticket.
- **Revisión previa al merge (2026-11-04, sobre el commit completo):**
  - `tenant-isolation-reviewer`, leyendo el código: sin fugas y sin hallazgos bloqueantes ni altos. M1 y M3 quedan corregidos. No ejecutó tests ni capturó el SQL.
  - Codex, en solo lectura, sobre el frontend: sin defectos que bloqueen. No probó en navegador.
  - `test_project_counters_keep_the_explicit_tenant_filter` falla si se quita solo el filtro explícito del controlador. El cambio se revirtió.
- **Sin verificar:** este panel desplegado en staging, teclado y lector de pantalla reales, y dispositivos físicos.

## 5. Pendientes y riesgos

- **Datos, fuera del alcance de este ticket y a corregir en EVP-110. Estados y operaciones están bien; lo siguiente se ve en la pantalla nueva hasta aplicar esa corrección:**
  - **Nombres y ciudades de proyecto:** los proyectos del Excel muestran el texto de sistema, como `LA ARBOLADA.`, `RINCONES LOTES E INFRAESTRUC.` o la ciudad `MONTERICO`. En staging es una regresión de la aplicación de EVP-107: el backup previo tenía `Las Colinas 1` y el importador pisó `name` y `city`, porque solo conserva `status` y `progress`. La web no cambia porque toma el nombre de su contenido. El asistente de IA sí lee `projects.name` (`PublicInventory.php:80`).
  - **Tipo de proyecto:** Huasi VIII figura como loteo porque el Excel marca sus cuatro pisos como `LOTES`.
  - **Tipo de unidad:** las cocheras de Huasi VII están como `DEPARTAMENTO`, también las que están en venta. Algunas unidades no tienen tipo.
  - **Superficie:** muchas unidades no la tienen, y parte de ellas la traen en la descripción.
  - **Fila sin datos:** Los Cardinales tiene una fila sin piso, número ni descripción, y una unidad no tiene proyecto.
  - **Solo local:** las descripciones con `m??s` aparecen en la copia local; en staging no hay ninguna.
- **Hallazgos de la revisión que no son de este ticket, para otro ticket:**
  - **Tests de permisos:** faltan usuarios con alcance por unidad o categoría, `publish` con otro tenant y los valores de los contadores en `POST`, `PATCH` y `publish`.
  - **Contadores con edición sin lectura:** `PATCH` y `publish` devuelven los contadores a un usuario con `can_edit` sin `can_view`, que recibe 403 en `GET`. Ya pasaba con los contadores anteriores, y este ticket suma el desglose. Exposición baja: el revisor no encontró ningún endpoint que escriba esa combinación de permisos.
  - **`legacy_data`:** `ProjectResource` lo expone a cualquier usuario autenticado, también anidado para quien solo tiene alcance por unidad. Guarda el registro crudo de la planilla. No se confirmó si trae datos sensibles.
  - **`ROTATOR`:** no cuenta como asesor en el panel y ve «Cargar manzana y lotes» en la ficha. No se probó ese rol.
- **Rendimiento:** son 9 subconsultas por proyecto y `operation` no está en el índice `ix_properties_project_status`. No se midió con el catálogo real; conviene mirarlo en staging.
- Las capturas y las cifras comerciales no se versionan, porque el repo es público. El detalle quedó en Jira.
- Una prueba local no valida producción. Antes de un pase hay que verificar forwards SQL pendientes (`schema_versions`), dominios definitivos, CORS/R2, hosts/Sanctum/cookies (`tenant_domains`), credenciales y permisos de proveedores, base de datos y storage.
