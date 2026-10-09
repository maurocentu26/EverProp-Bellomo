# Cómo trabajamos en EverSys — guía para Producto

Para: Product Manager de EverSys. Fecha: 9 de octubre de 2026.
Resume cómo se organiza el desarrollo de EverProp/EverSys en Jira y en GitHub, qué hacen las personas y qué hacen los agentes de IA, y cómo conectar tu agente (Antigravity) a Jira.

## 1. El modelo en una línea

**Todo trabajo es un ticket de Jira (`EVP-XX`) → una rama en GitHub → un PR revisado por una persona → un informe escrito.** Nada llega al sistema sin pasar por esos cuatro pasos.

## 2. Dónde vive cada cosa

| Qué | Dónde | Para qué |
| --- | --- | --- |
| Tickets, prioridades, sprints | Jira, proyecto **EVP** | Qué se hace, en qué orden y quién lo hace |
| Código | GitHub `maurocentu26/EverProp-Bellomo` | La única fuente del código |
| Desarrollo en curso | Rama `develop` | Lo último que se está construyendo, incluido el asistente con IA. **Staging** se despliega desde acá |
| Lo que ve el cliente | Rama `main` | Producción de Bellomo. El módulo de IA y conversaciones **no** va a `main` |
| Informe de cada ticket | `docs/tickets/EVP-XX-....md` en el repo | Qué se pidió, qué se hizo y por qué |
| Diseño del producto IA | `docs/eversys-conversations/` | Alcance, decisiones, seguridad, costos |

## 3. Estructura de Jira

**Un solo proyecto, `EVP`.** Las áreas se separan con componentes, no con proyectos.

| Nivel | Para qué | Ejemplo |
| --- | --- | --- |
| Épica | Un resultado de negocio que lleva varias semanas | EVP-1 Cobranza automática |
| Historia | Algo que un usuario puede hacer o ver | EVP-14 El deudor recibe un recordatorio por email |
| Tarea | Trabajo técnico u operativo sin cambio visible | EVP-16 Configurar el atrapa-mails en staging |
| Bug | Algo que funciona mal | EVP-23 Los rechazos esperados se registran como error |
| Subtarea | Opcional, si una historia se reparte entre personas | — |

**Componentes:** Conversaciones, Cobranzas, CRM, Inventario, WhatsApp/Meta, Web EverSys, Plataforma (CI, staging, seguridad).

**Etiquetas que cambian el proceso:**

| Etiqueta | Efecto |
| --- | --- |
| `ia` | Requiere revisión de seguridad de IA antes del merge |
| `datos` | Requiere revisión de aislamiento entre clientes antes del merge |
| `produccion` | El cambio tiene que llegar a `main` (lo ve el cliente) |
| `bloqueado-externo` | Depende de Meta, de un proveedor o de una autorización |

**Sprints de una semana:** planificación el lunes, revisión el viernes.

## 4. Estados del ticket

```
Por hacer → En curso → En revisión → En develop → En staging → En producción → Hecho
```

| Estado | Qué significa | Quién lo mueve |
| --- | --- | --- |
| Por hacer | Priorizado y con criterios de aceptación | Producto |
| En curso | Hay una rama `ticket/EVP-XX-...` | Quien desarrolla (persona o agente) |
| En revisión | Hay un PR a `develop` y el informe del ticket | Quien desarrolla |
| En develop | El PR fue revisado y mergeado por una persona | Quien revisa |
| En staging | Desplegado y probado en staging | Quien prueba |
| En producción | Llegó a `main` (solo tickets con `produccion`) | Quien publica |
| Hecho | Cerrado | Producto |

Los tickets del módulo de IA y conversaciones terminan en **En staging**: no van a producción hasta que se decida.

## 5. Cómo se escribe un ticket

```markdown
**Objetivo:** una o dos líneas, en palabras del negocio.
**Criterios de aceptación:**
- Comprobables. Ej.: "nunca sale dos veces el mismo recordatorio".
**Fuera de alcance:** qué no incluye.
**Riesgo:** ¿toca datos de clientes o IA? → etiquetas `datos` / `ia`.
**Destino:** develop/staging o producción.
```

Ejemplo:

> **EVP-14 · Recordatorio automático por email** · Historia · Cobranzas · `datos`
> **Objetivo:** que el deudor reciba un aviso antes y después del vencimiento sin que el asesor lo mande a mano.
> **Criterios de aceptación:** 3 días antes, el día del vencimiento, y 3 y 7 días después; nunca dos veces el mismo; solo cuotas impagas con email válido; interruptor por cliente, apagado por defecto; probado en staging con atrapa-mails.
> **Fuera de alcance:** WhatsApp y conciliación de pagos.

## 6. Reglas para quien desarrolla (personas y agentes)

Están escritas en `TICKETS.md` en el repo, y los agentes las leen solos.

1. Una rama por ticket, desde `develop`: `ticket/EVP-XX-descripcion-corta`.
2. **Nadie hace push a `main` ni a `develop`.** Todo entra por PR revisado por una persona.
3. Antes de empezar un ticket nuevo, el agente pregunta si el anterior ya fue revisado.
4. Cada ticket deja un informe en `docs/tickets/` con cinco secciones:
   - qué pedía el ticket;
   - qué se implementó y cómo;
   - por qué esa solución;
   - cómo se verificó;
   - pendientes y riesgos.

   Al pasar el ticket a "En revisión", se enlaza el informe en Jira.

