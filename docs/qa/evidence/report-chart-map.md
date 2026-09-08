# Mapa visual del informe

## Pregunta analítica

¿Cómo se distribuyen los defectos de la auditoría por severidad y por estado de resolución, y por qué el dictamen sigue siendo NO-GO?

## Visual seleccionado

- Tipo: barras apiladas.
- Eje X: severidad (`P0`, `P1`, `P2`, `P3`).
- Eje Y: cantidad de defectos.
- Color/serie: `Cerrado verificado`, `Fix/mitigación pendiente de integración`, `Abierto/bloqueado`.
- Dataset: 12 filas en formato largo; incluye además el total de cada severidad y si bloquea release.
- Lectura final: 15 de los 22 defectos son P0/P1; tras cerrar backend/contrato/dependencias/paginación, 9 defectos están cerrados y verificados, 6 mitigados/parciales y 7 abiertos.

## Proveniencia y transformación

Fuente primaria: `docs/qa/BUG_REGISTER.md`. Los estados individuales fueron normalizados en tres grupos de decisión. El informe MCP conserva una consulta DuckDB `VALUES` reproducible con los 12 conteos revisados; no consulta producción ni contiene datos personales.

## Validación y entrega

- `validate_artifact`: PASS; 2 datasets, 2 fuentes, snapshot `partial`.
- `render_artifact`: PASS en una única llamada posterior a la validación.
- El artefacto visual renderizado durante el primer corte conserva los conteos anteriores al cierre backend. Para la decisión final prevalecen `QA_MASTER_REPORT.md` y `BUG_REGISTER.md`; la certificación backend ya no está bloqueada.
