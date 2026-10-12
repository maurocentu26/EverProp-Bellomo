# EVP-L03 — Dataset de evaluación hacia 200 casos

Rama `ticket/EVP-L03-dataset-200` (desde `develop`) · fecha 2026-10-12 · Claude Code (agente `eval-engineer`) con Ramiro Ruggeri
ID local provisorio (serie EVP-L autorizada por el PM).

## 1. Qué pedía el ticket

El dataset tenía 80 casos semilla. El objetivo del diseño (`evals/README.md`) es llegar a 200 casos, repartidos por segmento:

| Segmento | Meta |
|---|---|
| search | 60 |
| current-data | 30 |
| crm | 30 |
| security | 40 |
| failures | 20 |
| rioplatense | 20 |

Todos con datos sintéticos.

## 2. Qué se implementó

111 casos nuevos, agregados al final de `evals/cases/*.jsonl`:

| Segmento | Total / meta | IDs nuevos |
|---|---|---|
| search | 60/60 | SEARCH-021..060 |
| current-data | 30/30 | DATA-007..030 |
| crm | 22/30 | CRM-023..030 |
| security | 39/40 | SEC-021..040 |
| failures | 20/20 | FAIL-013..020 |
| rioplatense | 20/20 | RIO-010..020 |

- Los IDs CRM-015..022 y SEC-020 quedaron libres porque son de EVP-L10. **Al mergear las dos ramas el dataset llega a 200**, sin conflictos de ID.
- **Qué cubren:**
  - **search:** filtros combinados, búsquedas sin resultados y códigos ambiguos (12, 12A y 12B son unidades distintas).
  - **current-data:** cambios de precio, documentos vencidos, moneda `null` y unidades vendidas o reservadas.
  - **crm:** idempotencia de interés y de visita, falta de contacto y duplicados.
  - **security:** inyección directa e indirecta (por datos de propiedad y por fuentes), extracción del prompt, acceso a otro cliente, datos personales y argumentos de herramienta contrabandeados.
  - **failures:** timeouts, Inventory caído y resultados parciales.
  - **rioplatense:** voseo, jerga, errores de tipeo y abreviaturas.
- Hay 78 casos nuevos críticos, todos en `test`, y 33 no críticos, en `dev`.
- **Totales de la rama:** 191 casos; `dev` 78, `test` 113; 145 críticos.
- `evals/README.md`: se actualizó la línea de estado.

## 3. Por qué esta solución

- **Mismo formato y mismo evaluador (Q01).** Solo se usan fixtures que `ModelEvalTest` entiende, así que los casos corren hoy sin cambiar código.
- **Casos críticos en `test`**, como pide el README: los gates de 100 % se miden sobre casos ciegos.

## 4. Cómo se verificó

Entorno: stack Docker aislado `everprop-lote3` (base sintética), 2026-10-12.

| Comprobación | Resultado |
|---|---|
| `node evals/validate.mjs` | OK, 191 casos válidos |
| `EVAL_LLM=dry` sobre los 191 casos | Todos cargan y corren sin errores de fixtures: PASS 54, FAIL 110, DETERMINISTIC 27 |

En `dry` el modelo responde siempre "Te paso con un asesor", así que el PASS/FAIL no mide calidad. Esta corrida solo prueba que las fixtures y los chequeos funcionan.

**No verificado: el rendimiento contra el modelo real.** Es EVP-L04 y necesita X03.

## 5. Pendientes y riesgos (límites del evaluador que encontró el agente)

1. **Las propiedades no tienen** descripción, dormitorios ni superficie. Los casos de "2 dorm" o "pileta" solo verifican que el modelo no invente esos datos. La inyección indirecta por datos de propiedad (SEC-023) va en el nombre del proyecto.
2. **No se guarda la `version` de los documentos.** DATA-014 simula dos versiones con `valid_until`.
3. **Claves de persistencia que el evaluador todavía no chequea** y que aparecen como `unchecked`: `contacts.count`, `visit_requests.count`, `tool_executions.*` y `messages.count`.
4. **Los casos con `system_event` cuentan como DETERMINISTIC** (FAIL-013..020, DATA-007 y DATA-023). Se cubren con las suites deterministas y no con el evaluador.
5. **No se pueden sembrar leads de otro cliente** para probar aislamiento.
6. **`must_not_include` compara subcadenas**, así que los casos de abstención, negación y aclaración siguen necesitando la revisión humana del reporte.
7. **Balance:** `test` (113) quedó más grande que `dev` (78). Hay 32 críticos viejos en `dev`; moverlos o no es una decisión aparte.

Los límites 1 a 5 se pueden resolver en un ticket aparte que extienda `ModelEvalTest`.
