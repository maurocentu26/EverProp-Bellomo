# EVP-195 — Expectativas del evaluador conversacional

Rama local: `ticket/EVP-195-eval-expectations`, desde `origin/develop` `0d24671` (2026-11-24). Jira: En curso. Sin commit, push ni PR.

## 1. Pedido

Quitar falsos negativos de la evaluación real sin reducir los controles de seguridad: aceptar `consultar_propiedad` cuando resuelve una unidad concreta, evitar que «ARS» coincida dentro de «comunicarse», y ajustar casos de registro y derivación para el flujo vigente.

## 2. Implementación local

- El contrato de casos admite `expected.tools_any`: al menos una de las herramientas indicadas. El validador exige una lista no vacía con nombres permitidos; el runner verifica la intersección y su autoprueba cubre éxito y fallo.
- Términos cortos como `ARS` se comparan como palabras completas en `must_include` y `must_not_include`.
- Se ajustaron 20 expectativas de consulta de unidad concreta. SEARCH-049, SEARCH-057 y SEARCH-059 conservan `buscar_propiedades` obligatorio porque requieren resolver proyecto, alternativas o varias unidades.
- CRM-001, SEC-027 y RIO-019 reflejan confirmación explícita antes de persistir interés. RIO-008 pide una franja de visita concreta. El prompt solicita derivación inmediata sin exigir contacto y distingue visita solicitada de confirmada.
- Se actualizó la prueba de horario para la regla de derivación y la documentación de evaluación.

## 3. Criterio técnico

El runner sigue exigiendo evidencia del turno, verificando persistencia y vetando argumentos de tenant aportados por el modelo. `tools_any` solo se usa cuando dos herramientas de lectura resuelven la misma unidad; se conservaron exigencias estrictas para búsquedas de varias unidades o alternativas.

## 4. Verificación

- `node evals/validate.mjs` → 229 casos válidos; `git diff --check` limpio.
- PHP 8.4/MySQL 8.4/Redis aislados en Docker: `ModelEvalTest` y `OutOfHoursAssistantTest` → 8 pruebas, 82 comprobaciones; la evaluación con modelo real se omitió por diseño.
- Recorrido `EVAL_LLM=dry` → 229 casos cargados, 460 comprobaciones; sus 70 PASS y 130 FAIL son mecánicos y no miden la calidad del modelo.
- Pint y PHPStan sin errores. Revisión independiente detectó tres expectativas demasiado permisivas; se restauraron. No encontró fuga entre tenants en el diff.

## 5. Pendiente y riesgo

- Ejecutar `EVAL_LLM=configured` con clave propia, base aislada y autorización de gasto; evaluar respuestas humanas de los casos críticos. Sin ese reporte no corresponde declarar que el 99/101 histórico mejoró.
- Pasar la revisión formal del equipo y coordinar la unión con EVP-194, que también modifica `PromptBuilder` y `prompt_version`.
- `everprop-api/AGENTS.md` exige autorización expresa para commit, push y PR; por eso el trabajo permanece local.
