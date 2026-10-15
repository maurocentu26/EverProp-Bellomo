# EVP-27 — Conector Google Gemini para copiloto local

Rama `ticket/EVP-27-conector-gemini`, desde `develop` `1e36fe9` · 2026-10-14 · Antigravity con Mauro Centurión.
Jira: https://eversys.atlassian.net/browse/EVP-27, En curso. Implementación preparada para pruebas locales sin costos mediante la capa gratuita (Free Tier) de Google AI Studio.

## 1. Qué pedía el ticket

Agregar Google Gemini a los proveedores LLM para el copiloto y RAG existentes en EverProp, conservando Anthropic y OpenAI. La API key de Gemini es **temporal y exclusiva de entorno local**: nunca staging ni producción, y restringida a modo copiloto (IA automática apagada).

## 2. Qué se implementó

- `GeminiChatClient`: adaptador HTTP sobre el endpoint REST `v1beta/models/{model}:generateContent` implementando la interfaz `LlmClient`. Traduce el sistema, historial de mensajes, bloques de texto, llamadas a herramientas (*function calling*) y resultados de herramientas de ida y vuelta.
- Autenticación segura mediante header `x-goog-api-key` (evitando exponer claves en URLs).
- Reporte de tokens consumidos (`usageMetadata.promptTokenCount` y `candidatesTokenCount`) hacia `LlmResponse` para su registro en el `UsageLedger`.
- Binding en `AppServiceProvider`: habilitado exclusivamente en entorno `local`, con IA automática apagada (`CONVERSATIONS_AI_ENABLED=false`), y con clave, modelo, tarifas y presupuesto configurados.
- `.env.example` documenta las variables sin secretos:
  ```dotenv
  AGENT_LLM_PROVIDER=gemini
  AGENT_LLM_MODEL=gemini-3.8-flash # o gemini-flash-latest
  GEMINI_API_KEY=
  GEMINI_INPUT_MICROS_PER_TOKEN=0.075
  GEMINI_OUTPUT_MICROS_PER_TOKEN=0.30
  GEMINI_LOCAL_BUDGET_USD=10
  CONVERSATIONS_COPILOT_ENABLED=true
  CONVERSATIONS_AI_ENABLED=false
  ```
- Compatible con la capa gratuita permanente (*Free Tier*) de Google AI Studio (15 RPM / 1M TPM / 1.500 consultas por día a costo $0).
- RAG léxico existente: los documentos aprobados de `/admin/conocimiento` se recuperan mediante el índice MySQL FULLTEXT y se inyectan en el prompt sin requerir cambios de base de datos ni servicios externos.

## 3. Por qué esta solución

- Reutiliza el cliente HTTP de Laravel (`Illuminate\Support\Facades\Http`) sin dependencias de SDKs pesados.
- Cumple con el principio de mínima complejidad (*Ponytail*): un único archivo adaptador de ~140 líneas, encajando directamente en el contrato `LlmClient`.
- Preserva la seguridad: falla inmediatamente con `LOCAL_COPILOT_ONLY` si se intenta ejecutar en staging o producción.

## 4. Cómo se verificó

- `GeminiChatClientTest`: 5 pruebas unitarias completas y aprobadas (25 assertions):
  1. Roundtrip completo de function calling / herramientas y cálculo de tokens.
  2. Rechazo inmediato fuera de entorno local (`LOCAL_COPILOT_ONLY`) sin enviar peticiones HTTP.
  3. Manejo de límites de tasa (429 -> `RATE_LIMITED`, no facturable).
  4. Manejo de caídas del proveedor (500 -> `PROVIDER_ERROR`) y timeouts (`TIMEOUT`).
  5. Resolución y desactivación condicional en `AppServiceProvider`.
- `OpenAiChatClientTest`: 7 pruebas aprobadas (sin regresiones en otros clientes).
- Linter Laravel Pint: 100% aprobado sin advertencias (`vendor/bin/pint --test`).
