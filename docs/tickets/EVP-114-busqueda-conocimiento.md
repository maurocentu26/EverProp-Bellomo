# EVP-114 — Búsqueda de Conocimiento IA: el fragmento correcto aunque haya muchos y aunque el cliente repregunte

Rama `ticket/EVP-114-busqueda-conocimiento` (desde `develop` `81de372`) · commits: pendiente (sin commit, a pedido) · fecha 2026-11-14 (correcciones de revisión 2026-11-15) · autor: Claude (agente `agent-runtime-engineer`) para Ramiro Ruggeri

## 1. Qué pedía el ticket

Que el asistente encuentre el fragmento correcto de Conocimiento IA aunque el tenant tenga muchos documentos y aunque el cliente repregunte sin repetir el tema ("¿y tiene alguna promoción?").

Problemas de `develop`:
- `KnowledgeService::search` traía 50 candidatos sin ordenar (`MATCH ... IN BOOLEAN MODE` en el WHERE no ordena) y recién después puntuaba: con muchos fragmentos que comparten palabras, el correcto quedaba afuera.
- `AgentCoordinator::converse` armaba la consulta con `array_slice(..., -2)` sobre turnos que alternan cliente/asistente: en la práctica, solo el último mensaje del cliente.
- El puntaje usaba `str_contains` ("casa" coincidía con "casamiento") y todas las palabras pesaban igual.

Criterios: (1) ordenar por relevancia antes de cortar, desempate determinista; (2) la consulta usa los dos últimos mensajes del cliente (nunca asistente, asesor ni nota), el más reciente primero, dentro de 300 caracteres; (3) palabra completa con plural simple, sin acentos ni mayúsculas; (4) palabras raras del conocimiento del tenant pesan más; (5) test con 60+ fragmentos que falla con `develop` y test de repregunta; (6) aislamiento intacto (otro tenant, borradores, revocados, vencidos); (7) p95 < 50 ms con 2.000 fragmentos en MySQL 8.4 local, medido, sin test de tiempo en CI; (8) casos de repregunta en `evals/cases/search.jsonl`; (9) pint, phpstan y suite completa.

Fuera de alcance: embeddings/vectores, reescritura de la consulta con un modelo, cambios de esquema, citas y `OutputGuard` (EVP-113).

## 2. Qué se implementó

- `everprop-api/app/Domain/AgentRuntime/Knowledge/KnowledgeService.php`
  - `:90` `search($tenantId, $query, $audiences, $limit, $previous)`: `$query` es el mensaje nuevo del cliente y `$previous` el anterior; entre los dos, 300 caracteres, el nuevo primero.
  - `:91-112` términos: palabras de 4 o más letras, en minúsculas, sin acentos (NFKD), sin palabras vacías, como máximo 12 distintos (`MAX_TERMS`, `:23`), primero los del mensaje nuevo. Cada uno con su plural/singular simple (`forms()`, `:170`). Pesos: mensaje nuevo ×1, anterior ×0,5. Si el mensaje nuevo nombra un proyecto del tenant (palabra que aparece en un solo nombre de `projects`, `:96-98`), el anterior se descarta y ese nombre pesa ×2 (`:99-110`). Nada del texto del usuario llega a SQL.
  - `:114-129` lee los fragmentos aprobados, vigentes, no revocados, de la versión actual, del tenant y la audiencia (filtros en SQL), con tope duro igual a la cuota (`orderBy('c.id')->limit($max)`); si se alcanza, `Log::warning('knowledge.search.cap_reached', [tenant_id, cap])`, sin contenido.
  - `:131-141` palabra completa: una regex literal por término (como máximo 12) sobre el texto en NFKC, que ignora mayúsculas y acentos (`[aá]`, `[nñ]`…) y exige que no haya letra ni dígito pegado (`casa` no es `casamientos`).
  - `:143-151` peso por rareza dentro del tenant, `idf = ln(1 + fragmentos / fragmentos con el término)`. Orden: puntaje, aciertos del mensaje nuevo, aciertos en el título, `public_id`, `ordinal`. Recién ahí se corta a `limit`.
  - `:42-71` `approve()`: bloquea primero la fila del tenant y después el documento; si los fragmentos aprobados de los otros documentos más los de éste superan `agent.knowledge_max_chunks`, `ValidationException` → 422 con mensaje claro.
  - `:189` `words()` (normaliza términos y nombres de proyecto), `:201` `has()`, `:207` `nfkc()`, `:213` `checked()`: un `preg_*` o una normalización que fallan se registran con `preg_last_error_msg()`, sin texto.
