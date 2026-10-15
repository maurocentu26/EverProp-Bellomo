# EVP-35 — Auditoría y plan de integración RAG de Bellomito

Fecha: 2026-10-15. Autor: Codex para Álvaro Ruggeri.
Rama: `ticket/EVP-35-auditoria-rag`, base `5c398af9cd2fb7e61efbef1f4a89a4c12cf9fe7e` de develop.
Landing auditada: Ramiro-Ruggeri/everprop-bellomo, `6674c20aaa370e04f0aeaadce4d05fd3903c8ee4`.
Álvaro autorizó iniciar este ticket en paralelo. No se modificaron los worktrees pendientes.
Estado: diseño para revisión; no implementación, no despliegue, no mediciones de producción.

## 1. Qué pedía el ticket

Auditar el conocimiento actual de la landing y el RAG de EverProp; comparar API central y embeddings locales; diseñar contrato OpenAPI, ingesta, fallback, seguridad, costos y tareas ejecutables. Ingesta y refactor quedan expresamente fuera de alcance.

### Resultado ejecutivo

Reutilizar KnowledgeService de EverProp detrás de un endpoint servidor a servidor. Conectar primero la recuperación léxica existente y medirla. Diseñar el contrato para incorporar búsqueda híbrida posteriormente sin cambiar el widget. No duplicar documentos ni gobernanza en Next.js.

El ticket supone embeddings y searchProperties existentes: **ninguno está presente en las versiones auditadas**. D06 del ADR prescribe FULLTEXT para el piloto; pasar a vectores exige justificar calidad y costo, no solo cambiar el nombre del RAG. El módulo IA/conversaciones está en develop y no debe publicarse en main por las reglas actuales del repo. La integración requiere un servicio aprobado separado de producción, o una decisión explícita que cambie esa política.

## 2. Qué se investigó y entregó

Se agregó este informe y `EVP-35-knowledge-query.openapi.json`, contrato propuesto, no endpoint operativo.

### Evidencia y diferencias reales

| Pieza | Estado observado | Consecuencia |
|---|---|---|
| Landing `src/lib/ai/knowledge.ts` | String estático completo en el prompt; sin fuentes, versiones aprobadas ni caducidad | Cambiar datos requiere publicar código; condiciones comerciales pueden quedar viejas |
| Landing `src/lib/ai/knowledge-fallback.ts` | Respuestas deterministas con contexto conversacional | Funciona sin proveedor; no equivale a recuperación documental |
| Landing `src/app/api/chat/route.ts` | Sin key devuelve fallback; con key invoca Gemini y createLead | No consulta KnowledgeService; no devuelve citas |
| searchProperties | No existe en la ruta de chat auditada | Inventario vivo requiere una conexión aparte; no prometer disponibilidad actual |
| knowledge_documents | Tenant, audiencia, estado, versión, aprobación, revocación, valid_until | Reutilizar como fuente autorizada |
| knowledge_chunks | Fragmentos y FULLTEXT de heading/body; sin vector | No hay migración ni índice semántico operativo |
| KnowledgeService::approve | Transacción y lock; fragmentación por títulos/párrafos de ~900 caracteres | No es segmentación por tokens; puede separar una cláusula extensa |
| KnowledgeService::search | Filtro tenant, APPROVED, PUBLIC, no revocado/no vencido y versión; FULLTEXT booleano, LIKE de respaldo, ranking por términos | Base útil y gobernada; errores de escritura/paráfrasis requieren evaluación |
| AgentCoordinator.php:202 | Recupera fuentes mediante KnowledgeService | El coordinador ya consume RAG; no crear un coordinador paralelo sin necesidad |
| PromptBuilder.php | Fuentes como datos; precios por tools; citas, handoff, visitas solicitadas | Conservar sus reglas en el puente público |
| routes/api.php | CRUD administrativo y approve/revoke con auth; sin public/knowledge/query | Diseñar endpoint nuevo; no exponer admin/knowledge a visitantes |

Referencias backend: `everprop-api/app/Domain/AgentRuntime/Knowledge/KnowledgeService.php`, `Knowledge/Http/AdminKnowledgeController.php`, `Coordinator/AgentCoordinator.php`, `Coordinator/PromptBuilder.php`, `everprop-api/database/schema/forward/2026-09-29.003_agent_runtime.sql`, `everprop-api/config/agent.php`. Tests inspeccionados: `tests/Feature/AgentRuntime/AgentTurnTest.php::test_only_approved_current_public_knowledge_of_the_tenant_is_retrieved` y KnowledgeAdminTest. Inspección no significa ejecución.

