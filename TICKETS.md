# Trabajo por tickets — reglas para agentes

Aplica a todo agente que trabaje en este repo (Claude, Codex u otro), desde el 2026-10-09. Complementa `AGENTS.md` y `CLAUDE.md`; ante un conflicto sobre ramas, push o tickets, prevalece este archivo. El modelo completo para Producto está en `docs/proceso-de-trabajo.md`.

## Regla principal: sin ticket no hay cambios

Ningún cambio al repo (código, tests, documentación, configuración, CI o esquema) sin un ticket `EVP-XX` que **exista en Jira** y esté **En curso**, asignado a quien lo hace.

- **Si no hay ticket, no se empieza**, aunque el pedido sea chico o urgente, o aunque digan "hacelo igual". El agente ofrece redactar el ticket (objetivo, criterios de aceptación, fuera de alcance, riesgo) para que Producto lo cree, y espera la clave.
- **El ticket tiene que existir de verdad.** Con Jira conectado, el agente lo busca antes de crear la rama. Sin Jira conectado, el usuario confirma que existe en Jira; no se inventan claves.
- **Lo que está fuera del alcance del ticket no se implementa**, aunque sea una línea. Se propone como ticket nuevo.
- **Sin ticket solo se permite trabajo que no cambia el repo:** investigar, responder preguntas, revisar código o PRs, diagnosticar y redactar tickets.
- **Única excepción:** el dueño del repo (Ramiro) puede autorizar por escrito un cambio con ID provisorio (por ejemplo, `EVP-0.1`). El informe del ticket registra la excepción.

## 0. Jira conectado

Los tickets viven en Jira, proyecto **EVP** (claves `EVP-XX`). Al empezar una sesión de trabajo, antes de tomar un ticket:

1. **Revisar la memoria.** Si dice que Jira está conectado (sitio y proyecto EVP), seguir con la sección 1, pero si una herramienta de Jira falla, volver al paso 2.
2. **Comprobar el conector.** Ver si hay herramientas del conector de Atlassian (Rovo MCP server) y hacer una lectura mínima: buscar el proyecto `EVP` o un ticket conocido. Si responde, está conectado: ir al paso 4.
3. **Si no está conectado, guiar al usuario** con los pasos de su cliente, sin pedirle tokens ni contraseñas en el chat. El servidor es `https://mcp.atlassian.com/v2/mcp` y la autenticación es OAuth en el navegador:
   - **Claude Code:** `claude mcp add --transport http atlassian https://mcp.atlassian.com/v2/mcp`, y después `/mcp` en una sesión interactiva para autenticarse. En la app de escritorio o en claude.ai: autorizar el conector de Atlassian en la configuración de conectores.
   - **Codex:** `codex mcp add atlassian --url https://mcp.atlassian.com/v2/mcp`, y después `codex mcp login atlassian`. En Codex Desktop: Plugins/Connectors → Atlassian Rovo.
   - **Antigravity u otros:** la sección 9 de `docs/proceso-de-trabajo.md`.

   Si el login dice que la herramienta no está permitida, el administrador de Atlassian tiene que habilitarla en Atlassian Administration → Rovo → Rovo MCP server. Después de conectar, repetir el paso 2.
4. **Guardar en memoria** que Jira está conectado: cliente, sitio de Atlassian, proyecto EVP y fecha. Nunca guardar tokens ni credenciales. Un agente sin memoria persistente repite el paso 2 en cada sesión.

**Sin Jira conectado no se crean ni se mueven tickets.** Se puede trabajar en un ticket que ya existe en Jira, si el usuario da su clave y confirma que existe y está En curso. El informe registra que el agente no pudo verificarlo ni actualizar su estado.

## 1. Un ticket, una rama

