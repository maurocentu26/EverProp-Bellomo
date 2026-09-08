# Mapa visual del informe integrado

## Pregunta analítica

¿Cómo se distribuyen los 27 defectos por severidad y estado, y por qué un candidato local verde todavía no autoriza producción?

## Visual principal

- Tipo: barras apiladas.
- Eje X: severidad (`P0`, `P1`, `P2`, `P3`).
- Eje Y: cantidad de defectos.
- Series: `Cerrado verificado`, `Mitigado/parcial`, `Abierto`.
- Conteos: P0 `2/0/1`, P1 `11/4/2`, P2 `1/2/3`, P3 `0/0/1`.
- Lectura: 14 cerrados, 6 mitigados y 7 abiertos; el único P0 abierto corresponde al despliegue live no listo.

## Resumen visual secundario

- Tipo: tira de métricas ejecutivas.
- Valores: Vitest `21/21`, Playwright mock `6/6`, Playwright API `2/2`, PHPUnit `63/63`, HTTP `7/7`, OpenAPI `55/55`.
- Finalidad: separar evidencia local reproducible de la decisión operativa live.

## Proveniencia y transformación

- `docs/qa/BUG_REGISTER.md`: severidad y estado normalizados.
- `docs/qa/evidence/frontend-gates.md`: suites frontend/browser.
- `docs/qa/evidence/backend-gates.md`: backend/schema/contrato/imagen.
- `docs/qa/evidence/live-readonly-smoke.md`: probes live GET sin credenciales.

No se consultan datos personales ni se muta producción. Los conteos se cargan como datasets estáticos revisados y se contrastan con las tablas del informe maestro.

## Validación y entrega

El artefacto MCP pasó `validate_artifact` con estado `ready`, 3 datasets y 3 fuentes. Después se ejecutó una única llamada a `render_artifact`, completada correctamente. Si los números cambian, se actualizan simultáneamente este mapa, el registro de defectos y el informe maestro.
