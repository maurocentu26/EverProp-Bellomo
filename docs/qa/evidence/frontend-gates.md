# Evidencia de gates frontend

## Baseline

- `npm ci`: PASS, 656 paquetes.
- TypeScript/build: PASS.
- ESLint: 7 errores y 90 warnings.
- `npm audit --omit=dev`: 15 advisories runtime, 12 HIGH y 3 MODERATE.
- No existía suite frontend.

## Working tree final

| Gate | Resultado |
|---|---|
| Vitest | PASS, 4 archivos y 15 tests; incluye capacidades, navegación RBAC y paginación multipágina/cap explícito |
| TypeScript | PASS |
| ESLint | PASS técnico: 0 errores; deuda de 87 warnings |
| Next build API | PASS, Next 16.3.4; 17 entradas del router, 14 `/admin` |
| npm audit total/runtime | PASS, 0 vulnerabilidades |
| Playwright mock desktop | 3/3 PASS |
| Playwright mock mobile | 3/3 PASS |
| E2E API local | PASS, 2/2: build productivo, login 200, alta 201, render, reload, logout 204 y back/forward en desktop/mobile |

El E2E API real usa un usuario efímero en el tenant Bellomo del stack QA y no versiona credenciales. Los intentos diagnósticos detectaron y corrigieron tres problemas del harness: fixture no cargado por un directorio PsySH sin permisos, selección de una copia responsive oculta/menú móvil cerrado y ausencia de host→tenant al ejecutar el frontend como producción. La corrida final usó resolución segura por `TENANT_HOST_MAP_JSON`, no el header local, y completó ambos viewports.

Después de las pruebas se eliminaron `.next`, `node_modules`, reportes, traces, resultados y `tsconfig.tsbuildinfo`, todos regenerables. Los warnings `NO_COLOR/FORCE_COLOR` son del runner, no del producto.

La última pasada, posterior a los fixes capability-aware y de paginación, repitió unitarios, TypeScript, ESLint, audit, build de producción y Playwright mock/API desktop/mobile. Todos conservaron el resultado PASS indicado arriba.
