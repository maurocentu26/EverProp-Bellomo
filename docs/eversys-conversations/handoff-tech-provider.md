# Handoff: Tech Provider de Meta (para Codex)

Fecha: 2026-10-05. Rama `chore/agentic-setup` (PR #7, borrador). Autor del tramo: sesión de Claude Code con Ramiro.

Este documento no tiene secretos, credenciales ni datos personales. Las claves y contraseñas viven solo en el gestor de secretos de Railway o en el formulario de Meta.

## Límites que siguen vigentes

- Producción de Bellomo y `main`: no se tocan. No hay merge ni deploy a producción.
- Variables de IA y de Meta en staging: no se cambian (`CONVERSATIONS_AI_ENABLED=false`, `AGENT_LLM_PROVIDER=disabled`, `META_SEND_ENABLED=false`, `META_ONBOARDING_ENABLED=false`).
- En Meta no se crea, presenta ni acepta nada sin autorización explícita para esa acción concreta. No se crea otro portfolio, app ni WABA sin revisar antes los existentes.
- W9b (borrado de datos de una persona) no se implementa sin decisión legal.

## Estado por etapa

| Etapa | Qué incluye hoy |
|---|---|
| **Preparado** (código y docs, probado con simuladores) | W1 a W9a y W2 completos; guiones de video, textos de justificación, checklist de staging y apagado en `meta-app-review.md`; guion de la prueba S6 |
| **Publicado** (desplegado en staging) | API, panel, worker y scheduler de `bellomito-staging` corriendo `chore/agentic-setup`; páginas `/privacidad` y `/eliminacion-de-datos` del panel de staging (no son las finales, ver abajo) |
| **Presentado a Meta** | Nada. No se creó la app, no se configuró Embedded Signup, no se pidió App Review |
| **Aprobado por Meta** | Nada. El Business Portfolio "EverSys Solutions" existe pero no está verificado |

Los tests con Meta simulado no prueban la integración real. Nada de esto vio un mensaje real de WhatsApp.

## Commits (todos en GitHub)

| Ítem | Commit | Qué hace |
|---|---|---|
| W1 | `57ca823` | Páginas públicas de privacidad y eliminación de datos en el panel |
| W3 | `94631e8` | Token de proveedor cifrado por tenant |
| W4 | `d4fb309` | Alta con Embedded Signup, backend |
| W5 | `4544e93` | Botón "Conectar WhatsApp" en el panel |
| W7 y W8 | `209d2c4` | Revocación automática del token (error 190) y Graph v24.0 |
| W6 | `e5de5bb` | `account_update` y recibo durable del webhook |
| W9a | `7218154` | Desconectar WhatsApp sin dejar credenciales |
| Corrección | `5f046b5` | Receipts aislados por tenant y alta/baja serializadas por WABA (Codex) |
| W2 | `3c0872c` | Ventana de 24 h por conversación y número |
| W2, panel | `11e7c94` | La bandeja muestra hasta cuándo se puede responder |
| W10/W11 | `8c52031` | Preparación de la prueba real y del App Review |
| S6 | `ad58fd6` | Guion de la prueba S6 en staging |
| S6, evidencia | `07051db` | Evidencia de la preparación de S6 registrada por Codex |
| Bandeja | `96f0ab3` | Bandeja estilo WhatsApp y arreglo del zoom de la PWA en iOS |
| CI | `27e7dd1` | El E2E busca el campo de respuesta por su etiqueta |
| CI | `17845cc` | El E2E guarda todas las capturas cuando falla (Ramiro) |

## URLs públicas

| URL | Estado verificado el 2026-10-05 |
|---|---|
| `https://api-staging-30f3d.up.railway.app/readyz` | 200 |
| `https://panel-staging-staging-62ec.up.railway.app/privacidad` | 200 |
| `https://panel-staging-staging-62ec.up.railway.app/eliminacion-de-datos` | 200 |
| Webhook de staging (para cuando exista la app): `https://api-staging-30f3d.up.railway.app/api/v1/webhooks/meta/whatsapp` | No configurado en Meta |
| `https://eversyssolutions.com.ar` | 200, "EverSys Solutions". Sin páginas legales: `/privacidad`, `/politica-de-privacidad`, `/privacy`, `/eliminacion-de-datos` y `/terminos` dan 404 |
| `https://eversys.com.ar` | 200, "Eversys - Desarrollo de Sistemas". **Titularidad no verificada:** puede ser otra empresa con nombre parecido. Confirmar antes de elegir el nombre visible de la app en Meta |

## Web de EverSys y páginas legales

- La web institucional es `eversyssolutions.com.ar`. El repo y el hosting de esa web no están en este monorepo, y desde esta sesión no sé quién la administra.
- **Las páginas legales finales de EverSys no existen.** Lo único publicado son las páginas del panel de staging. Tienen tres problemas para la app de Meta:
  - el título dice "· Bellomo";
  - el texto nombra al proveedor como EverProp;
  - no tienen email de contacto.
- La propuesta para publicarlas reutilizando lo existente está en `meta-app-review.md`, sección 4. Faltan datos que solo pueden confirmar Ramiro y Álvaro: titular legal, nombre comercial, email de contacto, dominio, plazos de retención (D18) y revisión legal. No se publican CUIT, domicilio ni plazos sin esos datos.

## Verificaciones hechas

- CI del PR #7: guard, evals, panel y API (con el E2E de navegador) en verde en `17845cc`, que incluye `27e7dd1`.
- Staging: los cuatro servicios en `8c52031` según la evidencia de Codex (`staging-evidence.md`); `production-check` con 24 OK y 0 FAIL en API y worker; cola en 0.
- Tests locales en MySQL 8.4 aislado: suite backend completa en verde en cada ítem; panel 65/65, build OK.
- Revisiones independientes de aislamiento por ítem (y de seguridad LLM en notas internas), con hallazgos aplicados.

## S6: dónde quedó

- P1 a P4 verificados por Codex.
- P5 resuelto: Claude hizo de visitante desde su navegador integrado, aislado del de Ramiro.
- **A1 hecho:** el visitante escribió "Hola, busco un lote en Bellomo [prueba S6-A]" en el widget de staging (sesión 201, mensaje 201).
- **Pendiente:** el asesor tiene que seguir de A2 a A5 en el panel de staging, y después corresponden A6, A7, los recorridos B y C y las tres consultas de solo lectura de `staging-s6.md`. **S6 no está verificado.**

## Pendientes, en orden

1. Completar S6 en staging siguiendo `staging-s6.md`. Es el único requisito de X04 que no depende de Meta ni de la decisión legal.
2. Esperar a que Ramiro y Álvaro confirmen el titular legal, el nombre comercial (EverSys o EverProp, y el posible choque con `eversys.com.ar`), el email de privacidad y el dominio. Recién ahí, publicar las páginas legales de EverSys.
3. Con autorización para cada acción: verificar el portfolio existente (X01), crear y configurar la app (checklist en `meta-app-review.md`, sección 2), grabar los videos y presentar el App Review.
4. Prueba real con número de prueba solo con X04 escrita, y apagado según `meta-app-review.md`, sección 5.

## Trabajo en curso que no es de Meta

S02 (multi-cliente): la API acepta un **canal firmado** desde el panel para elegir el cliente por dominio (`TENANT_PANEL_SIGNING_KEY`, que vale lo mismo en API y panel). **Staging no cambia** mientras esa variable no se defina: sin ella, la API sigue resolviendo por su propio host, como hoy. No hace falta tocar staging por este cambio.
