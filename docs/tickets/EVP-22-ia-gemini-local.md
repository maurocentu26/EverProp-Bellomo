# EVP-22 — Probar la IA en local con Gemini

Rama `ticket/EVP-22-ia-gemini-local`, desde `develop` `6fee60d` · 2026-10-23 · Ramiro con Claude. Prueba hecha por Mauro Centurión.
Jira: https://eversys.atlassian.net/browse/EVP-22. Solo local: no cambia código, staging ni producción.

## 1. Decisión

Para pruebas **solo en local**, el copiloto y el asistente usan Google Gemini con el conector de EVP-27, que ya está en `develop`. Reemplaza la decisión del 15/10, que era usar Anthropic. Los adaptadores de Anthropic y de OpenAI (EVP-18) siguen disponibles.

**Esto no cierra X03.** Para producción, Alvaro igual tiene que aprobar el proveedor y la región, y la clave tiene que ir al gestor de secretos.

## 2. Evidencia (Mauro, 23/10, modelo `gemini-3.1-flash-lite`, capa gratuita)

| Modo | Configuración | Resultado | Captura |
|---|---|---|---|
| Copiloto | `CONVERSATIONS_AI_ENABLED=false`, `CONVERSATIONS_COPILOT_ENABLED=true` | El asesor toma el control y pide una sugerencia. Gemini consulta el inventario con `buscar_propiedades` y deja un borrador que no sale hasta que el asesor lo envía | `evidence/EVP-22/copiloto_sugerencia_inbox.png` |
| Asistente | `CONVERSATIONS_AI_ENABLED=true` | El worker procesa el turno y el widget responde solo, identificado como «Asistente virtual» | `evidence/EVP-22/asistente_respuesta_widget.png` |

**Para revisar en la evaluación (EVP-10):** el asistente respondió «no tenemos lotes disponibles para la venta». Con los datos locales puede ser correcto. Hay que confirmar que esa respuesta sale de `buscar_propiedades` sin resultados y no de un error de la herramienta, porque para un comprador real es una respuesta que hace perder la venta.

## 3. Cómo está hecho el acceso a datos

- **Conocimiento (RAG):** `AgentCoordinator::searchKnowledge()` usa `KnowledgeService::search()`, una búsqueda léxica en MySQL (FULLTEXT con respaldo `LIKE`), sin embeddings ni servicios externos.
- **Inventario en vivo:** la herramienta `buscar_propiedades` (`BuscarPropiedades`, `PublicInventory`) consulta las propiedades del tenant.
- **EVP-35** (PR #37) fue solo auditoría y diseño del endpoint público de conocimiento para la landing; no incluye código de backend.

## 4. Guía para cada persona del equipo

1. **Clave personal:** cada uno crea la suya en [aistudio.google.com](https://aistudio.google.com) → Get API key. **No se comparten claves**: cada una tiene su propio límite y se puede revocar sin afectar a los demás. Nunca va en chats, Jira, PRs, commits ni capturas.
2. **`everprop-api/.env` local** (excluido de Git):
   ```dotenv
   APP_ENV=local
   AGENT_LLM_PROVIDER=gemini
   AGENT_LLM_MODEL=gemini-3.1-flash-lite
   GEMINI_API_KEY=<tu clave personal>
   GEMINI_INPUT_MICROS_PER_TOKEN=0.075
   GEMINI_OUTPUT_MICROS_PER_TOKEN=0.30
   GEMINI_LOCAL_BUDGET_USD=10
   CONVERSATIONS_COPILOT_ENABLED=true
   CONVERSATIONS_AI_ENABLED=false
   ```
   El conector solo se activa con `APP_ENV=local`; en otro entorno queda apagado solo.
3. **Levantar:** `docker compose --project-name everprop-api up -d` (el worker es necesario para las respuestas automáticas) y el panel con `npm run dev` en `everprop-public`.
4. **Copiloto:** abrir el widget de un tenant de prueba, escribir una consulta, y en `/admin/conversaciones` tomar el control y pedir la sugerencia.
5. **Asistente:** poner `CONVERSATIONS_AI_ENABLED=true`, reiniciar php y worker (`docker compose --project-name everprop-api restart everprop-api-php everprop-api-worker`) y volver a escribir en el widget.
6. **Al terminar:** borrar la clave del `.env` o revocarla en AI Studio.

Solo datos sintéticos o documentos públicos aprobados: los mensajes y los fragmentos se envían a Google.

## 5. Criterios de cierre

| Criterio | Estado |
|---|---|
| Guía probada en al menos una máquina, con una respuesta real del copiloto y otra del asistente | Hecho (Mauro, 23/10, capturas en §2) |
| Evaluación de EVP-10 corrida o agendada | **Agendada:** queda para EVP-10, con autorización del costo y la observación de §2 |

## 6. Seguridad

El borrador original de este informe incluía una clave real de Gemini para compartir entre los tres desarrolladores. **No se versionó.** Como circuló fuera del gestor de secretos, Mauro tiene que revocarla en AI Studio y cada persona crea la suya (§4).
