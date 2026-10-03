---
name: eval-case
description: Escribir o ampliar casos del dataset de evaluación de Eversys Conversations en evals/cases/*.jsonl, con el schema del repo y datos sintéticos. Usar al cerrar un bug, agregar una herramienta, cambiar prompt/modelo o cubrir un segmento del dataset.
---

# Escribir casos de evaluación

1. Leer `evals/README.md` y `evals/cases.schema.json`.
2. Un caso por línea JSON en el archivo del segmento (`search`, `current-data`, `crm`, `security`, `failures`, `rioplatense`). IDs estables `SEG-NNN`, nunca reutilizados.
3. Datos sintéticos únicamente: tenants `bellomo-sintetico` y `inmobiliaria-demo-2`; nombres, teléfonos y precios inventados. Nada de inventario ni conversaciones reales.
4. Cada caso define: `actor` (visitor/advisor/manager/read_only), `tenant`, `channel`, `turns`, `fixtures` (estado de inventario/documentos con versión), `expected.behavior` (answer | abstain | clarify | handoff | deny), `expected.must_include`/`must_not_include`, `expected.persisted` (efectos en base esperados o `none`), `critical` y `split` (dev | test).
5. Casos críticos (`critical: true`) cuentan para gates de 100 %: códigos exactos, precio/moneda, estado de propiedad, aislamiento, duplicados, handoff.
6. Todo bug encontrado en producción o QA se convierte primero en caso (`split: test` si es para medir, `dev` si es para iterar).
7. Validar: `node evals/validate.mjs`. No commitear casos inválidos.
