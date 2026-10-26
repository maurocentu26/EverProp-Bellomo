# EVP-76 — Rediseño de la vista Estadísticas

Rama `ticket/EVP-65-rediseno-visual` · sin commit por pedido expreso · 2026-10-25 · Codex para Ramiro.

## 1. Qué pedía el ticket

Rediseñar la ruta existente `/admin/estadisticas` y sus gráficos siguiendo los prototipos Bellomo y las vistas inventory/projects. Mantener API y permisos, explicar las cifras y sus períodos, mejorar legibilidad y accesibilidad y adaptar a 375 px sin desplazamiento horizontal. Sin build, commit, push, despliegue ni Docker.

El usuario confirmó EVP-76 existente y En curso vía verificación de Claude, y EVP-75 revisado y aprobado (15df28d). Se respetó la orden de no consultar Jira y de usar la rama maestra indicada. No se actualizó Jira. El informe fuera de everprop-public es la excepción expresamente solicitada; los cambios de código y tests se limitaron a ese proyecto.

## 2. Qué se implementó

- `everprop-public/src/app/admin/estadisticas/page.tsx`: cuatro cifras con explicación y período exacto; formato es-AR, singular/plural, estados existentes de carga/error/reintento, filtros y tres vistas conservados. Un único Atrás móvil: los asesores mock usan el del shell; los demás roles usan el de la vista. El mensaje de acceso denegado dice «Estadísticas está disponible para gerentes y administradores.» Se eliminó el aviso interno sobre datos simulados.
- `everprop-public/src/components/admin/statistics/StatisticsCharts.tsx`: evolución horizontal al ancho disponible, escala única desde cero, valores y fechas directamente rotulados, detalle textual desplegable y selección funcional del intervalo. La comparación de responsables conserva nombres, valores, unidades y filtro por asesor; sus barras son decorativas para lectores de pantalla.
- `everprop-public/src/app/admin-design.css`: superficies y tipografía compartidas con inventario, controles a 17 px, primera tarjeta oscura con texto blanco y barras con color del tema. Una columna móvil; detalle de equipo apilado con rótulos por celda. La cartera y los responsables incluyen valores textuales independientes del color.
- `everprop-public/tests/stats-redesign.test.mjs`: siete pruebas con transpileModule, VM y árbol JSX, siguiendo el estilo solicitado. Cubren formatos, singular/plural, datos nulos, escala, detalle textual, filtro de intervalos y responsables, permisos intactos, cuatro tarjetas, fechas personalizadas, carga/reintento y reglas móviles.

- `everprop-public/src/data/statistics-sample.ts`: respuesta tipada `{ data: CommercialStatistics }`, generada en una ventana de 90 días relativa a la fecha argentina actual. Tres responsables con conteos diarios, tasas y medias ponderadas por conversaciones; Lucía tiene respuesta y resolución null. Períodos y asesor filtran antes de agregar; fechas fuera de la ventana muestran ceros y tasas/tiempos Sin datos.
- `everprop-public/src/components/admin/AdminNavigationMenu.tsx` y `everprop-public/src/components/sidebar/navigation.ts`: Estadísticas visible en mock también para asesores, mediante canViewCommercialStats. Con datos reales se conserva la condición de sesión API TENANT_ADMIN o SALES_MANAGER; el backend y sus permisos no cambian.

La revisión de Claude detectó que el bloqueo de sesiones locales impedía revisar la vista. Ahora isMockDataMode habilita la vista y selecciona la muestra mediante import dinámico; ese camino no llama a la API. Fuera de mock se mantiene la misma llamada y restricción original. No se modificaron contratos, rutas, configuración ni dependencias. No se mezclan muestras con respuestas reales.

## 3. Por qué esta solución

Se reutilizaron el selector de período existente, el agrupador temporal, los filtros, la carga con AbortController, las vistas de equipo/atención y el vocabulario visual inventory/projects. Las barras horizontales evitan comprimir fechas o crear un lienzo más ancho que el teléfono. Los cierres siguen significando leads ganados con fecha registrada; no se presentan como contratos ni reservas.

### Información que la API consumida no informa

El contrato `CommercialStatistics` no aporta reservas, montos ni moneda de operaciones, comparación con período anterior, metas de atención, consultas esperando más de tres días, ni desglose por etapas visita/negociación/reserva/boleto. No se trasladaron los valores ilustrativos del prototipo a producción. Reservas, montos/moneda y comparación anterior muestran **Sin datos**. Los otros desgloses ausentes no se grafican.

No se muestran importes porque no hay una métrica monetaria disponible. No se infiere USD ni ARS: si un futuro contrato aporta un importe con moneda null, debe rotularse **Moneda sin confirmar**. Las tasas y tiempos nulos continúan mostrando Sin datos. No se llama clientes únicos al conteo de leads.

## 4. Cómo se verificó

- `npm run lint`: código de salida 0; 0 errores, 122 advertencias existentes.
- `npx tsc --noEmit`: pasó.
- `node --test --experimental-test-isolation=none tests/stats-redesign.test.mjs`: 7/7 pasó. Incluye los dos casos nuevos: asesor real sin acceso y muestra renderizada en mock sin llamadas API, además de filtros, sumas coherentes, null y visibilidad del menú.
- Suite completa con `node --test --experimental-test-isolation=none tests/*.test.mjs`: 149 tests, 143 pasan y 6 fallan en `notifications-worker.test.mjs`, por acceso a clearAppBadge/setAppBadge sobre navigator indefinido. Reproducidos ejecutando ese archivo por separado; no se modificó el worker ni sus tests.
- El comando habitual `node --test tests/*.test.mjs` no puede crear procesos en este entorno (spawn EPERM). Se usó la opción de Node sin aislamiento de procesos para ejecutar realmente la suite.
- Detector Impeccable: tres advertencias de colores en reglas anteriores de admin-design.css (línea 130), fuera del bloque nuevo; sin hallazgos en los componentes modificados.
- `git diff --check`: sin errores de whitespace.
- No se ejecutó build, conforme al pedido. No se arrancó Docker.

## 5. Pendientes y riesgos

No se realizó inspección visual en navegador a 375/1440 px ni validación con lector de pantalla o sesión API real. La contención móvil se comprobó por reglas CSS y pruebas de estructura; requiere revisión visual antes de aprobar el rediseño. No se verificó staging ni producción y no se desplegó.

La suite global permanece roja por los seis fallos del worker; deben resolverse en su alcance correspondiente. La excepción mock se prueba separada del acceso real: un asesor API y un administrador local fuera de mock siguen bloqueados; administradores y gerentes API conservan el acceso. No se tocaron consultas, policies, cachés, jobs ni IA. El informe y los cambios quedan sin commit para revisión del usuario.
