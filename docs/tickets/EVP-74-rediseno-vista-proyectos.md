# EVP-74 — Rediseño vista Proyectos & Desarrollos

Rama `ticket/EVP-65-rediseno-visual` · sin commit por instrucción del usuario · fecha 2026-10-25 · autor Codex.

## 1. Qué pedía el ticket

Rediseñar lista y ficha siguiendo los prototipos de Bellomo y las tarjetas de Activos: lectura a 17 px, ubicación sin partes vacías, estado y tipo, cantidades con texto, precios sin inventar moneda, unidades alfanuméricas independientes y adaptación a 375 px. Confirmar las escrituras y conservar la vista de asesor sin acciones de carga.

El usuario confirmó que EVP-74 existe y está En curso, que EVP-73 fue revisado/aprobado y que su commit es `636da18`. Autorizó trabajar en la rama maestra indicada, sin consultar Jira, sin commit, sin modificar permisos ni API y exclusivamente dentro de `everprop-public`. No se consultó ni actualizó Jira.

## 2. Qué se implementó

- `src/app/admin/desarrollos/page.tsx`: conserva filtros y el permiso `can_create` del servidor; agrega la condición de no ser asesor para «Nuevo proyecto». Carga los proyectos y todas las páginas de sus unidades mediante los lectores existentes, en lugar del catálogo limitado a una página de unidades. Errores y vacíos sin notas internas ni sustitución por muestras.
- `src/components/admin/ProjectCard.tsx`: una tarjeta por proyecto, portada real cuando existe, nombre grande, ubicación, tipo, estado, unidades cargadas y números acompañados de disponibles/reservadas/vendidas.
- `src/lib/project-labels.ts`: rótulos compartidos, unión de ubicación y conteos por estado; no convierte códigos de unidad a números ni deduplica unidades.
- `src/app/admin/desarrollos/[id]/page.tsx`: cabecera, resumen, descripción, tarjetas de unidades con el `PropertyList` existente, plano, materiales y matriz. Quita el botón de regreso propio; conserva el de MainLayout. Espera también las unidades antes de presentar el proyecto, para evitar totales parciales.
- `src/app/admin/projects/page.tsx` y `src/app/admin/projects/[id]/page.tsx`: exponen las mismas pantallas en las rutas solicitadas, conservando `/admin/desarrollos` y sus enlaces existentes.
- `src/components/admin/GenerateLotsModal.tsx`: la ficha activa confirmación completa antes de cargar lotes (proyecto, manzana, rango, estado, tipo, operación, medidas, precios, moneda, esquinas, servicios y descripción). Cancelar conserva el formulario y no escribe; un bloqueo síncrono evita envíos duplicados. Desde la ficha, los datos comerciales iniciales quedan vacíos en modo API; los ejemplos siguen en mock. Un error de lectura de proyectos ya no carga muestras. El asesor no monta este modal.
- `src/components/admin/InventoryMatrix.tsx`: también utiliza `inventoryPriceLabel` en la ficha emergente de la matriz.
- `src/components/admin/MainLayout.tsx`: omite el cartel técnico de mock solo para las rutas de proyectos y desarrollos; conserva su control de acceso.
- `src/app/admin-design.css`: reutiliza `inventory-*`, agrega estilos de proyectos, rótulos normales, colores del tema, una columna y botones de ancho completo en teléfono.
- `tests/projects-redesign.test.mjs`: cuatro pruebas, siguiendo compilación TypeScript en VM y renderizado de `inventory-redesign.test.mjs`.

No se modificaron contratos, endpoints, permisos, dependencias, configuración de entorno ni SQL.

## 3. Por qué esta solución

Se reutilizaron PropertyList, inventoryPriceLabel, los lectores paginados, la carga de lotes y el sistema de materiales. Las rutas nuevas reexportan las existentes para evitar dos implementaciones. Se cuentan las unidades cargadas completas en vez de inferir disponibilidad a partir del total declarado o de una página parcial. Cero se muestra como cero, con su texto.

