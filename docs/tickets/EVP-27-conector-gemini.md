# EVP-27 — Conector Google Gemini para copiloto local

Rama `ticket/EVP-27-conector-gemini`, desde `develop` `1e36fe9` · 2026-10-14 · Antigravity con Mauro Centurión y Alvaro Ruggeri.
Jira: https://eversys.atlassian.net/browse/EVP-27, asignado a Alvaro Ruggeri, En curso. Implementación preparada para pruebas locales sin costos mediante la capa gratuita (Free Tier) de Google AI Studio.

## 1. Qué pedía el ticket

Agregar Google Gemini a los proveedores LLM para el copiloto y RAG existentes en EverProp, sustituyendo temporalmente la clave personal de OpenAI (EVP-18) para pruebas locales a costo $0 y conservando Anthropic. La API key de Gemini es **temporal y exclusiva de entorno local**: nunca staging ni producción, y restringida a modo copiloto (IA automática apagada).

## 2. Qué se implementó

- `GeminiChatClient`: adaptador HTTP sobre el endpoint REST `v1beta/models/{model}:generateContent` implementando la interfaz `LlmClient`. Traduce el sistema, historial de mensajes, bloques de texto, llamadas a herramientas (*function calling*) y resultados de herramientas de ida y vuelta.
- **Sanitización de esquemas (`cleanSchema`):** remueve recursivamente palabras clave incompatibles con la especificación OpenAPI de Google Gemini (como `additionalProperties: false`), evitando errores HTTP 400 (`INVALID_ARGUMENT`).
- **Preservación de firmas de pensamiento (`thoughtSignature`):** preserva y reenvía el token criptográfico `thoughtSignature` emitido por los modelos Gemini 3.x durante las rondas de ejecución de herramientas, requisito estricto para no degradar el modelo ni ser rechazado en la segunda llamada.
- Autenticación segura mediante header `x-goog-api-key` (evitando exponer claves en URLs).
- Reporte de tokens consumidos (`usageMetadata.promptTokenCount` y `candidatesTokenCount`) hacia `LlmResponse` para su registro en el `UsageLedger`.
- Binding en `AppServiceProvider`: habilitado exclusivamente en entorno `local`, con IA automática apagada (`CONVERSATIONS_AI_ENABLED=false`), y con clave, modelo, tarifas y presupuesto configurados.
- `.env.example` y `.env` configurados para el entorno local:
  ```dotenv
  AGENT_LLM_PROVIDER=gemini
  AGENT_LLM_MODEL=gemini-3.1-flash-lite
  GEMINI_API_KEY=<clave personal temporal, solo local>
  GEMINI_INPUT_MICROS_PER_TOKEN=0.075
  GEMINI_OUTPUT_MICROS_PER_TOKEN=0.30
  GEMINI_LOCAL_BUDGET_USD=10
  CONVERSATIONS_COPILOT_ENABLED=true
  CONVERSATIONS_AI_ENABLED=false
  ```
- Compatible con la capa gratuita permanente (*Free Tier*) de Google AI Studio (modelo `gemini-3.1-flash-lite` con cuota operativa amplia y sin saturación).
- RAG léxico existente: los documentos aprobados de `/admin/conocimiento` se recuperan mediante el índice MySQL FULLTEXT y se inyectan en el prompt sin requerir cambios de base de datos ni servicios externos.

## 3. Por qué esta solución

- Reutiliza el cliente HTTP nativo de Laravel (`Illuminate\Support\Facades\Http`) sin dependencias ni SDKs externos pesados (cumpliendo el principio *Ponytail*).
- Un único adaptador desacoplado de ~200 líneas encajando directamente en el contrato `LlmClient`.
- Preserva la seguridad: falla inmediatamente con `LOCAL_COPILOT_ONLY` si se intenta ejecutar en staging o producción o con respuestas automáticas desatendidas.

## 4. Cómo se verificó

- `GeminiChatClientTest`: 5 pruebas unitarias completas y aprobadas (25 assertions):
  1. Roundtrip completo de function calling / herramientas y cálculo de tokens.
  2. Rechazo inmediato fuera de entorno local (`LOCAL_COPILOT_ONLY`) sin peticiones HTTP.
  3. Manejo de límites de tasa (429 -> `RATE_LIMITED`, no facturable).
  4. Manejo de caídas del proveedor (500 -> `PROVIDER_ERROR`) y timeouts (`TIMEOUT`).
  5. Resolución y desactivación condicional en `AppServiceProvider`.
- Linter Laravel Pint: 100% aprobado sin advertencias (`vendor/bin/pint --test`).
- **Prueba integral E2E en navegador:**
  1. Carga del widget público en `/widget/744c859e-6804-4852-a86f-160d5bc85c82`.
  2. Envío de consulta inmobiliaria de visitante: *"Hola, qué departamentos de 2 dormitorios tienen disponibles para la venta y qué precios tienen?"*.
  3. Recepción en bandeja de entrada omnicanal (`/admin/conversaciones`) bajo el asesor Lucas Albarracín.
  4. Toma de control de la conversación y clic en «Sugerir respuesta con IA».
  5. Gemini ejecutó la herramienta `buscar_propiedades` directamente sobre la base de datos MySQL (tabla `properties`), detectó que en Bellomo todo el inventario son lotes y generó el borrador fidedigno sin alucinaciones.
