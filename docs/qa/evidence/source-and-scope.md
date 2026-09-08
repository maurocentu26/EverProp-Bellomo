# Evidencia de fuente y alcance

- Directorio original: descarga ZIP sin `.git`; fue preservado.
- Checkout aislado: `qa-audit-main`.
- Rama de entrega: `codex/preproduction-audit-20260908`.
- Checkpoint QA previo al merge: `9e43ee8`.
- `origin/main` integrado: `64003ba2d849519a5f030b56d582f16e5d3e523b`.
- Commits funcionales nuevos de Mauro: `f61a161` (inventario/loteos), `3db1a00` (mobile, filtros y audio) y `037853f` (destinatario de notificaciones), unidos por PR #4 y PR #5.
- Delta upstream: 39 archivos, 3.374 altas, 1.094 bajas; 12 conflictos resueltos manualmente.
- Working tree inicial: limpio.
- Baseline SQL SHA-256: `4C8B170BC6F8B6827E9B85E756ACB2254CCF392B0FF4C11459C775366BAE472D`.
- Producción: sólo GET no destructivo; sin login ni mutaciones.
- Datos de navegador: exclusivamente sintéticos/locales.
- Push autorizado por el usuario únicamente a la rama de entrega; sin deploy ni mutación live.