- `everprop-api/app/Domain/AgentRuntime/Coordinator/AgentCoordinator.php:216-217` pasa a `search()` los dos mensajes por separado; `:499` `clientMessages()`: los dos últimos mensajes `INBOUND` de esta conversación con `sequence <= inputSequence`, el más reciente primero. Asistente, asesor (`OUTBOUND`) y notas (`INTERNAL`) nunca entran.
- `everprop-api/config/agent.php:18-19` `knowledge_max_chunks` (2.500, `AGENT_KNOWLEDGE_MAX_CHUNKS`). `everprop-api/routes/api.php:140-141` `throttle:30,1` en `POST /knowledge` y `/approve`.
- `everprop-api/tests/Feature/AgentRuntime/AgentTurnTest.php`:
  - `:565` 69 documentos aprobados (64 de "lote/cuotas") más borrador, vencido, revocado, aprobado y devuelto a `DRAFT` por SQL (`:590`), un fragmento de versión anterior (`:592`), el mismo texto en otro tenant y 600 fragmentos de otro tenant con "Arenales". El correcto va primero, la palabra rara le gana a dos frecuentes, nada de lo excluido vuelve (ni con `limit` 1000), el orden es estable, `casa` no trae `casamientos`, `FINANCIACIONES` y `cuota` encuentran `Financiación`/`cuotas`.
  - `:625` repregunta de punta a punta por el widget, con nota interna en medio y un mensaje largo que deja afuera al anterior.
  - `:662` cambio de proyecto: con proyectos Arenales, Loteo Norte y El Pinar, "¿Y el Pinar tiene promoción?" después de "Contame de los lotes en Arenales" pone los dos fragmentos del Pinar por encima de la promo de Arenales; "¿y en cuotas?" después de Arenales trae primero la financiación de Arenales.
  - `:693` `clientMessages()` (por reflexión): ignora un `INBOUND` posterior al turno y el de otra conversación del mismo tenant.
  - `:722` 12 términos como máximo (el 13.º no se busca), NFKC (`ＣＵＯＴＡＳ`), falla de regex registrada y tope de lectura con `Log::warning`.
  - `:757` benchmark opcional (`KNOWLEDGE_BENCH=1` o `=flat`), salteado en CI. Solo corre si la base termina en `_test` (`:763`); marca sus tenants con slug `evp114-bench-<id>` y borra por ese prefijo los de una corrida cortada (`:766-769`); mide también el mensaje hostil de la revisión (`:815`).
- `everprop-api/tests/Feature/AgentRuntime/KnowledgeAdminTest.php:44` aprobar por encima de la cuota → 422 y el documento queda en `DRAFT`; reaprobar el mismo documento no cuenta dos veces sus fragmentos.
- `evals/cases/search.jsonl:61-65` SEARCH-061 a 065 (065: cambio de proyecto dentro de la ventana de dos mensajes, crítico, `test`); `evals/README.md:9` 209 casos.
- Docs: `docs/eversys-conversations/adr.md:12`, `architecture.md:7` y `:9`, `data-and-contracts.md:54` y `:56`, `implementation-status.md:42`.
- Sin cambios de esquema. Configuración nueva: `AGENT_KNOWLEDGE_MAX_CHUNKS` (opcional, 2.500 por defecto).

## 3. Por qué esta solución

Mediciones (MySQL 8.4 local, contenedor `everprop-rag-php114`, tabla con 4.000 fragmentos: 2.000 del tenant medido y 2.000 del tenant sintético 986; 300 búsquedas tras 20 de calentamiento, 6 consultas rotando; máquina compartida con otros agentes, hay ruido):

| Estrategia | Corpus Zipf (realista) p50 / p95 | Corpus plano (adversarial) p50 / p95 |
|---|---|---|
| `develop` (MATCH booleano, `LIMIT 50`, sin orden) | 52,4 / 73,5 ms | 49,9 / 70,2 ms |
| MATCH sin tope + bandera por término (`MATCH > 0`) y ranking en PHP (agente anterior) | no medido | 121,6 / 195,9 ms |
| MATCH sin tope + ranking en PHP con regex | 68,3 / 95,9 ms | 101,3 / 157,2 ms |
| Sin MATCH, regex por término sin tope de términos (primera entrega) | 20,8–27,4 / 33,7–40,3 ms | 25,3–30,1 / 43,3–53,8 ms |
| Sin MATCH, cada fragmento a un set de palabras normalizadas (pedido de la revisión) | 57,7–60,3 / 76,4–76,7 ms | 57,3–66,2 / 74,2–91,4 ms |
| **Sin MATCH, regex literal por término, máx. 12 términos, NFKC, cuota (entrega final)** | **28,0–30,9 / 39,1–50,5 ms** | 28,9–32,2 / 43,2–48,4 ms |