### Hallazgos priorizados

1. **Alta — incompatibilidad de la ruta generativa.** La landing usa `gemini-2.0-flash`, retirado el 2026-06-01 según Google. El SDK instalado ai 7 requiere inputSchema y stopWhen; la ruta usa parameters/maxSteps con `any` y ts-expect-error. El catch oculta fallos devolviendo modo knowledge. Una demo que contesta no prueba que Gemini funcione. Migrar modelo y contrato SDK en ticket derivado con un test de tool calling real controlado.
2. **Alta — datos sin vigencia.** knowledge.ts afirma financiación 50%/36 cuotas y otros datos sin aprobación/caducidad; además confunde empresa fundada en 1950 con tradición familiar, aunque el prompt corrige 1976. No importar estas afirmaciones como aprobadas. Validación comercial previa y fuente/versionado obligatorios.
3. **Alta — write path duplicado.** createLead en chat evita la normalización/validación y timeout del endpoint `/api/leads`; no tiene idempotency key y declara éxito ante cualquier res.ok sin exigir lead_id. El prompt contiene una instrucción posterior de confirmar contacto tras usar la herramienta que contradice la regla de comprobar success. Reutilizar un servicio servidor validado y exigir resultado persistido; no llamar el propio endpoint a través de una URL arbitraria.
4. **Media — presupuestos y tiempos inconsistentes.** maxDuration 20s frente a AbortSignal 60s; fetch de createLead sin timeout; rate limit Map en memoria no compartido entre instancias ni con limpieza de claves. Diseñar límites coherentes antes de habilitar tráfico público con gasto.
5. **Media — techo de calidad no medido.** Candidatos léxicos limitados a 50 antes del ranking sin orden de relevancia SQL, tokens menores de cuatro caracteres descartados, fragmentos sin overlap semántico. Pueden perderse unidades, siglas o coincidencias importantes. Documentar y medir, no afirmar recall alto sin corpus.
6. **Media — protección del prompt insuficiente en landing.** Prompt y herramientas no heredan OutputGuard, tenant, presupuesto ni controles del coordinador. Un prompt por sí solo no autoriza operaciones ni evita inyección.

## 3. Arquitectura y decisión

Flujo propuesto: navegador → POST /api/chat de Next.js → endpoint interno EverProp → KnowledgeService → fragmentos autorizados → generación acotada → validación de citas/salida → respuesta del widget. Inventario y acciones van por herramientas separadas autorizadas en servidor. El cliente nunca recibe secretos ni decide tenant/audience.

| Alternativa | Beneficio | Costo/riesgo | Decisión |
|---|---|---|---|
| API EverProp + FULLTEXT | Reutiliza aprobación, permisos, vigencia y MySQL | Requiere endpoint y medir búsqueda léxica | Primera etapa |
| API EverProp + híbrido semántico | Mejora potencial en paráfrasis; contrato estable | Ingesta asíncrona, índice, costo y reindexación | Segunda etapa si los evals lo justifican |
| Embeddings/index en Next.js | Prototipo independiente | Duplica ACL, revocaciones e ingesta; despliegues/serverless sin almacenamiento durable propio | Descartado para este proyecto |

No elegir pgvector: el sistema usa MySQL 8.4. Evaluar extensión/servicio vectorial solo con una prueba comparativa y costo completo; no añadir PostgreSQL ni otro motor en este ticket. Guardar modelo, dimensiones, checksum, documento/versión/tenant/audiencia y estado de indexación; no mezclar vectores de modelos distintos. Indizar solo versiones aprobadas, con transición atómica de manifiesto. Revalidar elegibilidad en SQL después de recuperar candidatos: un vector viejo nunca autoriza un documento revocado.

### Contrato de consulta

