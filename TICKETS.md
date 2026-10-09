# Trabajo por tickets — reglas para agentes

Aplica a todo agente que trabaje en este repo (Claude, Codex u otro), desde el 2026-10-09. Complementa `AGENTS.md` y `CLAUDE.md`; ante un conflicto sobre ramas, push o tickets, prevalece este archivo.

## 1. Un ticket, una rama

- Todo trabajo arranca con un ticket: un ID y un objetivo concretos. Sin ticket, preguntar cuál es antes de escribir código.
- Rama nueva desde `develop` actualizado: `ticket/<ID>-<descripcion-corta>`, por ejemplo `ticket/EVP-12-recordatorios-email`.
- Un ticket por rama. Si aparece trabajo que no es del ticket, anotarlo como pendiente en el informe; no mezclarlo.
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

Cada ticket terminado deja un informe en `docs/tickets/<ID>-<descripcion-corta>.md`, commiteado en la misma rama del ticket. Está escrito para que alguien que no vio la sesión lo revise y decida el merge.

Plantilla:

```markdown
# <ID> — <título del ticket>

Rama `ticket/<ID>-<descripcion-corta>` · commits `<sha>`… · fecha AAAA-MM-DD · autor (agente y persona)

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

- [ ] Rama `ticket/<ID>-…` creada desde `develop`.
- [ ] Código, tests y revisiones obligatorias según `CLAUDE.md` (Definition of Done).
- [ ] Informe en `docs/tickets/` con las cinco secciones.
- [ ] Commits en la rama del ticket; nada en `main` ni en `develop`.
- [ ] Al usuario: resumen del ticket, rama, commits y enlace al informe. El push y el PR, solo si los autoriza.