Mensaje hostil de la revisión (60 palabras distintas cargadas de vocales, como mensaje nuevo y anterior; 100 búsquedas): antes ~446 ms según la revisión; con el set de palabras p95 82–94 ms; **final p95 59,4–75,9 ms** (12 términos).

- El costo está en `MATCH`, no en traer los textos: con términos comunes la búsqueda FULLTEXT sola tarda ~30 ms con 2.000 filas en la tabla y ~60–90 ms con 4.000 (recorre las entradas de todos los tenants); traer las 2.000 filas del tenant tarda ~10 ms. Ni `develop` cumplía p95 < 50 ms.
- La relevancia de MySQL usa IDF sobre todos los tenants; probado: si un término está en todas las filas, `MATCH` devuelve 1,9e-9.
- Set de palabras contra regex por término (sobre 2.000 fragmentos, 12 términos): plegar y partir cada fragmento cuesta 38–41 ms; 12 regex literales sobre el texto, 11 ms, más 4 ms del chequeo NFKC. El riesgo de CPU de la revisión venía de la cantidad de términos (60); con el tope de 12 está acotado, y las regex son alternancias literales con lookarounds (sin retroceso catastrófico).
- Peso por rareza calculado sobre el conocimiento del tenant en el mismo recorrido: sin tabla de frecuencias ni forward.
- Reutilizado: los filtros de aislamiento existentes, `chunks()`, el patrón de bloqueo de la fila del tenant (`CollectionsController`) y `throttle:30,1` de las rutas vecinas.
- Corpus del benchmark: Zipf (120 palabras por fragmento de un vocabulario de 3.000; "lote" en ~67 %, nombres de proyecto en 2–4 %) para el criterio 7; el plano (`KNOWLEDGE_BENCH=flat`) es el peor caso.
- Límite conocido (`ponytail:` en `KnowledgeService.php:113-117`): costo lineal en el conocimiento del tenant, acotado por la cuota de 2.500; para crecer, prefiltro FULLTEXT sobre palabras raras o frecuencias por término guardadas.
- Límites menores: plural simple solo (`luz/luces` no); términos de menos de 4 letras ignorados como en `develop`; las clases de acentos de la regex cubren el castellano (`à`, `ê` no).

## 4. Cómo se verificó

### Revisiones independientes y qué cerró cada hallazgo

Revisiones independientes `llm-security-reviewer` y `tenant-isolation-reviewer` sobre la primera entrega: sin fugas ni hallazgos altos.

| Hallazgo | Cambio |
|---|---|
| MEDIO: el tema anterior le gana al nuevo ("¿Y el Pinar tiene promoción?" después de Arenales trae primero la promo de Arenales) | Los dos mensajes van por separado a `search()` (`AgentCoordinator.php:216-217`, `KnowledgeService.php:90`): nuevo ×1, anterior ×0,5, desempate por aciertos del nuevo (`:150`). **Desvío del pedido:** solo con ×0,5 el test pedido falla (comprobado: con `$topics = []`, `test_a_new_project_in_the_follow_up_outranks_the_previous_topic` da `Failed asserting that two arrays are identical`). "Pinar" y "promoción" son, para un buscador léxico, dos palabras raras iguales; la promo de Arenales suma además los términos del mensaje anterior. Se agregó la regla de proyecto (`:96-110`): si el mensaje nuevo nombra un proyecto del tenant (`projects.name`), el anterior se descarta y el nombre pesa ×2. Test `AgentTurnTest.php:662`; eval SEARCH-065. |
| BAJO: CPU controlable por el visitante (~446 ms con 60 términos) | Tope de 12 términos distintos, mensaje nuevo primero (`:23`, `:103`). Texto en NFKC (`:207`) y términos en NFKD sin acentos (`:189`). **Desvío del pedido:** el set de palabras con `isset` se implementó y midió, y era 2–3 veces más lento (tabla de §3, p95 76 ms); quedó la regex literal por término, acotada a 12. Hostil final p95 59–76 ms. Test `:722` (el 13.º término no se busca; NFKC). |
| MEDIO: sin tope de conocimiento | Cuota `agent.knowledge_max_chunks` = 2.500 (`config/agent.php:19`) en `approve()` dentro de la transacción, con bloqueo de la fila del tenant (`KnowledgeService.php:42-71`) → 422; `throttle:30,1` en alta y aprobación (`routes/api.php:140-141`); tope duro de lectura con `Log::warning` sin contenido (`KnowledgeService.php:125-129`). Tests `KnowledgeAdminTest.php:44` y `AgentTurnTest.php:722`. |
| MEDIO: limpieza del benchmark por nombre | Aserción de base `*_test` antes de todo (`AgentTurnTest.php:763`); tenants marcados con slug `evp114-bench-<id>` y borrado por ese prefijo (`:766-769`). Comprobado: después de las corridas quedan 0 tenants `evp114-bench-%`. |
| Huecos de prueba | Documento devuelto a `DRAFT` por SQL y fragmento de versión anterior (`AgentTurnTest.php:590-594`, aserciones con `limit` 1000); `INBOUND` posterior al turno y de otra conversación del mismo tenant (`:693`). |
| INFO: fallas de `preg_*` silenciosas | `checked()` (`KnowledgeService.php:213`) registra `preg_last_error_msg()` sin texto; test por reflexión con UTF-8 inválido (`AgentTurnTest.php:740-744`). |

