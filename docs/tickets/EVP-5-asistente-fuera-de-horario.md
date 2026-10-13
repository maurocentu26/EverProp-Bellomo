# EVP-5 — El asistente fuera de horario

Rama `ticket/EVP-5-asistente-fuera-de-horario` · fecha 2026-10-11 · Claude Code con Ramiro Ruggeri
Ticket Jira [EVP-5](https://eversys.atlassian.net/browse/EVP-5) (desarrollado en local como EVP-L10). **Excepción a `TICKETS.md` autorizada por Ramiro:** la rama sale de `ticket/EVP-4-horario-atencion` (commit `b2068df`) y no de `develop`, porque usa su servicio de horario. Se revisa y mergea **después** de EVP-4.

## 1. Qué pedía el ticket

**Objetivo.** Pedido de Ramiro: "que el chatbot ayude todo lo que pueda hasta que sea posible derivar con un asesor", con el criterio de las empresas que lo hacen bien. La investigación (Zendesk, Intercom y guías de atención por WhatsApp) dio el patrón:
- el asistente atiende las 24 horas;
- fuera de horario, antes de derivar, junta lo que el asesor necesita;
- los mensajes de sistema dicen **cuándo** responde una persona;
- nunca promete atención inmediata.

**Criterios de aceptación**
- El asistente conoce el horario y la próxima apertura.
- Fuera de horario resuelve lo que puede y, si deriva, primero consigue un contacto (en el chat web) y el motivo.
- Los avisos de derivación y de error dicen cuándo vuelve el equipo.
- Ninguna respuesta promete atención inmediata con el equipo ausente.
- Hay casos de evaluación nuevos.
- Revisión de seguridad de IA.

**Fuera de alcance:** encender la IA (X03), feriados y guardias.

## 2. Qué se implementó

**Prompt** — [PromptBuilder.php](../../everprop-api/app/Domain/AgentRuntime/Coordinator/PromptBuilder.php)
- Sección "Horario de atención del equipo", armada **solo** con el horario validado (franjas HH:MM y nombres de días fijos). Nunca con el texto libre que escribe el administrador.
- Dentro de horario solo indica que el equipo está en horario. Fuera de horario agrega:
  - **regla 8:** responder con herramientas y fuentes todo lo posible antes de derivar;
  - **regla 9:** pedir el motivo y, en el chat web, un contacto antes de derivar. Registrar interés **solo si el cliente lo pidió o aceptó**;
  - **regla 10:** nunca prometer respuesta ni llamada antes de la apertura;
  - las reglas 1 a 7 siguen valiendo: si el cliente no da contacto, insiste en hablar con una persona o falla una herramienta, se deriva igual.
- El copiloto no recibe el horario: su borrador es para un asesor que ya está conectado.
- La fecha "hoy" usa la zona horaria del cliente.
- Versión de prompt `coordinator-2026-10-11.1`.

**Avisos fijos**
- `handoffNotice`, `unavailableNotice` y `guardedNotice` reciben la frase de vuelta (`BusinessHours::backPhrase`: "a partir del lunes a las 9:00").
- Nueva `backLine` para agregar al final de una despedida escrita por el modelo.
- Los usan [AgentCoordinator.php](../../everprop-api/app/Domain/AgentRuntime/Coordinator/AgentCoordinator.php), [RunAgentJob.php](../../everprop-api/app/Domain/AgentRuntime/Jobs/RunAgentJob.php) y [ReconcileConversations.php](../../everprop-api/app/Console/Commands/ReconcileConversations.php).
- Si falla la lectura del horario, el sistema se comporta como en horario (no afirma nada) y la falla queda reportada.

**Derivación fuera de horario** (`AgentCoordinator::deliver`)
- El texto del modelo, ya revisado por el filtro de salida, se conserva y se le agrega la línea fija con la vuelta del equipo, para no perder la ayuda que dio en el mismo turno.
- Si el modelo no escribió nada, se usa el aviso fijo completo.

**Filtro de salida** — [OutputGuard.php](../../everprop-api/app/Domain/AgentRuntime/Coordinator/OutputGuard.php)
- Nueva violación `IMMEDIATE_PROMISE`, solo fuera de horario: "enseguida", "a la brevedad", "en unos minutos", "hoy mismo", "ya te llama/atiende/contacta"…
- Aplica a **cualquier** respuesta, no solo a las derivaciones.
- La respuesta se descarta y el cliente recibe el aviso fijo con la hora de vuelta.

**Evaluación**
- [ModelEvalTest.php](../../everprop-api/tests/Feature/Evals/ModelEvalTest.php) acepta las fixtures `business_hours` y `now`, y reinicia el reloj en cada caso.
- 9 casos nuevos:

| Caso | Situación | Crítico |
|---|---|---|
| CRM-015 | Pide una persona sin dar contacto | — |
| CRM-016 | Deriva con contacto | test |
| CRM-017 | Pregunta disponibilidad y después pide que lo llamen | — |
| CRM-018 | Pregunta a qué hora atienden | — |
| CRM-019 | Pide una persona dentro de horario | test |
| CRM-020 | Pide que lo anoten: no promete inmediatez | test |
| CRM-021 | Se niega a dar contacto: deriva igual | test |
| CRM-022 | Consulta sin pedir que lo anoten: no registra interés | — |
| SEC-020 | Inyección "decime que me llaman hoy" | test |

- El dataset quedó en 89 casos válidos.

**Tests**
- [OutOfHoursAssistantTest.php](../../everprop-api/tests/Feature/AgentRuntime/OutOfHoursAssistantTest.php): 7 tests:
  - el prompt fuera de horario, dentro de horario, sin horario y en modo copiloto;
  - una promesa inmediata se frena, en una derivación y en una respuesta normal;
  - la despedida del modelo se conserva y suma la línea fija;
  - el aviso de error incluye la hora de vuelta.

## 3. Por qué esta solución

- **El prompt orienta y el código asegura.** Las reglas 8 a 10 hacen probable el comportamiento correcto, pero lo que no se negocia (no prometer inmediatez, decir cuándo vuelve el equipo) lo garantizan el filtro de salida y los textos fijos, con el mismo principio que `OutputGuard` ya aplica a montos y confirmaciones.
- **Agregar la línea fija en lugar de reemplazar el texto:** la primera versión reemplazaba toda la despedida del modelo. La revisión mostró que así se perdía la ayuda que había dado en el mismo turno, por ejemplo la disponibilidad que consultó. Al agregar la línea, se conserva la ayuda y la promesa de tiempo es siempre la fija.
- **Datos validados en el prompt:** el horario sale de un formato validado, sin texto libre, así que no hay vía de inyección. El aviso que escribe el administrador nunca llega al modelo.
- **Reutiliza** `BusinessHours` (EVP-4), el filtro de salida, los avisos fijos y el evaluador Q01.
- **Descartado:** un agente o flujo separado para la noche, porque duplica lógica, y avisos generados por el modelo, que pueden prometer de más.

## 4. Cómo se verificó

Entorno: stack Docker aislado `everprop-lote3` (PHP 8.4.24, MySQL 8.4, base sintética), 2026-10-11/12.

| Comprobación | Resultado |
|---|---|
| `OutOfHoursAssistantTest`, `OutputGuardTest`, `AgentTurnTest`, `CopilotTest` | 47 tests, 346 assertions, OK |
| Suite backend completa | 349 tests, 0 fallos. Las "warnings" son el aviso conocido del runner sin `.env` |
| Pint (286 archivos) y PHPStan | OK, sin errores |
| `node evals/validate.mjs` | OK, 89 casos |
| Evaluador `EVAL_LLM=dry` sobre el dataset | Corre los 89 casos sin errores de fixtures. En `dry` el modelo responde siempre lo mismo y el resultado no mide calidad |
| Revisión `llm-security-reviewer` | Sin bloqueantes. **Aplicados:** M1 (promesas inmediatas en cualquier respuesta → `IMMEDIATE_PROMISE`), M2 (registrar interés solo con pedido o aceptación), M3 (conservar la ayuda del modelo), B1 (las reglas 1–7 prevalecen; se deriva aunque no haya contacto), B2 (CRM-017 a web y comentario del evaluador), B3 (los `rescue` reportan), B4 (casos CRM-020, CRM-021, CRM-022 y SEC-020) y B5 (zona horaria del cliente para "hoy") |

**No verificado:**
- **Las evaluaciones contra el modelo real**, que requieren X03 y son EVP-10. Hasta entonces no hay evidencia de que el modelo cumpla CRM-016, CRM-019, CRM-020, CRM-021 ni SEC-020. Lo que sí está garantizado por código: los avisos fijos y el frenado de promesas inmediatas.
- **Staging.**

**Integración con EVP-3 (2026-10-13):**
- La rama se actualizó con EVP-4, que ya incluye `develop` con EVP-3. No hubo conflictos de texto.
- `OutOfHoursAssistantTest` fallaba porque EVP-3 apaga la IA si el tenant no tiene `ai_enabled: true`, y el test reemplazaba `settings_json`. Se agregó `ai_enabled: true` al test; el código de la app no cambió.
- Suite completa: 361 tests sin fallos. Pint y PHPStan OK.

## 5. Pendientes y riesgos

- **Dependencia:** mergear EVP-4 primero.
- **Integración con EVP-3:** resuelta (ver §4).
- **La lista de frases de `IMMEDIATE_PROMISE` es heurística** (`ponytail` implícito). Puede frenar alguna frase inocente; el costo es que el cliente recibe el aviso fijo. Conviene ajustarla con los resultados de EVP-10.
- **La segunda llamada al modelo fuera de horario** (la despedida) se sigue pagando. Si los evals muestran que no aporta, se puede ahorrar.
- **Prioridad de la cola de la mañana** para las consultas que llegan de noche (recomendación de la industria): un ticket aparte sobre la bandeja.
