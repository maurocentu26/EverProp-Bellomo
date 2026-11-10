# EVP-121 — La página entera se desplaza en la bandeja de Conversaciones

Rama `ticket/EVP-121-scroll-bandeja`, desde `develop` en `c4c6fb7` · 2026-11-10.

## Problema

En desktop, `/admin/conversaciones` dejaba desplazar el documento completo además de la lista y el hilo. La bandeja quedaba cortada arriba y aparecía un espacio vacío abajo.

## Causa

Los textos solo para lectores de pantalla de cada fila (`sr-only`, por ejemplo «, Instagram») son `position: absolute`. Ni la lista (`.conversation-rows`) ni el hilo (`.wa-thread`) estaban posicionados, así que el bloque contenedor de esos textos era el documento. Como no los recortaba el `overflow` de la lista, estiraban el `html`. En staging, con 1440×900, el documento medía **1702 px**, y cualquier `focus()` o rueda del mouse fuera de la lista lo desplazaba.

La cadena de alturas de `MainLayout.tsx` (`h-dvh`, `min-h-0`, `overflow-hidden`) estaba bien.

## Cambio

En `everprop-public/src/app/admin-design.css`, la bandeja y sus contenedores con scroll (`.conversation-workspace-inbox`, `.conversation-rows`, `.wa-thread` y `.conversation-client-drawer-body`) pasan a `position: relative`. Ahora contienen sus elementos absolutos, que se recortan y se desplazan con ellos.

Elementos absolutos que podían verse afectados:
- El botón para bajar, las respuestas rápidas, el menú y el aviso de retomar se posicionan contra `.conversation-chat`, que no cambia. No están dentro del hilo.
- El punto de canal se posiciona contra su avatar, que no cambia.
- En móvil, el chat a pantalla completa es `fixed`, así que no lo afecta un ancestro `relative`.

## Verificación

Se probó en `bellomito-staging` inyectando la regla en la página, con la sesión de Mauro y el navegador del panel.

| Caso | Sin la regla (develop) | Con la regla |
|---|---|---|
| 1440×900, bandeja | `scrollHeight` 1702 | 900 |
| Conversación abierta y respuesta enfocada | 1702 | 900, `scrollY` 0 |
| Panel del cliente acoplado | — | 900 |
| Texto Grande y tema oscuro | — | 900 |
| 295×682 (móvil), conversación abierta | 1782 | 682 |

Es un cambio solo de CSS, sin lógica, así que no lleva test. No se corrieron `npm run lint` ni `npm run build` localmente; quedan para CI.

## Cierre (2026-11-10)

- **PR:** [#115](https://github.com/maurocentu26/EverProp-Bellomo/pull/115), commit `ee539c0`. Los dos checks de CI pasaron.
- **Merge:** Mauro lo mergeó a `develop` como `af48abd` el 2026-11-10 a las 18:28 UTC.
- **Despliegue:** `bellomito-staging / staging` (deployment `7690686001`) terminó en `success` a las 18:30 UTC.

**Validación en staging** con el código desplegado, sin inyectar nada, en el navegador del panel con la sesión de Mauro. Confirmé que `.conversation-rows` tiene `position: relative`.

| Caso | Alto del documento | `scrollY` |
|---|---|---|
| 1440×900, bandeja | 900 | 0 |
| Conversación abierta y respuesta enfocada | 900 | 0 |
| Panel del cliente acoplado | 900 | 0 |
| Texto Grande y tema oscuro | 900 | 0 |
| `scrollBy(0, 500)` sobre la página | 900 | 0 |
| 375×812 (móvil), bandeja | 812 | 0 |
| Móvil, conversación a pantalla completa | 812, chat en top 0 y 812 de alto | 0 |
| Móvil, volver a la bandeja | 812 | 0 |

Todos los criterios de aceptación de EVP-121 se cumplen.

Riesgo: bajo. Es una sola regla de CSS en la vista de Conversaciones; está en `develop` y nunca va a `main`.