**Para Producto:** el informe es lo que conviene leer para aceptar un ticket, sin necesidad de leer el código.

## 7. Quién hace qué

| Rol | Hace | No hace |
| --- | --- | --- |
| Producto (vos + Antigravity) | Crea y prioriza tickets, escribe los criterios de aceptación, arma los sprints, acepta lo entregado | Merge, despliegues ni cambios de código |
| Desarrollo (Ramiro, Mauro, Álvaro) | Revisa PRs, mergea a `develop` y `main`, autoriza despliegues | — |
| Agentes de desarrollo (Claude, Codex) | Implementan tickets en su rama, prueban, escriben el informe, mueven el ticket hasta "En revisión" | Push a `main`/`develop`, merge, activar IA o WhatsApp sin autorización |

## 8. Primer sprint sugerido

| Clave | Tipo | Resumen | Etiquetas |
| --- | --- | --- | --- |
| EVP-20 | Tarea | Reenviar la verificación del negocio en Meta con un documento aceptado | `bloqueado-externo` |
| EVP-21 | Tarea | Publicar privacidad, eliminación de datos y términos en eversyssolutions.com.ar | `produccion` |
| EVP-23 | Bug | Los rechazos esperados de conversación se registran como error (ya hay un arreglo guardado) | `datos` |
| EVP-24 | Tarea | Probar avisos push en un iPhone bloqueado (S8) y el recorrido de staging S6 | — |
| EVP-14 | Historia | Recordatorio automático de cobranza por email | `datos` |

El backlog técnico existente (S01–S17, Q01–Q03 en `docs/eversys-conversations/implementation-backlog.md`) se migra como historias con la clave vieja en el resumen. Ejemplo: "[S14] Alta autoservicio de clientes". Lo ya terminado no se migra.

## 9. Conectar Antigravity a Jira

Así tu agente puede crear, editar y priorizar tickets del proyecto EVP. Usa el conector oficial de Atlassian (Rovo MCP server).

**Antes de empezar**
- Una cuenta de Atlassian con acceso al sitio de Jira de EverSys y permiso en el proyecto **EVP** (te lo da un administrador).
- Antigravity actualizado.
- Si la opción B no funciona: Node.js 18 o superior.

**Opción A — configuración directa (recomendada)**
1. En Antigravity, abrí el panel del agente → menú **"…"** → **MCP Servers** → **Manage MCP Servers** → **View raw config**. Se abre `mcp_config.json`.
2. Agregá la entrada `atlassian` dentro de `mcpServers`. Si ya hay otros servidores, sumala al lado; no reemplaces el archivo.

   ```json
   {
     "mcpServers": {
       "atlassian": {
         "serverUrl": "https://mcp.atlassian.com/v2/mcp"
       }
     }
   }
   ```

   Antigravity usa la clave **`serverUrl`**, no `url`. Con `url` el conector no carga y no muestra error.
3. Guardá y reiniciá Antigravity. Al conectarse, se abre el navegador con el login de Atlassian: entrá con tu cuenta, elegí el sitio de EverSys y aceptá los permisos.
4. Comprobá: en **MCP Servers** tiene que aparecer `atlassian` con su lista de herramientas.

**Opción B — si la A no conecta**

Usá el puente oficial `mcp-remote`, que corre en tu PC:

```json
{
  "mcpServers": {
    "atlassian": {
      "command": "npx",
      "args": ["-y", "mcp-remote@latest", "https://mcp.atlassian.com/v2/mcp"]
    }
  }
}
```

**Prueba final.** Pedile a Antigravity: *"Listá los proyectos de Jira a los que tengo acceso y mostrame los últimos 5 tickets de EVP"*. Si aparece EVP, está listo.

**Si algo falla**

| Síntoma | Causa probable | Qué hacer |
| --- | --- | --- |
| El login de Atlassian dice que la app no está permitida | La organización restringe qué herramientas pueden conectarse | Un administrador de Atlassian entra en Atlassian Administration → Rovo → **Rovo MCP server** y agrega el dominio, o habilita los dominios soportados |
| Conecta, pero las acciones fallan | Lista de IPs permitidas de la organización | Pedirle al administrador que incluya tu red |
| No aparece el proyecto EVP | Tu usuario no tiene permiso en el proyecto | Pedir acceso al administrador de Jira |
| Pide un token de API | No hace falta: el método por defecto es OAuth | No crear tokens. Si se usara uno, nunca pegarlo en el chat ni en archivos compartidos |

**Cuidado:** el agente actúa con **tus** permisos de Jira. Antes de cambios masivos (crear muchos tickets, mover un sprint entero, borrar), pedile que te muestre la lista y confirmá.

## 10. Lo que no cambia

- La aprobación de Meta y los plazos de terceros no dependen de nosotros: en Jira llevan la etiqueta `bloqueado-externo`.
- Un ticket se da por hecho cuando está probado donde corresponde, con evidencia en su informe. Un PR abierto o un checklist completo no alcanzan.

Fuentes del conector: [Atlassian Rovo MCP server](https://support.atlassian.com/rovo/docs/getting-started-with-the-atlassian-remote-mcp-server/), [control de dominios para administradores](https://support.atlassian.com/security-and-access-policies/docs/control-atlassian-mcp-server-settings/), [configuración MCP de Antigravity](https://medium.com/google-cloud/configuring-mcp-servers-and-skills-for-antigravity-cli-and-ide-a938c7eebb78).
