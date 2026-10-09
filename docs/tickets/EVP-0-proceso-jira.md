# EVP-0 — Proceso de trabajo con Jira y guía para Producto

Rama `ticket/EVP-0-proceso-jira` · fecha 2026-10-09 · Claude Code con Ramiro Ruggeri
ID provisorio: el proyecto EVP todavía no existe en Jira. Cuando exista, crear el ticket y actualizar este informe.

## 1. Qué pedía el ticket

- Un documento para el Product Manager de EverSys: cómo se trabaja (tickets `EVP-XX`, ramas, PRs, informes, roles) y el modelo de organización en Jira.
- Instrucciones para conectar el agente del PM (Antigravity) a Jira.
- Que las reglas de los agentes comprueben si Jira está conectado y, si no, guíen la conexión y la guarden en memoria.

Fuera de alcance: crear el proyecto y los tickets en Jira (el conector todavía no está autorizado) y migrar el backlog.

## 2. Qué se implementó

- **`docs/proceso-de-trabajo.md`** (nuevo), para el PM:
  - el modelo (ticket → rama → PR revisado → informe) y dónde vive cada cosa (`develop`, `main`, staging, informes);
  - la estructura de Jira: épica, historia, tarea, bug, componentes, etiquetas que cambian el proceso y sprints semanales;
  - los estados del ticket, con quién los mueve;
  - la plantilla de ticket con un ejemplo, la tabla de roles y un primer sprint sugerido;
  - en la sección 9, cómo conectar Antigravity.
- **`TICKETS.md`**:
  - **nueva sección 0, "Jira conectado":** revisar la memoria, comprobar el conector con una lectura mínima, guiar la conexión según el cliente (Claude Code, Codex, Antigravity) sin pedir credenciales, y guardar en memoria el cliente, el sitio, el proyecto y la fecha;
  - **sección 1:** usa la clave `EVP-XX` en ramas e informes, y define qué estados mueve el agente (En curso, En revisión);
  - el resto del archivo usa `EVP-XX` en lugar de `<ID>`.
- **Memoria de esta instalación de Claude:** registra que Jira **no** está conectado al 2026-10-09 y cómo conectarlo.

## 3. Por qué esta solución

- **Conector oficial de Atlassian** (Rovo MCP server, `https://mcp.atlassian.com/v2/mcp`, OAuth): es el que documenta Atlassian para Claude Code, Codex y clientes MCP genéricos. No hace falta crear ni guardar tokens de API.
- **Antigravity con `serverUrl`:** las guías coinciden en que usa esa clave para servidores remotos, y en que `url` falla sin avisar. Como plan B se documenta el puente `mcp-remote`.
- **Un solo proyecto con componentes:** con tres personas, varios proyectos suman administración sin beneficio.
- **La comprobación vive en `TICKETS.md`:** lo leen todos los agentes a través de `AGENTS.md` y `CLAUDE.md`, sin infraestructura extra. La memoria evita repetir la comprobación en cada sesión, pero se vuelve a verificar si una herramienta falla.
- Se descartó un script que verifique la conexión: cada cliente expone el conector de forma distinta y una lectura mínima con el propio conector es más confiable.

## 4. Cómo se verificó

- Documentación oficial consultada el 2026-10-09:
  - [Atlassian Rovo MCP server](https://support.atlassian.com/rovo/docs/getting-started-with-the-atlassian-remote-mcp-server/): URL v2 y comandos de Claude Code y Codex;
  - [dominios admitidos](https://support.atlassian.com/security-and-access-policies/docs/available-atlassian-mcp-server-domains/): Antigravity no figura, pero sí `localhost` para clientes locales;
  - [controles de administrador](https://support.atlassian.com/security-and-access-policies/docs/control-atlassian-mcp-server-settings/).
- **No probado:** la conexión real de Antigravity ni la de Codex. No hay acceso a esas cuentas desde esta sesión.
- **En esta sesión de Claude**, el conector de Atlassian figura instalado y sin autorizar: la comprobación de la sección 0 da "no conectado".
- Solo documentación: no cambia código, configuración ni CI.

## 5. Pendientes y riesgos

- Crear el proyecto EVP en Jira, autorizar los conectores y anotar el sitio de Atlassian en las memorias de los agentes.
- Renombrar este ticket con su clave real cuando exista.
- Si la organización restringe los dominios del Rovo MCP server, un administrador de Atlassian tiene que habilitar Antigravity.
- La ruta de configuración de Antigravity sale de guías de Google y de terceros, no de una referencia oficial. Puede cambiar entre versiones.
