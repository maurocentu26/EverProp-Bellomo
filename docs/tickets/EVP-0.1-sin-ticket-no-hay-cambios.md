# EVP-0.1 — Sin ticket no hay cambios

Rama `ticket/EVP-0.1-sin-ticket-no-hay-cambios` · fecha 2026-10-09 · Claude Code con Ramiro Ruggeri

**Excepción registrada:** el proyecto EVP todavía no existe en Jira. Ramiro autorizó por escrito este cambio con el ID provisorio `EVP-0.1`, la única excepción que admite la regla nueva. Ticket anterior: EVP-0, revisado y mergeado (PR #10).

## 1. Qué pedía el ticket

Que nadie del equipo, persona o agente, empiece a desarrollar algo que no tenga un ticket iniciado. Las reglas anteriores decían "sin ticket, preguntar cuál es", pero no obligaban a frenar.

## 2. Qué se implementó

- **`TICKETS.md`**:
  - **nueva sección "Regla principal: sin ticket no hay cambios":** ningún cambio al repo sin un ticket `EVP-XX` que exista en Jira y esté En curso, asignado a quien lo hace;
  - **si no hay ticket, no se empieza** aunque lo pidan; el agente ofrece redactar el ticket;
  - **el ticket tiene que existir:** se verifica en Jira o, sin Jira conectado, lo confirma el usuario;
  - **lo que está fuera del alcance no se implementa;**
  - **sin ticket solo se permite** trabajo que no cambia el repo;
  - **única excepción:** autorización escrita del dueño del repo con ID provisorio.
  - **Sección 0:** se cierra el hueco de los "tickets dictados por chat". Sin Jira conectado se puede trabajar solo en un ticket que el usuario confirma que ya existe y está En curso.
  - **Sección 1:** lo que está fuera del alcance no se hace; se propone como ticket nuevo.
- **`AGENTS.md`** y **`CLAUDE.md`**: una línea con la regla en cada uno, para que la vea cualquier agente aunque no abra `TICKETS.md`.
- **`docs/proceso-de-trabajo.md`**: la regla en la sección 6, para personas y para Producto.

## 3. Por qué esta solución

- **Regla dura y visible:** un agente servicial tiende a cumplir el pedido. "Preguntar" no alcanza; hay que decir explícitamente que se frena aunque insistan.
- **Exigir que el ticket exista en Jira** evita claves inventadas. Que esté En curso y asignado evita que dos personas trabajen lo mismo.
- **Se permite el trabajo que no cambia el repo**, para no trabar la investigación ni la redacción del propio ticket.
- **Una excepción explícita y registrada** es mejor que una informal: hoy hacía falta para poder escribir esta regla, porque Jira todavía no existe.
- **Descartado por ahora:** un check de GitHub que rechace ramas sin `EVP-XX`. Sirve como refuerzo, pero es un cambio de CI que merece su propio ticket.

## 4. Cómo se verificó

Solo documentación: no cambia código, configuración ni CI. Revisé que los cuatro archivos digan lo mismo y que no quede la regla vieja de "ticket dictado por chat".

## 5. Pendientes y riesgos

- Ticket aparte: un check de GitHub que exija `EVP-XX` en el nombre de la rama de los PR a `develop` y `main`.
- Renombrar EVP-0 y EVP-0.1 con claves reales cuando exista el proyecto en Jira.
- La regla depende de que los agentes lean estos archivos. Codex y Claude lo hacen solos; una persona tiene que conocerla por `docs/proceso-de-trabajo.md`.
