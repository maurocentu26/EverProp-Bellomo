# EVP-40 — Confirmación previa del usuario antes de dar de alta el lead por IA

- **Ticket Jira:** [EVP-40](https://eversys.atlassian.net/browse/EVP-40)
- **Rama:** `ticket/EVP-40-confirmacion-alta-lead`

## Contexto y problema

Cuando el asistente de IA capturaba los datos de contacto de un visitante en la conversación, invocaba inmediatamente la herramienta de alta de lead (`registrar_contacto` o `registrar_interes`) en el mismo turno en que el usuario escribía sus datos, sin mostrarle primero qué información iba a registrarse ni darle la oportunidad de verificar o corregir errores de tipeo antes de crear el alta en el CRM.

## Solución implementada

- **`PromptBuilder.php` (Regla 4 del prompt de sistema):**
  - Se actualizó la instrucción para exigir un flujo en dos pasos:
    1. Cuando el visitante proporciona sus datos de contacto (nombre, teléfono o email), el asistente debe mostrarle primero un resumen claro en el chat con los datos que se van a ingresar (nombre, teléfono/email y propiedad o consulta si aplica) y solicitar su confirmación explícita.
    2. Recién cuando el visitante confirma los datos en su siguiente mensaje, el asistente invoca `registrar_contacto` o `registrar_interes`.
- **`RegistrarContacto.php` y `RegistrarInteres.php`:**
  - Se reforzaron las descripciones de ambas herramientas (`description()`) indicando explícitamente al modelo que solo deben invocarse después de haber presentado los datos al visitante en la conversación y haber recibido su confirmación.

## Archivos modificados

- `everprop-api/app/Domain/AgentRuntime/Coordinator/PromptBuilder.php`
- `everprop-api/app/Domain/AgentRuntime/Tools/RegistrarContacto.php`
- `everprop-api/app/Domain/AgentRuntime/Tools/RegistrarInteres.php`
- `docs/tickets/EVP-40-confirmacion-alta-lead.md`

## Verificación

- `AgentTurnTest`, `Pint` y `PHPStan` ejecutados en el contenedor `everprop-api-php`.
