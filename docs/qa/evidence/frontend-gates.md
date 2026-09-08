# Evidencia de gates frontend

## Baseline

- `npm ci`: PASS, 656 paquetes.
- TypeScript/build: PASS.
- ESLint: 7 errores y 90 warnings.
- `npm audit --omit=dev`: 15 advisories runtime, 12 HIGH y 3 MODERATE.
- No existía suite frontend.

## Candidato integrado final

| Gate | Resultado |
|---|---|
| Vitest | PASS, 6 archivos y 21 tests; incluye capabilities, navegación, paginación, notificaciones seguras y 73 lotes únicos |
| TypeScript | PASS |
| ESLint | PASS técnico: 0 errores; deuda de 83 warnings |
| Next build API | PASS, Next 16.3.4; 15 entradas del router, 14 `/admin`; los dos endpoints Next inseguros de notificaciones no existen |
| npm audit total/runtime | PASS, 0 vulnerabilidades |
| Playwright mock desktop | 3/3 PASS |
| Playwright mock mobile | 3/3 PASS |
| E2E API local | PASS, 2/2: build productivo, login 200, alta 201, render, reload, logout 204 y back/forward en desktop/mobile |

El E2E API real usa un usuario efímero en un tenant QA del stack aislado y no versiona credenciales. La corrida final usó resolución segura por `TENANT_HOST_MAP_JSON`, no el header local, y completó ambos viewports. También descubrió el fallback cross-tenant de `stage_id`; luego del fix y su regresión PHPUnit, el recorrido completo quedó 2/2.

Después de las pruebas se eliminaron `.next`, `node_modules`, reportes, traces, resultados y `tsconfig.tsbuildinfo`, todos regenerables. Los warnings `NO_COLOR/FORCE_COLOR` son del runner, no del producto.

La última pasada, posterior al merge y los fixes capability-aware, repitió unitarios, TypeScript, ESLint, audit, build de producción y Playwright mock/API desktop/mobile. Todos conservaron el resultado PASS indicado arriba.
