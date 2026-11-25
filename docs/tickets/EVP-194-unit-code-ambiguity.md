# EVP-194 — Códigos de unidad ambiguos

Rama: `ticket/EVP-194-unit-code-ambiguity`, desde `origin/develop` `0d24671` (2026-11-24). Jira: En curso al comenzar esta corrección; PR dirigido a `develop` para revisión.

## 1. Pedido

Evitar que una consulta por la unidad 12 se responda con datos de 12A o 12B. Caso observado: «y el 12 a secas cuánto sale en verdes?»; el precio correcto del fixture es USD 85.000. Cubrir variantes, aislamiento de tenants y regresión de búsqueda.

## 2. Implementación local

- `ToolGateway` contrasta el código de unidad solicitado por la herramienta con el último mensaje entrante del mismo tenant y conversación. Resuelve también `property_id` al código del mismo tenant antes de comprobarlo. Rechaza códigos parecidos y negados con `VALIDATION_ERROR`.
- Una búsqueda general con una sola unidad mencionada se restringe al código indicado. Se reconocen «a secas», «sin letra», «solo», código con letra mayúscula separada, «doce» y correcciones explícitas. Si el código no existe, devuelve resultados vacíos; no sustituye por una unidad parecida.
- El prompt exige distinguir 12, 12A y 12B. Se añadieron RIO-023 a RIO-026 y se ajustó SEARCH-011, cuyo «12 a» era ambiguo. SEARCH-038 ahora trata «doce» como la unidad 12, igual que RIO-024.
- `AgentTurnTest` cubre código y UUID, búsqueda sin filtro, negaciones, código inexistente, sufijo separado, «bis», números de un dígito, expresiones habituales («2 amb.», «7 de Colinas», «12 y 12A», «12 a las 10») y aislamiento de otro tenant.
- Tras la revisión de Mauro, `ToolGateway` normaliza «12 A» antes de validarlo y resolverlo en ambas herramientas. La aclaración por letra separada se limita al final de la cláusula, de modo que «12 a cuánto», «12 a la tarde» y «12 o el 12A» no se bloquean; «12 b?» se trata igual que «12 a?».

## 3. Criterio técnico

La identidad de la unidad se comprueba antes de devolver hechos al modelo. La búsqueda sigue usando el inventario vivo y el filtro por tenant existente; no se guardan precios ni se añaden índices paralelos. El reconocimiento lingüístico cubre las formas observadas y sus variantes explícitas; expresiones libres no previstas todavía requieren evaluación con modelo real.

## 4. Verificación

- Dataset: `node evals/validate.mjs` → 233 casos válidos.
- PHP 8.4/MySQL 8.4/Redis aislados en Docker: suite `AgentRuntime` tras la corrección → 96 pruebas, 1055 comprobaciones y un benchmark omitido.
- Pint y PHPStan sin errores sobre el diff final. SHA-256 del baseline SQL intacto: `4c8b170bc6f8b6827e9b85e756acb2254ccf392b0ff4c11459c775366bae472d`.
- Revisión independiente de seguridad y tenants detectó y motivó controles para UUID, búsqueda general, negación y código largo; volvió a revisar esos recorridos sin hallar un escape concreto restante. El aislamiento de tenant no mostró una fuga.

## 5. Pendiente y riesgo

- Ejecutar `EVAL_LLM=configured` con clave propia y base aislada, previa autorización de gasto según `evals/README.md`; comprobar RIO-003 y variantes con el modelo real y SEARCH-001 sin regresión. La prueba determinista no demuestra que el modelo responda el precio correcto.
- Pasar por la revisión formal del equipo y el gate de casos críticos. Coordinar la unión con EVP-195: ambas ramas cambian `PromptBuilder` y `prompt_version`.
- El usuario autorizó subir estos cambios para revisión. El PR queda abierto; no se fusiona ni despliega desde esta tarea.
