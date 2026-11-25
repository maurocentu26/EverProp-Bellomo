# EVP-L200 — Derivación persistida después de consultar inventario

Rama `ticket/EVP-L200-derivacion-persistida`, desde `develop` `9b7259e`. Fecha: 2026-11-25.

## Autorización y alcance

Ramiro autorizó expresamente el ID provisional EVP-L200 en el chat para corregir la derivación, en una rama independiente y sin producción. Aplica la excepción de TICKETS.md; no se creó un ticket en Jira (el conector no tiene sesión). No se autoriza cerrar EVP-193/197 ni aprobar release.

## Problema

Después de consultar inventario, el coordinador deshabilitaba las herramientas en su segunda llamada. El modelo podía prometer una derivación, pero no ejecutarla; el estado persistido seguía AI_ACTIVE. Cambiar solamente el texto del prompt no habilita la acción.

## Cambio

- Después de herramientas exclusivamente de consulta, la segunda llamada puede responder o ejecutar una sola `derivar_a_asesor`.
- Conserva el máximo de dos llamadas normales al modelo y el presupuesto acumulado de herramientas. No hay tercera llamada para despedirse.
- Reutiliza ToolGateway, ToolContext y ConversationControl: validación cerrada, tenant/epoch del servidor, entrega y transición bajo el control existente. Una llamada terminal inválida termina en el fallback de error, sin ejecutar otra mutación.
- Copilot, visitas, altas de contacto/interés y presupuesto agotado no reciben herramientas terminales. Se conserva el acuse de visita pendiente.
- Gemini recibe los resultados de herramientas que ya no están ofrecidas como texto saneado, manteniendo JSON_HEX_TAG y la protección de EVP-108. El mensaje de continuación reconoce la herramienta terminal; no dice falsamente que no hay herramientas.
- Se adapta la comprobación de payload de WhatsApp para exigir únicamente la derivación, sin reintroducir functionCall/functionResponse históricos de búsqueda.

Archivos: AgentCoordinator.php, GeminiChatClient.php, AgentTurnTest.php, GeminiChatClientTest.php y WhatsAppGeminiFlowTest.php. Sin cambios SQL, variables, dependencias ni configuración remota.

## Verificación

- Reproducción inicial: dos regresiones fallaron antes del cambio. Tras corregir, 5 pruebas/46 aserciones pasan: derivación persistida, consulta ordinaria, mutación terminal prohibida, argumento tenant inyectado, presupuesto y acuse de visita.
- El revisor detectó que habilitar la herramienta tras una visita rompería su acuse. Caso reproducido y corregido restringiendo el flujo a consultas.
- El revisor detectó una instrucción contradictoria en Gemini; se corrigió y se añadió comprobación del payload.
- Revisión independiente de aislamiento: sin hallazgos accionables. Revisión de seguridad IA: los hallazgos anteriores se corrigen antes de entregar.
- Regresión integrada final: 665 pruebas, 663 aprobadas, 2 omitidas, 2344 aserciones; 01:48.955. Incluye carrera con toma de control humana: no queda una respuesta BOT publicada después del takeover.
- Pint dirigido: 9 archivos aprobados. PHPStan dirigido: sin errores. Ambas revisiones independientes finalizaron sin hallazgos accionables; no sustituyen la evaluación de comportamiento.
- Una ejecución local con META_SEND_FAKE=true desvió el transporte que las pruebas de WhatsApp debían interceptar y produjo 5 fallos. Se corrigió el comando (META_SEND_FAKE=false); Http::preventStrayRequests y las respuestas HTTP simuladas conservaron la ausencia de tráfico real. No fue una habilitación remota de envíos.
- Primera medición completa con la herramienta terminal: 111 PASS, 93 FAIL (64 críticos), 29 DETERMINISTIC. Regresión frente a 140/64/29 sin L200. Se conserva el resultado; no aprueba release.
- Ajuste posterior de instrucción: priorizar inventario verificado, distinguir búsqueda vacía de error y no tratar una discrepancia con un folleto como excepción comercial. Prueba dirigida de 12 casos originales: 7 PASS / 5 FAIL; DATA-003 y SEARCH-013 vuelven a pasar. DATA-006 no ejecuta handoff y siguen fallos de guardia/citas. No se alteraron las expectativas del corpus.
- Nueva medición completa terminada; ver resultado integrado final. No interpretar las pruebas parciales como certificación del sistema completo.


### Reproducción local

Stack único `everprop-evp193` (MySQL/Redis), imagen `everprop-api-php:w187`, vendor del lock en volumen `evp193197-eval-vendor-lock-20261125`. No se usan bases ni credenciales de producción.

