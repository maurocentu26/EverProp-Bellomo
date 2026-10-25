# EVP-75 — Rediseño vista Matriz de Lotes

Rama `ticket/EVP-65-rediseno-visual` · sin commit por instrucción del usuario · fecha 2026-10-25 · autor Codex.

## 1. Qué pedía el ticket

Rediseñar la ruta existente de Matriz de Lotes y el componente compartido con la pestaña de proyecto, siguiendo los prototipos Bellomo de PC y teléfono y el sistema visual de Activos y Proyectos. Preservar códigos exactos, accesibilidad, permisos y contrato API. El usuario confirmó EVP-75 existente y En curso, y EVP-74 revisado y aprobado (93c2fda); autorizó implementar sin consultar Jira y sobre la rama maestra indicada. No se consultó ni actualizó Jira.

## 2. Qué se implementó

- `everprop-public/src/components/admin/InventoryMatrix.tsx`: códigos completos (12, 12A, 12B), selector de manzana, leyenda con iconos y todos los estados, resumen por manzana con singular/plural. Botones nativos, nombres accesibles con código, manzana, estado y precio; superficie táctil mínima de 44 px y foco visible.
- `everprop-public/src/app/admin/inventory-matrix/page.tsx`: selector de proyecto visible, tipografía de 17 px, estados de carga/error/vacío sin mensajes internos. Conserva carga API y muestras únicamente en la rama mock. Conserva exportación y autorización existente de creación; evita mostrar unidades del proyecto anterior durante la carga.
- `everprop-public/src/app/admin-design.css`: estilos acotados `lots-*`, colores de estado con texto oscuro sobre fondos claros, grilla con desplazamiento propio. Sheet lateral en escritorio y completo en teléfono; botones de acciones a todo el ancho y un solo Atrás dentro de la ficha.
- Sheet compartido: cabecera con código, insignia y manzana sin duplicación; precio mediante `inventoryPriceLabel`; superficie, frente, fondo, ochava y servicios como texto; enlace a la ficha existente de la unidad.
- `everprop-public/src/components/admin/GenerateLotsModal.tsx`: para los consumidores con `confirmBeforeSave`, reemplaza `window.confirm` por revisión dentro del diálogo del panel con proyecto/ID, manzana, rango y cantidad, estado/tipo/operación, medidas, superficie, moneda/precio, esquinas/ochava, servicios y descripción. Volver a editar y cancelar no guardan; conserva bloqueo de doble envío. La ruta de matriz activa esa confirmación; asesores conservan acceso de lectura y no reciben la acción de carga.
- `everprop-public/tests/lots-matrix-redesign.test.mjs`: pruebas siguiendo el estilo de projects-redesign, con árbol JSX y TypeScript transpilado.
- `everprop-public/tests/projects-redesign.test.mjs`: adapta la prueba de creación compartida al diálogo del panel y comprueba revisión, vuelta a edición y envío único.

No se modificaron API, permisos, rutas, dependencias, configuración de entornos ni muestras. El informe es la única escritura fuera de everprop-public, solicitada expresamente.

## 3. Por qué esta solución

Se reutilizaron Sheet, Dialog, Button, Link, lucide-react, labels de inventario y tokens del panel. Se corrigió el componente común a ambos usos, eliminando la extracción numérica que confundía unidades alfanuméricas. Se conservó el flujo de carga existente y se retiraron agrupaciones redundantes de la página, que ya carga un proyecto por vez. No se agregaron acciones comerciales ni datos inferidos del prototipo.

## 4. Cómo se verificó

- `npm run lint`: sin errores; 122 advertencias del proyecto.
- `npx tsc --noEmit`: correcto.
- `node --test --test-isolation=none tests/lots-matrix-redesign.test.mjs tests/projects-redesign.test.mjs`: 7/7 correctos. Incluye códigos exactos, leyenda completa, nombres accesibles, conteos, filtro de manzana, valores ausentes/presentes, enlace, estados vacío/carga, reglas responsive y confirmación sin duplicar escrituras.
- `node --test --test-isolation=none tests/*.test.mjs`: 140 pruebas, 134 correctas y 6 fallidas en `notifications-worker.test.mjs` por `navigator.clearAppBadge/setAppBadge` no disponible en su contexto VM. Se reprodujeron las seis fallas ejecutando ese archivo solo; sus archivos no se modificaron en este ticket.
- El runner normal `node --test` fue rechazado con `spawn EPERM`; se utilizó la opción de ejecución sin aislamiento de procesos.
- Detector Impeccable: tres advertencias en CSS existente, línea 130, ajenas a las reglas agregadas para matriz.
- `git diff --check`: correcto.
- Se leyeron ambos prototipos y la documentación local de Link de Next.
- No hubo navegador disponible: el inventario de computer use devolvió cero navegadores y aplicaciones. No se verificaron visualmente PC/375 px, el desplazamiento real, focus trap ni navegación real de la ficha. Las verificaciones responsive son de código y no sustituyen esa revisión.
- No se ejecutó build, no se inició Docker, no se hizo commit, push, PR, merge ni despliegue.

