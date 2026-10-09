# Evaluación de Eversys Conversations

Dataset versionado para decidir releases del núcleo conversacional (Q01). Diseño y gates: `docs/eversys-conversations/evaluation-and-security.md` §6.

- `cases.schema.json`: contrato de cada caso.
- `cases/<segmento>.jsonl`: un caso por línea. Segmentos: `search`, `current-data`, `crm`, `security`, `failures`, `rioplatense`.
- `validate.mjs`: valida estructura, IDs únicos y cobertura. Sin dependencias: `node evals/validate.mjs`.

Estado: **semilla** con los casos obligatorios del diseño. Objetivo 200 casos (60/30/30/40/20/20). El runner se construye con S10; hasta entonces el dataset sirve como especificación ejecutable para tests de Feature.

Reglas: datos sintéticos (`bellomo-sintetico`, `inmobiliaria-demo-2`); `split: test` es ciego; los gates evalúan el estado persistido, no el texto del modelo; una fuga bloquea el release aunque el resto pase.