- Todo trabajo arranca con un ticket de Jira `EVP-XX` que existe y tiene un objetivo concreto (ver la regla principal).
- Rama nueva desde `develop` actualizado: `ticket/EVP-XX-<descripcion-corta>`, por ejemplo `ticket/EVP-14-recordatorios-email`. La clave en el nombre vincula la rama, los commits y el PR con el ticket en Jira.
- Con Jira conectado: al crear la rama, pasar el ticket a **En curso**; al abrir el PR con el informe, pasarlo a **En revisión** y enlazar el informe. Los estados siguientes los mueven las personas.
- Un ticket por rama. Si aparece trabajo que no es del ticket, no se hace: se anota como pendiente en el informe y se propone como ticket nuevo.
- Si el ticket es un ítem del backlog de Conversations (S01–S17, Q01–Q03), seguir además la skill `backlog-item`.

## 2. Antes de empezar un ticket nuevo

**Preguntarle al usuario si el ticket anterior ya fue revisado para el merge a `develop`.** No darlo por hecho por el estado del PR ni de la rama.

- Si la respuesta es sí: actualizar `develop` y crear la rama del ticket nuevo.
- Si la respuesta es no: no empezar. Preguntar si hay que corregir algo del ticket anterior, o si el usuario autoriza explícitamente arrancar el nuevo en paralelo. En ese caso, la rama nueva sale igual de `develop`, nunca de la rama del ticket pendiente.

El ticket anterior es el del último informe en `docs/tickets/`.

## 3. Push y merge

- **Nunca push a `main` ni a `develop`.** Tampoco formas equivalentes: `git push origin <rama>:develop`, `--force` sobre esas ramas, merge desde la interfaz o la API de GitHub.
- Push solo a la rama del ticket, y solo con autorización expresa del usuario (`CLAUDE.md`, invariante 11).
- Lo integra a `develop` una persona, por PR, después de revisar el código y el informe del ticket.
- `main` es lo que ve el cliente: entra solo por PR revisado. El módulo de IA y conversaciones no va nunca a `main`.

## 4. Informe por ticket

Cada ticket terminado deja un informe en `docs/tickets/EVP-XX-<descripcion-corta>.md`, commiteado en la misma rama del ticket. Está escrito para que alguien que no vio la sesión lo revise y decida el merge.

Plantilla:

```markdown
# EVP-XX — <título del ticket>

Rama `ticket/EVP-XX-<descripcion-corta>` · commits `<sha>`… · fecha AAAA-MM-DD · autor (agente y persona)

## 1. Qué pedía el ticket
El objetivo en palabras del negocio y los criterios de aceptación. Qué quedaba fuera de alcance.

## 2. Qué se implementó
- Archivos y piezas de código tocadas, con enlace (`ruta/archivo.php:línea`), y qué hace cada una.
- Cómo funciona el flujo de punta a punta.
- Cambios de esquema (scripts forward), configuración o variables nuevas, sin valores secretos.

## 3. Por qué esta solución
- Qué se reutilizó del código existente.
- Alternativas consideradas y por qué se descartaron.
- Límites conocidos y simplificaciones deliberadas (comentarios `ponytail:`).

## 4. Cómo se verificó
Comandos y resultados (tests, Pint, PHPStan, lint, build), entorno y revisiones obligatorias
(`tenant-isolation-reviewer`, `llm-security-reviewer`). Lo que no se pudo verificar, dicho como tal.

## 5. Pendientes y riesgos
Lo que queda para otro ticket, decisiones abiertas y cualquier cosa que el revisor tenga que mirar con atención.
```

Reglas del informe:

- Describe solo lo que existe en la rama. Nada de "funciona" sin la prueba que lo respalda.
- Sin secretos, tokens, contraseñas ni datos personales reales.
- Si el ticket cambia después de la revisión, se actualiza el mismo informe; no se crea otro.

## 5. Checklist de cierre

- [ ] Rama `ticket/EVP-XX-…` creada desde `develop`.
- [ ] Código, tests y revisiones obligatorias según `CLAUDE.md` (Definition of Done).
- [ ] Informe en `docs/tickets/` con las cinco secciones.
- [ ] Commits en la rama del ticket; nada en `main` ni en `develop`.
- [ ] Al usuario: resumen del ticket, rama, commits y enlace al informe. El push y el PR, solo si los autoriza.