## 4. Cómo se verificó

- `npm run lint`: finalizó con 0 errores y 128 advertencias existentes del proyecto. Lint específico de los archivos modificados: 0 errores y 6 advertencias en componentes existentes.
- `npx tsc --noEmit`: aprobado.
- `node --test --test-isolation=none tests/projects-redesign.test.mjs tests/inventory-redesign.test.mjs tests/project-intake.test.mjs`: 11 pruebas aprobadas. Cubre rótulos, ubicación incompleta, conteos incluyendo 150 unidades, identidades 12/12A/12B, precio y moneda nulos, asesor sin escritura, confirmación completa, cancelación y doble envío.
- `node --test --test-isolation=none tests/*.test.mjs`: 137 pruebas, 131 aprobadas y 6 fallidas en `notifications-worker.test.mjs`. Las seis fallan también al ejecutar ese archivo por separado: su VM no define `self.navigator`, utilizado por `clearAppBadge`/`setAppBadge` en el worker existente. Ninguno de esos archivos fue modificado.
- Se usó `--test-isolation=none` porque el runner normal no puede crear subprocesos (`spawn EPERM`) en este entorno.
- Detector de Impeccable: tres advertencias sobre reglas preexistentes de gris sobre púrpura en `admin-design.css:130`, ajenas a los estilos añadidos; no reportó advertencias en las vistas ni la tarjeta nuevas.
- `git diff --check`: sin errores de whitespace.
- Se intentó `npm run dev -- --port 3074`: Next falló con `spawn EPERM`. No se pudo comprobar la UI en navegador ni medir el desbordamiento real a 375 px. La adaptación móvil se revisó por código y pruebas de estilos; queda pendiente validación visual en escritorio, teléfono y ambos temas.
- No se ejecutó build. No se inició Docker, no hubo commit, push, PR, merge ni despliegue.

## 5. Pendientes y riesgos

### Lo que el contrato consumido no informa

- No entrega agregados de disponibles/reservadas/vendidas por proyecto: se calculan con las unidades de todas las páginas accesibles al usuario. Esto implica una lectura paginada adicional por proyecto; un catálogo muy grande puede requerir un endpoint de agregados en otro ticket.
- `total_units` declarado no acredita unidades existentes ni sus estados. El resumen usa unidades realmente cargadas; otros estados (alquiladas, no vendibles, no comercializadas o desconocidas) pueden hacer que los tres subtotales no sumen ese total.
- Ubicación, avance, precio y moneda pueden no estar informados. La vista no inventa ubicación ni avance; elimina los placeholders de ciudad/provincia del adaptador al unir la ubicación. Reutiliza «Precio a consultar» y «Moneda sin confirmar» según los nulos preservados por inventoryPriceLabel.
- El adaptador actual no conserva un tipo arbitrario de proyecto fuera de Loteo/Edificio/Comercial; no se cambió su contrato ni su clasificación.
- La lista recibe `can_create` para el alta. No hay en estas vistas acciones existentes de editar, archivar o cambiar el estado del proyecto: no se inventaron endpoints ni se habilitaron permisos. Los estados se muestran para lectura.

### Verificación pendiente

La escritura real de lotes, la autenticación y los materiales no se probaron contra un entorno desplegado. El helper preexistente de carga masiva convierte `projectId` a número, mientras el catálogo usa `public_id`; debe comprobarse la compatibilidad del identificador en el entorno antes de usar esa escritura. No se alteró la API ni el helper en este ticket.

No se configuró staging ni producción. Las pruebas locales no validan sus dominios, CORS/R2, hosts/Sanctum/cookies, proveedores o storage. La revisión visual en navegador y los seis fallos de notificaciones quedan explícitamente pendientes; no se presenta la suite completa como aprobada.