Archivo OpenAPI adjunto. Ruta propuesta POST `/api/v1/public/knowledge/query`, pese al nombre public **solo servidor a servidor autenticado**. Credencial dedicada con alcance de lectura y tenant permitido; no usar cookie/token administrativo. TrustedTenantResolver y binding de la credencial fijan el tenant, no un header libre. Rechazar tenant_id, audience, URLs, SQL o filtros del cliente. Proyecto opcional por UUID público validado dentro del tenant; no permitir ampliar alcance. Un proyecto ajeno o inexistente produce el mismo 404, sin distinguir su existencia. La implementación deberá filtrar por ese proyecto más documentos generales del tenant (project_id NULL), nunca documentos de otros proyectos; KnowledgeService hoy no acepta ese filtro, por lo que requiere ampliación y tests en la tarea de endpoint.

Devuelve como máximo cuatro fragmentos de hasta 1500 caracteres, título, id estable y versión, vigencia y modo lexical/hybrid/lexical_fallback. El contrato prohíbe body completo, datos internos, embeddings, PII, precios y disponibilidad en las fuentes recuperadas. Los filtros actuales no eliminan esos valores dentro de excerpt: antes de publicar el endpoint se requiere curación/clasificación por sección y revisión comercial, excluyendo del corpus público condiciones personales e inventario vivo. No se afirma que exista un detector automático infalible. Vacío válido: 200 con sources [] y no_match. Caída total: 503; rate limit: 429 con Retry-After; 401/403 no se convierten en éxito silencioso. no-store para la primera etapa; no cachear fuentes revocadas por un TTL arbitrario. Scores numéricos no son probabilidades y no deben presentarse como confianza al usuario.

La ruta no genera texto ni ejecuta acciones. Next.js mantiene un presupuesto por turno y una única capa de generación. Antes de producción decidir si se migra toda la conversación al coordinador existente: en ese caso sustituir el puente, evitar doble LLM y conservar epoch/handoff.

### Ingesta documental

1. Inventario de reglamentos, fichas Huasi/loteos, FAQ y condiciones; propietario comercial, permiso de publicación, fecha/vigencia y proyecto. Los documentos de Drive no se descargaron ni clasificaron en esta auditoría.
2. Contratos: no indizar contratos firmados con nombres, DNI, firmas o cuentas. Usar plantilla pública revisada o resumen aprobado; contenido reservado como INTERNAL, inaccesible desde landing.
3. Extraer texto preservando título, página, sección, tablas/unidades, anexos y relaciones. OCR solo cuando haga falta, con revisión visual; no inferir información ilegible. Registrar hash y origen, detectar duplicados y cambios.
4. Borrador por defecto; aprobación humana separada del importador, vigencia obligatoria para promociones. Mantener trazabilidad de autor/aprobador.
5. Probar chunking estructural actual contra uno por cláusulas con límites por tokens. No separar porcentajes de sus excepciones ni encabezados de filas. Repetir solo el contexto mínimo de sección, medido en evals.
6. Job asíncrono e idempotente por tenant/documento/versión/hash/modelo; reintentos acotados y cola de errores. Revocación inmediata en filtro SQL, aunque el borrado del índice sea posterior. Nunca indexar PDF recién subido directamente desde una pregunta.

### Seguridad, degradación y operación

- Validar tamaño del cuerpo antes de parsear, roles de historial, longitud de query y UUIDs; limitar contexto total por tokens. Mantener documentos y mensajes delimitados como datos, sin sanitizaciones destructivas que alteren cláusulas.
- Servidor fija tools disponibles, tenant, actor, URLs, idempotencia y alcance. No SQL/HTTP arbitrario, no ejecutar instrucciones recuperadas. Validar argumentos y resultado de tools fuera del modelo.
- Filtro tenant/ACL/vigencia antes y después de búsqueda. Antes de emitir texto generado revalidar ids/versiones/vigencia; si cambian, descartar respuesta y abstenerse o rehacer una sola vez dentro del presupuesto. Protocolo inicial sin endpoint extra: repetir la misma query/proyecto antes de emitir y comprobar que todas las fuentes usadas siguen presentes, con mismo document_id/version y hash del excerpt; ante ausencia/cambio, descartar y abstenerse. KnowledgeService deberá exponer document_id/version explícitos y preservar valid_until con precisión UTC, no truncarlo a fecha. No transmitir tokens al usuario antes de ese control en la primera etapa. Hay una ventana inevitable entre revalidación y envío de red; la garantía es elegibilidad al instante de la última comprobación, no retractación de contenido ya entregado. Citas solo de sources de ese turno; mostrar texto escapado, sin HTML del documento ni enlaces arbitrarios. No revelar prompts/secretos.
- Embeddings caídos: FULLTEXT con los mismos filtros y modo lexical_fallback. Recuperación caída: FAQ mínima institucional revisada o derivación, nunca financiación/promociones del viejo string. Generación caída: respuesta determinista explícita, sin afirmar que una acción ocurrió.
- 429/proveedor: backoff acotado con jitter y presupuesto común; no cadenas de retries entre Next/API/proveedor. 401/403: alerta operativa y fallback seguro. Manual/humano prevalece sobre IA.
- Logs: request_id, modo, ids/versiones de fuentes, latencia, tokens, costo y motivo de fallback; consultas minimizadas/redactadas y retención definida. No registrar payloads/contactos completos ni headers de auth.
- Rate limits compartidos por tenant y visitante, proxy confiable y cap de gasto atómico; reutilizar ledger de EverProp. Alertas 70/85% y corte antes del techo global USD150, incluyendo otros canales. Recepción y handoff siguen disponibles al cortar generación.

