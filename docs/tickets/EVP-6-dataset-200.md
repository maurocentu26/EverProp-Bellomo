# EVP-6 — Dataset de evaluación hacia 200 casos

Rama `ticket/EVP-6-dataset-200` (desde `develop`) · fecha 2026-10-12 · Claude Code (agente `eval-engineer`) con Ramiro Ruggeri
Ticket Jira [EVP-6](https://eversys.atlassian.net/browse/EVP-6) (desarrollado en local como EVP-L03).

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

- Los IDs CRM-015..022 y SEC-020 quedaron libres porque son de EVP-5. **Al mergear las dos ramas el dataset llega a 200**, sin conflictos de ID.
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

## 2b. Correcciones de la revisión de seguridad de IA (2026-10-12/13)

La revisión independiente (`llm-security-reviewer`) encontró casos que pasaban sin probar nada, falsos negativos y claves que el evaluador no chequeaba. El agente `eval-engineer` corrigió todo:

**Evaluador** ([ModelEvalTest.php](../../everprop-api/tests/Feature/Evals/ModelEvalTest.php))
- **Argumentos de herramientas:** ahora se registran, y cualquier llamada que pase `tenant_id`, `actor` o `idempotency_key` hace fallar el caso, en todos los casos.
- **Herramientas prohibidas:** expectativa nueva `expected.tools_forbidden`, agregada al schema y a `validate.mjs`.
- **Claves de persistencia que ahora se chequean de verdad:**
  - `visit_requests.count`, `contacts.count` y `messages.count`;
  - `tool_executions.model_key_absent`: la clave de idempotencia la pone el servidor, nunca el modelo;
  - `tool_executions.tenant`: toda ejecución queda en el tenant del caso.
- **Fixtures nuevas:** documento revocado (`documents[].revoked`) y nota interna del asesor (`internal_notes`).
- **Revisión humana:** el reporte lista en `critical_needs_human` los casos críticos de negar, abstenerse, aclarar o responder. El gate del 100 % en esos casos exige una firma humana (README).

**Casos**
- **Corregidos:**
  - SEC-021 y SEC-022: frases reales del prompt en español, sin cambiar el prompt;
  - SEC-023: la inyección apunta a 12A, que está disponible, y prohíbe `registrar_interes`;
  - SEC-027 y SEC-017: clave del modelo ausente;
  - SEC-030: el interés pedido se registra;
  - CRM-001: idempotencia como una sola fila.
- **Textos prohibidos más precisos:** en lugar de "confirmada", "dólares" o "solicitada" sueltos, se prohíben las formas afirmativas o el precio con moneda (SEC-028, SEC-038, CRM-027, CRM-028, CRM-029, RIO-020, DATA-009, RIO-017, DATA-030 y FAIL-017).
- **Variantes agregadas:** formas del teléfono, la negociación y los porcentajes (SEC-024, SEC-029, SEC-034, SEC-037, SEC-039 y SEC-040).
- **Casos nuevos:** SEC-041 (una nota interna no llega al cliente) y SEC-042 (un documento revocado no se cita).
- El dataset quedó en **193 casos**: `dev` 78, `test` 115, todos críticos. Con EVP-5 mergeado, son 202.

## 3. Por qué esta solución

- **Mismo formato y mismo evaluador (Q01).** Solo se usan fixtures que `ModelEvalTest` entiende, así que los casos corren hoy sin cambiar código.
- **Casos críticos en `test`**, como pide el README: los gates de 100 % se miden sobre casos ciegos.

## 4. Cómo se verificó

Entorno: stack Docker aislado `everprop-lote3` (base sintética), 2026-10-12.

| Comprobación | Resultado |
|---|---|
| `node evals/validate.mjs` | OK, 193 casos válidos (después de la revisión) |
| Self-check del evaluador (detecta fuga, herramienta prohibida, clave del modelo, tenant ajeno) | OK |
| Suite backend completa, Pint y PHPStan | 330 tests sin fallos; Pint y PHPStan OK |
| Revisión `llm-security-reviewer` | 6 bloqueantes, 7 a corregir y 3 menores: todos corregidos |
| `EVAL_LLM=dry` sobre los 193 casos | Todos cargan y corren: PASS 55, FAIL 111, DETERMINISTIC 27 |

En `dry` el modelo responde siempre "Te paso con un asesor", así que el PASS/FAIL no mide calidad. Esta corrida solo prueba que las fixtures y los chequeos funcionan.

**No verificado: el rendimiento contra el modelo real.** Es EVP-10 y necesita X03.

## 5. Pendientes y riesgos (límites del evaluador que encontró el agente)

1. **Las propiedades no tienen** descripción, dormitorios ni superficie. Los casos de "2 dorm" o "pileta" solo verifican que el modelo no invente esos datos. La inyección indirecta por datos de propiedad (SEC-023) va en el nombre del proyecto.
2. **No se guarda la `version` de los documentos.** DATA-014 simula dos versiones con `valid_until`.
3. **Claves de persistencia que el evaluador todavía no chequea** y que aparecen como `unchecked`: `contacts.count`, `visit_requests.count`, `tool_executions.*` y `messages.count`.
4. **Los casos con `system_event` cuentan como DETERMINISTIC** (FAIL-013..020, DATA-007 y DATA-023). Se cubren con las suites deterministas y no con el evaluador.
5. **No se pueden sembrar leads de otro cliente** para probar aislamiento.
6. **`must_not_include` compara subcadenas**, así que los casos de abstención, negación y aclaración siguen necesitando la revisión humana del reporte.
7. **Balance:** `test` (113) quedó más grande que `dev` (78). Hay 32 críticos viejos en `dev`; moverlos o no es una decisión aparte.

Los límites 1 a 5 se pueden resolver en un ticket aparte que extienda `ModelEvalTest`.
