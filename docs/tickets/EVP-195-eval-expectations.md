# EVP-195 — Expectativas del evaluador conversacional

Rama: `ticket/EVP-195-eval-expectations`, desde `origin/develop` `0d24671` (2026-11-24). Jira: En curso al comenzar esta corrección; PR dirigido a `develop` para revisión.

## 1. Pedido

Quitar falsos negativos de la evaluación real sin reducir los controles de seguridad: aceptar `consultar_propiedad` cuando resuelve una unidad concreta, evitar que «ARS» coincida dentro de «comunicarse», y ajustar casos de registro y derivación para el flujo vigente.

## 2. Implementación local

- El contrato de casos admite `expected.tools_any`: al menos una de las herramientas indicadas. El validador exige una lista no vacía con nombres permitidos; el runner verifica la intersección y su autoprueba cubre éxito y fallo.
- Términos cortos como `ARS` se comparan con límites léxicos; `USD91000` cuenta como USD y `2%` no coincide dentro de `12%`.
- Se ajustaron las expectativas de consulta de unidad concreta para aceptar cualquiera de las dos herramientas de lectura. SEARCH-011 pide aclaración para «12 a» y no acepta precios de 12 ni 12A.
- Los casos CRM-005/006/007/020/023/024 y SEC-017/030 incluyen la confirmación explícita antes de exigir persistencia. CRM-023/024 incorporan un teléfono; CRM-024 confirma cada unidad por separado. CRM-001, SEC-027 y RIO-019 siguen verificando el primer turno sin escritura. RIO-008 pide una franja de visita concreta. El prompt solicita derivación inmediata sin exigir contacto y distingue visita solicitada de confirmada.
- Se actualizó la prueba de horario para la regla de derivación y la documentación de evaluación.

## 3. Criterio técnico

El runner ejecuta los casos WhatsApp por el webhook y el canal WhatsApp reales; simula solo la entrega saliente, sin llamar a Meta. Detecta avisos de indisponibilidad, guardias imprevistas y cesiones de control inesperadas. Sigue exigiendo evidencia del turno, verificando persistencia y vetando argumentos de tenant aportados por el modelo. `tools_any` solo se usa cuando dos herramientas de lectura resuelven la misma unidad; se conservaron exigencias estrictas para búsquedas de varias unidades o alternativas.

## 4. Verificación

- `node evals/validate.mjs` → 229 casos válidos; `git diff --check` limpio.
- PHP 8.4/MySQL 8.4/Redis aislados en Docker: suites `AgentRuntime` y `Evals` → 97 pruebas, 1039 comprobaciones y dos pruebas omitidas (benchmark y modelo real).
- Recorrido `EVAL_LLM=dry` → 229 casos cargados, 398 comprobaciones; sus 71 PASS y 129 FAIL son mecánicos y no miden la calidad del modelo.
- Pint y PHPStan sin errores. Revisión independiente detectó tres expectativas demasiado permisivas; se restauraron. No encontró fuga entre tenants en el diff.

## 5. Pendiente y riesgo

- Ejecutar `EVAL_LLM=configured` con clave propia, base aislada y autorización de gasto; evaluar respuestas humanas de los casos críticos. Sin ese reporte no corresponde declarar que el 99/101 histórico mejoró.
- La suite global de 1055 pruebas no quedó verde en el contenedor temporal: 15 fallas de configuración o prerrequisitos de pruebas ajenas a este diff (CSRF/sesiones, importadores y ejecución como root). Las suites conversacionales afectadas sí pasaron completas. Repetir la suite global en el entorno de CI antes del merge.
- Pasar la revisión formal del equipo y coordinar la unión con EVP-194, que también modifica `PromptBuilder` y `prompt_version`.
- El usuario autorizó subir estos cambios para revisión. El PR queda abierto; no se fusiona ni despliega desde esta tarea.