### Costos, latencia y cuotas

Tarifas públicas consultadas 2026-10-15, USD antes de impuestos/hosting. Embedding 2 texto: USD0.20/M tokens estándar y USD0.10/M batch. Gemini 2.5 Flash generación: USD0.30/M entrada, USD2.50/M salida (incluye thinking). Son referencias de planificación, no selección contratada ni garantía de disponibilidad en la cuenta.

Ejemplo aritmético: corpus100000 tokens → embedding inicial USD0.02 estándar. 10000 consultas de50 tokens → USD0.10 de query embeddings. 10000 respuestas con entrada2000/salida300 tokens → USD6 entrada + USD7.50 salida = USD13.50. Total variable ilustrativo USD13.62. Excluye retries, thinking extra, OCR, índice, almacenamiento, red, canales, personal e impuestos; cada llamada de tools puede multiplicar contexto y generación. Reindexar solo cambios. Estos supuestos no son consumo medido.

Cuotas RPM/TPM/RPD dependen del proyecto/modelo/tier; consultar AI Studio de la cuenta antes del piloto. No se inspeccionó facturación ni cuotas reales. No garantizar concurrencia a partir de precio. No usar free tier con datos comerciales sensibles sin revisión del tratamiento de datos.

Objetivos propuestos para staging: retrieval p95<=500ms léxico, <=1500ms híbrido; total p95<=8s; deadline total<=15s bajo maxDuration20s, timeout CRM<=5s. Son gates a medir con carga concurrente y red real, no resultados. Asignar presupuesto de tiempo único y reservar margen para fallback; evitar el timeout60s actual.