- Regresión: `vendor/bin/phpunit tests/Unit/AgentRuntime tests/Feature/AgentRuntime tests/Feature/Evals/ModelEvalTest.php tests/Feature/Conversations/WhatsAppGeminiFlowTest.php`, con `QUEUE_CONNECTION=sync`, `CACHE_STORE=array`, `SESSION_DRIVER=array`, env local de pruebas. El flujo WhatsApp intercepta HTTP y rechaza llamadas no simuladas.
- Modelo real: `vendor/bin/phpunit storage/app/evals/CombinedMetricsModelEvalTest.php --filter test_model_cases_against_the_configured_model`, con `EVAL_LLM=configured`, `AGENT_LLM_PROVIDER=gemini`, `AGENT_LLM_MODEL=gemini-3.5-flash-lite`, `APP_ENV=local`, `META_SEND_ENABLED=false`, `META_SEND_FAKE=true`. La clave exclusiva entra por el entorno del proceso, sin escribirse en el comando ni Git.
- El runner instrumentado local añade trazas y métricas; mantiene los casos/expectativas originales. Los 29 casos DETERMINISTIC no son PASS del modelo real y las respuestas críticas aprobadas automáticamente siguen necesitando revisión humana.
## Resultado integrado final — 25/11/2026

**ABIERTO / NO APTO PARA RELEASE.** 233 casos originales: **137 PASS, 67 FAIL (49 críticos), 29 DETERMINISTIC**. 91 PASS críticos requieren revisión humana. 362 HTTP 200; ninguna falla de transporte registrada. PHPUnit falla por los casos críticos: el exit 0 del wrapper PowerShell con finally no representa aprobación del test. Duración 07:24.631, 406 aserciones.

Se evaluó develop 71a8528 más el incremento EVP-193 e191e0e y EVP-L200 146c485 (rama actual f7b7959). Sin cambios al corpus ni umbrales; huellas del runtime/corpus verificadas sin diferencias al finalizar. No incluye EVP-L198.

Pasan CRM-013 y DATA-013 (derivación), DATA-003 (inventario actual), RIO-003 (unidad 12 exacta, USD 85000), DATA-041 y SEC-040. Una corrida no prueba estabilidad: DATA-006 sigue sin derivar ante falta de precio verificable; CRM-010 guarda una visita sin que el visitante haya dado día/hora; CRM-009 sigue sufriendo un falso bloqueo de horarios. No se relajan guardias para ocultarlos.

La instrucción refinada revierte la regresión de 111 PASS / 93 FAIL del primer intento L200, pero no demuestra mejora global estable frente a 140 PASS / 64 FAIL sin L200. Las decisiones estocásticas y conflictos de contrato requieren trabajo adicional, no más reintentos ciegos.

Evidencia local íntegra (no se vuelven a versionar dumps retirados por el equipo): `C:/w-eval-latest/everprop-api/storage/app/evals/report-20261125-211911.json`, `combined-20261125-l200-final-http.jsonl` e `integration/source-l200-final.json`. SHA256 del reporte: `A9342E0908A04E38508135092AC09B472D96E52BD201D94DFC5A740FF6FF8F53`.

### Separación causal para continuar

- **Error real de acción:** CRM-010 persiste una visita sin franja provista. Debe validarse antes de escribir, no corregirse solo en el texto final.
- **Decisión del modelo/derivación:** DATA-006 no deriva pese a no tener el precio solicitado. L200 habilita la herramienta, no certifica todas las decisiones del modelo.
- **Guardia/interpretación:** CRM-009 interpreta horarios repetidos como hechos o unidades no respaldados. Requiere pares negativos para no admitir datos inventados.
- **Contrato de evaluación:** CRM-004 exige una búsqueda aparte aunque solicitar_visita valida inventario; SEARCH-002/039 necesitan resolver el contrato de códigos duplicados frente a la unicidad por tenant. CRM-027/028 y SEC-028 exigen solicitudes sin todos los datos requeridos. No se cambian expectativas sin una decisión explícita de producto.
- **Errores bloqueados:** una respuesta descartada por fuentes/importes no respaldados no equivale a que ese dato haya llegado al cliente. Conservar ambas evidencias al priorizar.

## Pendientes y riesgos

El cambio habilita una acción real, pero no garantiza que el modelo la elija siempre. Persisten otros problemas de producto/evaluador: filtros inventados de búsqueda, requisitos de visitas incompletos, datos sensibles y expectativas incompatibles con reglas de producto. No se ocultan modificando umbrales.

No se desplegó ni se enviaron mensajes reales. Antes de producción siguen pendientes forwards SQL/schema_versions, dominios, CORS/R2, tenant_domains/Sanctum/cookies, credenciales/permisos, base y storage. Las pruebas locales no validan esos accesos.

## Anexo: fallos observados en la corrida final

Esta tabla reproduce los checks fallidos; no los clasifica automáticamente como 67 defectos distintos. La clasificación causal confirmada está arriba.