## 5. Pendientes y riesgos

### Lo que la API no informa o puede omitir

Según el contrato y adaptador existentes, sin consultar datos remotos:

- No hay geometría/coordenadas de parcelas ni un plano catastral que permita reproducir su posición física: la grilla ordena por código de unidad, no representa ubicación geográfica.
- Precio y moneda pueden ser nulos; se muestran Precio a consultar o Moneda sin confirmar con el helper existente, sin inventar USD ni cero.
- Manzana, código, superficie, servicios y medidas son opcionales. Se usa el título cuando falta el código y textos de ausencia para los demás campos.
- Frente, fondo y ochava se leen únicamente de `commercialFeatures.land` cuando están informados; no se deducen de la superficie. Servicios se leen de `services`; valores falsos o ausentes no demuestran disponibilidad y no se presentan como servicios confirmados.
- No se dispone en este flujo de interesados por lote ni de la acción Ofrecer a un cliente del prototipo; no se agregaron personas o acciones ficticias.

Queda pendiente revisión visual en navegador a 375 px y escritorio y validación del flujo con datos reales del entorno autorizado. Los seis fallos de notificaciones quedan fuera del alcance. Este trabajo no propone un pase a producción ni configura dominios o accesos de staging/producción.

## 6. Correcciones tras revisión de Claude — 2026-10-25

El usuario informó que Claude revisó en navegador y aprobó la grilla de PC, la leyenda y la ficha, solicitando tres ajustes puntuales. Se preservó el resto de esa implementación.

- Entrada a `/admin/inventory-matrix`: respeta el identificador de `?project=...` o `?projectId=...`. Sin proyecto en la URL, recorre el inventario de los proyectos en su orden y selecciona el primero con unidades; no confunde una capacidad declarada o un conteo ausente con inventario real. En mock consulta únicamente almacenamiento y muestras locales; en API usa las lecturas existentes, sin modificar contratos ni permisos. Si no hay unidades en ningún proyecto conserva el estado vacío; los errores de lectura se muestran como error, no como inventario vacío. La búsqueda termina al encontrar el primero y puede requerir varias lecturas si los proyectos iniciales están vacíos.
- Teléfono: dentro del breakpoint de 767 px, la grilla usa cuatro columnas `minmax(0,1fr)`, elimina el ancho mínimo de 730 px y permite el salto a filas siguientes sin desplazamiento horizontal. Altura mínima móvil de 52 px. A 1440 px queda la regla de escritorio aprobada, con diez columnas.
- Precio del Sheet: regla específica `.lots-sheet-body .inventory-price`, 30 px y peso 750, con cifras tabulares y quiebre de texto para precios largos. Supera en especificidad la regla general que hacía heredar 17 px a los párrafos.

Archivos ajustados en esta revisión: página existente de matriz, CSS compartido y tests/lots-matrix-redesign.test.mjs. No se modificaron componentes, API ni permisos adicionales.

Verificación de esta revisión:

- `npm run lint`: 0 errores, 122 advertencias.
- `npx tsc --noEmit`: correcto.
- `node --test --test-isolation=none tests/*.test.mjs`: 142 pruebas, 136 correctas, seis fallos ya registrados en notifications-worker.test.mjs (navigator y APIs de badges ausentes en su VM).
- Nuevas pruebas ejecutan la carga inicial en API y mock, saltan un proyecto vacío, conservan selección explícita de URL incluso si está vacía de unidades, y verifican las reglas CSS de cuatro columnas en 375 px, diez columnas en 1440 px y el precio destacado.
- `git diff --check`: correcto.
- El inventario de computer use volvió a devolver cero navegadores/aplicaciones. Las comprobaciones de 375 y 1440 px son sobre las reglas CSS; no se midió layout ni se capturaron imágenes en un navegador. Queda pendiente que Claude o el usuario confirme visualmente ambos anchos tras estos ajustes.
- Sin build, Docker, commit, push, merge ni despliegue. Se mantuvo la rama solicitada y no se consultó Jira.
