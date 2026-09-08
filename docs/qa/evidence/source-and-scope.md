# Evidencia de fuente y alcance

- Directorio original: descarga ZIP sin `.git`; fue preservado.
- Checkout aislado: `qa-audit-main`.
- Rama de entrega: `codex/preproduction-audit-20260908`.
- Checkpoint QA previo al merge: `9e43ee8`.
- `origin/main` integrado: `bf7018118ee683725c20d43e472b0722f05708af`.
- Commits nuevos de Mauro: `f61a161` (inventario/loteos) y `3db1a00` (mobile, filtros y notificaciones), unidos por PR #4.
- Delta upstream: 39 archivos, 3.311 altas, 1.083 bajas; 10 conflictos resueltos manualmente.
- Working tree inicial: limpio.
- Baseline SQL SHA-256: `4C8B170BC6F8B6827E9B85E756ACB2254CCF392B0FF4C11459C775366BAE472D`.
- Producción: sólo GET no destructivo; sin login ni mutaciones.
- Datos de navegador: exclusivamente sintéticos/locales.
- Push autorizado por el usuario únicamente a la rama de entrega; sin deploy ni mutación live.