### Comandos y resultados

Contenedor `everprop-rag-php114` sobre `C:\w114\everprop-api`, base `bellomo_crm_test` (MySQL 8.4) compartida con otro agente.

- Tests de la primera entrega contra `develop` `81de372`: `test_the_right_fragment_survives_many_chunks_that_share_common_words` falla (`Failed asserting that an array contains '<uuid del correcto>'`) y la repregunta falla (`2545 < 2426`; con solo el coordinador de `develop`, `2534 < 2415`).
- Test de cambio de proyecto sin la regla de proyecto: falla (ver §4).
- `php artisan test tests/Unit/AgentRuntime tests/Feature/AgentRuntime`: 125 passed, 1 skipped (el benchmark), 799 assertions.
- Suite completa (`php artisan test`), una vez, antes del ajuste de phpstan en el test (sin cambio de código de producción después): 593 passed, 2 skipped, 5607 assertions, 240 s.
- `vendor/bin/pint --test`: PASS, 347 archivos.
- `vendor/bin/phpstan analyse --memory-limit=1G`: `[OK] No errors` (la corrida anterior marcó 2 errores por `Log::shouldHaveReceived` estático en el test; ahora usa la instancia que devuelve `Log::spy()`).
- `node evals/validate.mjs`: `OK: 209 casos válidos` (search 65/60).
- p95 (criterio 7): tabla de §3, corpus Zipf, dos corridas finales: 39,13 y 50,47 ms; plano: 43,20 y 48,44 ms. Comando: `KNOWLEDGE_BENCH=1` (o `=flat`) `php artisan test tests/Feature/AgentRuntime/AgentTurnTest.php --filter=knowledge_search_benchmark`.
- No verificado: SEARCH-061 a 065 contra un modelo (ni `EVAL_LLM=dry`: el contenedor no monta `evals/`).

## 5. Pendientes y riesgos

- **p95 en el borde:** el corpus realista dio 39 y 50,5 ms en dos corridas, el plano 43–48 ms, con la máquina compartida. Es el costo del NFKC y de los pesos por mensaje sumados a la primera entrega (34–40 ms). Si hace falta margen: bajar `MAX_TERMS` o la cuota, o el prefiltro FULLTEXT sobre palabras raras.
- **Regla de proyecto:** depende de que los nombres de `projects` del tenant coincidan con cómo se nombran en el conocimiento y en el chat. Un proyecto mencionado con un alias que no está en `projects` no dispara el cambio de tema (vuelve al ×0,5). Los alias curados por proyecto (data-and-contracts.md) cerrarían ese hueco.
- **Decisión aceptada (2026-11-14):** búsqueda léxica en PHP sin `MATCH`; el índice `ft_knowledge_chunks_text` se conserva para un futuro prefiltro. Docs: `adr.md:12`, `architecture.md:7` y `:9`, `data-and-contracts.md:54` y `:56`, `implementation-status.md:42`.
- **Tenant sintético 986** (y su "otro tenant" 987) de una corrida cortada del benchmark del 2026-11-07 en `bellomo_crm_test`: revisados con `SELECT` (sintéticos, solo filas de `fixture()` y 2.000 fragmentos "Documento N — sección M"). **No se borraron:** el clasificador de permisos rechazó el `DELETE`. Falta autorización del usuario o que lo borre una persona: `deleteSyntheticTenants([986, 987])`. Siguen inflando la tabla (las mediciones de arriba los incluyen).
- `AGENT_KNOWLEDGE_MAX_CHUNKS` no se agregó a ningún `.env*` (no se leen ni escriben); el valor por defecto aplica.
- Correr SEARCH-061 a 065 con `EVAL_LLM=dry` y, con autorización, con el modelo.
- `AgentCoordinator.php` lo edita también EVP-113: acá cambian las líneas 216-217 y el método `clientMessages()` (`:493-504`); puede haber conflicto textual al integrar.
