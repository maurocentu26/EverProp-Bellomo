# EVP-18 — OpenAI para copiloto local

Rama `ticket/EVP-18-copiloto-openai`, desde `develop` `859eafe` · 2026-10-13 · Codex con Alvaro Ruggeri.
Jira: https://eversys.atlassian.net/browse/EVP-18, asignado a Alvaro, En curso. Implementación preparada para revisión por PR hacia develop; sin despliegue ni prueba con clave real.

## 1. Qué pedía el ticket

Agregar OpenAI al copiloto y RAG existentes conservando Anthropic. La API key personal de Alvaro es **temporal y exclusiva de local**: nunca staging ni producción. No respuestas automáticas, despliegues, cambios al buscador ni integración de canales Meta. Alvaro configurará la clave después; no hay autorización de consumo hasta elegir modelo y presupuesto.

## 2. Qué se implementó

- `OpenAiChatClient`: adaptador HTTP de Chat Completions sobre la interfaz LlmClient existente. Traduce texto, llamadas y resultados de herramientas de ida y vuelta; devuelve tokens al ledger y conserva los controles del coordinador.
- Endpoint HTTPS fijo, redirects deshabilitados, timeout y errores normalizados sin incluir cuerpos ni claves. `store=false` (esto no equivale a una garantía de retención cero del proveedor).
- Respuestas truncadas, argumentos JSON inválidos, herramientas inesperadas en la llamada final y uso de tokens inválido se rechazan; reservas de llamadas posiblemente facturadas quedan desconocidas.
- Binding habilitado solo en entorno `local`, con IA automática apagada y clave, modelo, tarifas y presupuesto positivos. También hay defensa en el cliente contra ejecución fuera de local o con IA automática activa.
- Tarifas OpenAI explícitas alimentan los cálculos del coordinador. El presupuesto local reduce los límites global, por defecto de tenant y de copiloto existentes; no los eleva.
- `.env.example` documenta nombres sin secretos. El `.env` real no fue modificado.

Configuración futura en `everprop-api/.env` (no duplicar variables):

```dotenv
AGENT_LLM_PROVIDER=openai
AGENT_LLM_MODEL=<modelo compatible con Chat Completions y herramientas>
OPENAI_API_KEY=<clave personal temporal, solo local>
OPENAI_INPUT_MICROS_PER_TOKEN=<tarifa de entrada>
OPENAI_OUTPUT_MICROS_PER_TOKEN=<tarifa de salida>
OPENAI_LOCAL_BUDGET_USD=<presupuesto mensual acordado>
CONVERSATIONS_COPILOT_ENABLED=true
CONVERSATIONS_AI_ENABLED=false
```

Las tarifas son micro-USD por token, numéricamente iguales a USD por millón de tokens. Usar tarifas vigentes del modelo elegido; no hay valores estimados por defecto para OpenAI. El ledger contabiliza entrada cacheada al valor completo de entrada (conservador).
Después de configurar, limpiar caché de configuración y reiniciar PHP, worker y scheduler del stack local. Como administrador, activar solo “Sugerencias para asesores” del tenant. El asesor debe controlar la conversación; nunca se envía un borrador sin una acción humana.

Los documentos públicos aprobados de `/admin/conocimiento` se recuperan mediante el mismo RAG MySQL. No cargar notas privadas ni datos de clientes reales para esta primera prueba.

## 3. Por qué esta solución

Reutiliza Laravel HTTP, LlmClient/LlmResponse, KnowledgeService, ToolGateway, OutputGuard y UsageLedger: sin SDK, dependencias ni esquema nuevos. Chat Completions permite traducir directamente el contrato interno de herramientas sin cambiar el coordinador. Referencia consultada: https://developers.openai.com/api/reference/resources/chat/subresources/completions/methods/create.

Anthropic permanece en su ruta original. El adaptador nuevo es deliberadamente local, no un proveedor de producción. No se implementa modo automático con la clave personal.

## 4. Cómo se verificó

Docker existente, PHP 8.4.26 y MySQL 8.4, base de pruebas local y tenants sintéticos; sin SQLite ni llamadas reales.

- Ciclo inicial: pruebas fallaron por ausencia de OpenAiChatClient; luego implementación y correcciones.
- OpenAiChatClientTest + CopilotTest: 14 pruebas aprobadas (incluyen roundtrip de herramientas, tokens, errores 401/429/500, timeout, truncamiento, JSON inválido, binding y Anthropic).
- Integración MySQL con HTTP simulado: documento aprobado llega al prompt, se devuelve borrador y snapshot de conversación/mensajes/outbound/CRM no cambia. Se registra consumo sintético en ledger.
- PHPStan: sin errores.
- Pint de archivos modificados aplicado.
- Revisión independiente de seguridad de IA: tool_choice sin herramientas y validación estricta de tokens corregidos; revisión final sin bloqueantes nuevos.

- Runtime AgentRuntime completo: 47 pruebas, 367 assertions, OK.
- AiSettingsTest y WebChatAndUsageTest: 19 pruebas, 115 assertions, OK.
- La comprobación ampliada detectó que faltaba `access_token_ciphertext` en `bellomo_crm_test`. Se aplicó únicamente allí el forward existente `2026-10-02.001`; no se modificó el SQL ni la base de demostración. Después pasaron las 19 pruebas.
- PHPStan final sin errores, Pint de los seis archivos PHP modificados y `git diff --check` satisfactorios.

## 5. Pendientes y riesgos

- Configurar clave, modelo compatible, tarifas vigentes y presupuesto acordado; después hacer prueba mínima real. No se verificaron cuenta, permisos, calidad del modelo ni facturación.
- **Presupuesto estimado:** el ledger existente reserva a partir de estimaciones de tokens; no garantiza un techo exacto de facturación externa. Evitar prompts largos, supervisar consumo y usar los controles del proyecto proveedor. No iniciar una suite real de 202 casos sin presupuesto explícito.
- No hay cambios de frontend; no se repitió build del panel.
- Al terminar las pruebas, retirar la clave local y revocar o rotar la clave temporal desde su cuenta si corresponde. Una futura credencial compartida requiere otro alcance aprobado.
- La modificación previa de `everprop-public/AGENTS.md` se conserva fuera de este ticket.