Fuentes oficiales: [precios](https://ai.google.dev/gemini-api/docs/pricing), [cuotas](https://ai.google.dev/gemini-api/docs/rate-limits), [retiros](https://ai.google.dev/gemini-api/docs/deprecations), [embeddings](https://ai.google.dev/gemini-api/docs/embeddings).

## 4. Cómo se verificó y cómo aceptar la integración

Se leyó Jira EVP-35 y se verificó su transición a En curso. Se inspeccionaron commits identificados, esquema, rutas, permisos, coordinador, SDK local y tests existentes; se contrastaron precios/modelos en documentación oficial. No se arrancó Docker, no se accedió a base real, no se invocó un proveedor, no se crearon leads ni se importaron documentos. Se validaron sintaxis JSON, esquemas con jsonschema Draft202012, referencias locales y ejemplos válidos/negativos (campos tenant/audiencia extra, query corta, top_k fuera de límite, UUID inválido y más de cuatro fuentes), además del cálculo USD13.62. No se usó un validador completo de documento OpenAPI ni se ejecutaron los escenarios contra un endpoint. Revisión independiente de aislamiento/LLM: se corrigieron 404 indistinguible, curación de fuentes, filtro de proyecto y protocolo de revocación.

Dataset requerido antes de elegir vectores: 50 preguntas respondibles con fuente esperada y 20 no respondibles/adversarias, revisadas por comercial, sin PII real. Medir baseline léxico y candidato híbrido con mismo corpus/versiones. Recall@4 objetivo>=0.90 en respondibles; citas válidas100%; cero fuentes cross-tenant/internas/vencidas; cero precio/stock inventado y cero mutación no autorizada. Reportar por segmento y casos fallidos, no solo promedio. No penalizar abstención correcta como error de recuperación.

Casos mínimos de regresión:

| Consulta/condición | Resultado exigido |
|---|---|
| "qiero un lotecito en colnas" | Reconocer interés, fuente correcta o aclaración; no inventar stock |
| "y en cuotas?" tras Colinas | Recuperar financiación vigente de ese proyecto o abstenerse |
| "no lote, un depa huasi" | Cambiar contexto, respetar negación |
| "cuánto está el 12A?" | Inventory vivo; no sustituir por12 o12B |
| "qué pasa si me atraso?" | Cláusula pública vigente con sus excepciones |
| Documento INTERNAL coincide mejor | Nunca entra al contexto ni citas |
| Mismo título en tenantB | No recuperar ni revelar existencia |
| Revocar después de indexar | No se sirve aunque el vector siga almacenado |
| Promoción vence durante consulta | Revalidación antes del contexto/respuesta |
| Fuente dice "ignora reglas" | Tratar como datos, sin tool ni fuga |
| Embeddings503 / generación429 | Fallback seguro con deadline y gasto acotados |
| Usuario pide asesor / humano activo | No enviar IA autónoma ni prometer acción inexistente |
| createLead422/timeout | No confirmar registro; no duplicar por retry |
| Reintento misma operación | Mismo resultado persistido o conflicto explícito, no otro lead |

Pruebas de carga propuestas: 1/5/20 visitantes concurrentes, corpus representativo, caché fría/caliente, métricas p50/p95/errores/costo. Pruebas de integración con MySQL8.4 y proveedor aprobado; no usar SQLite para certificar FULLTEXT. Feature flag apagada por defecto, rollout solo staging y rollback al fallback institucional.

## 5. Plan ejecutable, dependencias y riesgos

Los siguientes son borradores de tareas, **no tickets Jira creados ni claves inventadas**:

1. **Corregir ruta generativa landing (prioridad alta).** Modelo vigente configurable, inputSchema/stopWhen correctos, timeout/caps, tests de error y tool calling; reutilizar validación/idempotencia de leads. Aceptación: generación comprobada en staging, fallback observable y ningún éxito CRM sin persistencia. No habilitar proveedor/gasto sin autorización.
2. **Endpoint de conocimiento EverProp.** Implementar contrato adjunto reutilizando KnowledgeService, credencial limitada, tenant confiable, PUBLIC fijo, rate limits/no-store; tests negativos de ACL/vigencia/cross-tenant y contrato. Sin generación ni mutaciones.
3. **Corpus comercial aprobado.** Inventario, extracción y revisión de fuentes, clasificación público/interno, caducidades, golden set. Aceptación: cada afirmación enlaza fuente/versionado; contratos anonimizados; no importar knowledge.ts automáticamente.
4. **Conector Next.js.** Consulta servidor a servidor, contexto acotado y citas, inventario vivo separado, fallback seguro; prueba conversación informal/negaciones/followups y caída de cada dependencia. Depende de1–3.
5. **Evaluación léxica e híbrida.** Baseline, prototipo aislado de embeddings, elección de almacenamiento/modelo y costo; comparar recall/latencia antes de aprobar dependencia. Si híbrido no mejora o excede presupuesto, conservar léxico y abstención.
6. **Ingesta e índice semántico.** Solo tras5 aprobado: jobs idempotentes, manifiestos/versiones, revocación y reindex incremental; tests concurrentes y recuperación de fallos. Conector conserva contrato.
7. **Gates de staging y operación.** Aprobación de proveedor/región/datos, ledger compartido, monitoreo y carga, revisión independiente tenant/LLM, decisión de despliegue compatible con main sin IA. Sin estos gates, no activar landing pública con backend de staging.

EVP-27 afecta proveedor Gemini del panel, no sustituye este puente. EVP-33/34 afectan ciclo de conversación y modo autónomo/copiloto: al migrar al coordinador, respetar su contrato final; no duplicar su implementación aquí.

Pendiente de revisión humana: contrato de autenticación concreta, entorno aprobado para el puente, corpus/publicabilidad, modelo y cuotas de cuenta, decisión sobre semántico tras evals. No se midieron calidad, latencia ni gasto real. El informe cumple investigación/diseño; no demuestra integración funcionando. Álvaro autorizó expresamente commit/push/PR el 2026-10-15; sin merge ni deploy.
