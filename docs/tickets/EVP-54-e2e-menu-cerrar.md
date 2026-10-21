# EVP-54 — E2E del navegador: cerrar y reabrir desde el menú de acciones

Rama `ticket/EVP-54-e2e-menu-cerrar` desde `develop` (`dc96c3e`) · 2026-10-20 · Claude con Ramiro.

## Problema
El E2E del navegador (`everprop-api/tests/e2e/ui-vertical.mjs`) fallaba en `develop` desde el 18/10, con 8/9 pasos: el test buscaba un botón «Cerrar» visible. Desde EVP-46 (`6cb58d3`), cerrar y reabrir están dentro del menú «⋮» («Acciones de la conversación»).

## Cambio
Solo en el test: abre el menú de acciones, elige «Cerrar conversación», espera la confirmación, vuelve a abrir el menú y elige «Reabrir conversación». El panel no cambia: el menú ya tenía nombres accesibles (`role="menu"` y `menuitem`).

## Verificación
- `node --check` pasa.
- El recorrido completo (U1–U9) corre en el CI de este PR, porque Docker no arranca en esta PC.