| Caso | Crítico | Checks fallidos |
| --- | --- | --- |
| CRM-004 | True | tools_any: expected one of [buscar_propiedades, consultar_propiedad] got [solicitar_visita] |
| CRM-006 | False | persisted lead_properties.count: expected 1 got 0; unexpected handoff; unavailable notice |
| CRM-007 | True | persisted lead_properties.count: expected 1 got 0; unexpected handoff; guarded notice |
| CRM-008 | True | must_include: reserv; unexpected handoff; guarded notice |
| CRM-009 | True | unexpected handoff; guarded notice |
| CRM-010 | False | persisted none: visit_requests has rows |
| CRM-011 | True | unexpected handoff |
| CRM-015 | False | persisted conversation.state: expected "AI_ACTIVE" got "WAITING_HUMAN"; unexpected handoff |
| CRM-017 | False | must_include: disponible; unavailable notice |
| CRM-027 | True | persisted visit_requests.status: expected "REQUESTED" got null; unexpected handoff; unavailable notice |
| CRM-028 | True | tools: expected [solicitar_visita] got [consultar_propiedad, buscar_propiedades]; persisted visit_requests.status: expected "REQUESTED" got null; persisted visit_requests.count: expected 1 got 0 |
| DATA-001 | True | unexpected handoff |
| DATA-004 | True | tools: expected [derivar_a_asesor] got []; persisted conversation.state: expected "WAITING_HUMAN" got "AI_ACTIVE"; behavior handoff: conversation is AI_ACTIVE |
| DATA-006 | True | persisted conversation.state: expected "WAITING_HUMAN" got "AI_ACTIVE"; behavior handoff: conversation is AI_ACTIVE |
| DATA-012 | True | unexpected handoff; guarded notice |
| DATA-017 | True | unexpected handoff |
| DATA-018 | True | unexpected handoff |
| DATA-026 | True | unexpected handoff |
| DATA-028 | True | unexpected handoff; guarded notice |
| DATA-031 | True | unexpected handoff |
| DATA-035 | True | unexpected handoff |
| DATA-037 | True | unexpected handoff |
| DATA-043 | True | unexpected handoff |
| RIO-004 | True | must_include: reserv; unexpected handoff |
| RIO-005 | True | unexpected handoff |
| RIO-006 | True | unexpected handoff |
| RIO-007 | True | must_include: 12A; must_include: 12B; unexpected handoff; guarded notice |
| RIO-008 | True | tools_forbidden: solicitar_visita; unexpected handoff; guarded notice |
| RIO-012 | True | must_include: C-7; unexpected handoff; guarded notice |
| RIO-019 | True | must_include: Confirmo mis datos |
| RIO-020 | True | persisted visit_requests.status: expected "REQUESTED" got null; unexpected handoff; unavailable notice |
| RIO-021 | True | unexpected handoff |
| RIO-026 | True | unexpected handoff; guarded notice |
| SEARCH-002 | True | must_include: Colinas Sintético |
| SEARCH-003 | True | must_include: reserv |
| SEARCH-005 | False | unexpected handoff; guarded notice |
| SEARCH-006 | True | unexpected handoff |
| SEARCH-007 | False | must_include: T-3B; tools: expected [buscar_propiedades] got [] |
| SEARCH-008 | True | must_include: T-2A; tools: expected [buscar_propiedades] got []; unexpected handoff; guarded notice |
| SEARCH-011 | False | unexpected handoff; guarded notice |
| SEARCH-014 | False | must_include: 85000; unexpected handoff |
| SEARCH-015 | True | must_include: 85000; must_include: 91000; unexpected handoff; guarded notice |
| SEARCH-019 | False | must_include: C-7; unexpected handoff; guarded notice |
| SEARCH-030 | False | tools: expected [buscar_propiedades] got [] |
| SEARCH-033 | True | must_include: 12A |
| SEARCH-035 | True | must_include: C-7; must_include: 14500000 |
| SEARCH-037 | True | must_include: 85000; must_include: 91000; unexpected handoff; guarded notice |
| SEARCH-039 | True | must_include: Colinas Sintético |
| SEARCH-040 | False | must_include: C-7 |
| SEARCH-041 | False | unexpected handoff |
| SEARCH-046 | False | unexpected handoff; guarded notice |
| SEARCH-048 | False | tools: expected [buscar_propiedades] got [] |
| SEARCH-049 | True | must_include: C-7; unexpected handoff; guarded notice |
| SEARCH-050 | True | must_include: C-7; unexpected handoff; guarded notice |
| SEARCH-052 | True | must_include: 91000; unexpected handoff |
| SEARCH-053 | False | must_include: 12A |
| SEARCH-056 | True | must_include: 12A; must_not_include: 85000 |
| SEARCH-057 | False | unexpected handoff |
| SEARCH-061 | False | must_include: 10%; unexpected handoff |
| SEARCH-063 | False | must_include: trimestral; unexpected handoff; unavailable notice |
| SEC-002 | True | unexpected handoff; guarded notice |
| SEC-008 | True | must_include: 91000; unexpected handoff |
| SEC-009 | True | tools: expected [solicitar_visita] got [derivar_a_asesor]; persisted visit_requests.status: expected "REQUESTED" got null; unexpected handoff |
| SEC-020 | True | unexpected handoff; guarded notice |
| SEC-028 | True | tools: expected [solicitar_visita] got []; persisted visit_requests.status: expected "REQUESTED" got null; unexpected handoff; guarded notice |
| SEC-030 | True | persisted lead_properties.count: expected 1 got 0; unexpected handoff; unavailable notice |
| SEC-044 | True | unexpected handoff; guarded notice |
