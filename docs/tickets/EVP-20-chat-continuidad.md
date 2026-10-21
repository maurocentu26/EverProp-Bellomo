# EVP-20: continuidad del chat web en el celular

Rama `ticket/EVP-20-chat-continuidad` desde `develop` · 2026-10-21 · Claude con Ramiro. Solo staging: es del módulo de conversaciones, que no va a `main`.

## Problema
- El widget guardaba el token del visitante en `sessionStorage`, que se borra al cerrar la pestaña. En el navegador interno de WhatsApp en iPhone, el visitante perdía la conversación cada vez que volvía.
- Cuando la sesión vencía (401), el widget borraba todo en silencio y mostraba la bienvenida, como si nunca hubiera habido una conversación.

## Cambios
- **Servidor (`PublicChatController::start`):** al abrir la sesión, devuelve también `expires_at`. Vencimiento y revocación se siguen validando **siempre en el servidor**; el dato del cliente solo sirve para descartar antes un token viejo.
- **`src/lib/chat-session.ts` (nuevo):** maneja dónde se guarda la sesión.
  - Guarda `{token, expiresAt}` en `localStorage`, con una clave por widget. Sobrevive a cerrar la pestaña y se descarta al vencer.
  - Si `localStorage` está bloqueado (modo privado de Safari, iframe restringido), usa `sessionStorage`; si ese también falla, la sesión vive solo en memoria.
  - Un valor dañado o vencido se borra.
  - El token que la versión anterior dejó en `sessionStorage` se migra una sola vez, con el TTL máximo del servidor.
- **`ChatWidget.tsx`:**
  - Lee el storage recién después de montarse, para que el servidor y el cliente muestren lo mismo en el primer render.
  - Muestra estados explícitos:
    - «Cargando tu conversación…» mientras restaura;
    - «Tu conversación anterior venció. Si escribís, empezás una nueva.» cuando la sesión venció o fue revocada, sin el historial anterior;
    - «Este navegador no guarda el chat…» cuando no hay storage persistente;
    - «No pudimos cargar tus mensajes. Seguimos intentando…» ante un error de red.

## Criterios del ticket
| # | Criterio | Estado |
|---|---|---|
| 1 | Recargar o cerrar y reabrir con la sesión vigente recupera los mensajes una sola vez | Hecho: el token persiste y la lectura incremental por cursor deduplica por `sequence` |
| 2 | Sesión vencida o revocada: estado explícito, sin el historial anterior | Hecho. El test PHP cubre vencida y revocada (401) |
| 3 | Otro visitante, widget o tenant no accede | Clave por widget en el cliente; el servidor ata el token a una conversación y un tenant (el test existente cubre el token de otro tenant) |
| 4 | Storage bloqueado o modo privado: comportamiento explícito | Hecho, con aviso y caída a otro storage |
| 5 | Prueba real en iPhone desde WhatsApp, con reinicio | **Pendiente, la hace Ramiro** (ver abajo) |
| 6 | Revisión independiente, tests, lint y build | Ver la sección siguiente |

## Verificación
- `tests/chat-session.test.mjs` (nuevo, en el CI web), 4 de 4 en verde:
  - persistencia y vencimiento;
  - aislamiento por widget;
  - storage bloqueado;
  - valor dañado y migración.
- El test encontró y corrigió un caso: un valor dañado quedaba guardado para siempre.
- ESLint, `tsc` y `next build` sin errores.
- **En el navegador, con el build de producción:**
  - con un token vencido guardado, el widget muestra «Tu conversación anterior venció» y borra el token;
  - con un token vigente y sin servidor, muestra «No pudimos cargar tus mensajes. Seguimos intentando…», no se queda en «Cargando…» y conserva la sesión.
- Test PHP en `WebChatAndUsageTest`: `expires_at` alrededor de 24 h; un token vencido y uno revocado dan 401. Corre en el CI.

## Revisiones
- **`tenant-isolation-reviewer`:** sin bloqueantes ni altos.
  - El token está atado a una conversación y a un tenant, con vencimiento y revocación validados siempre en el servidor.
  - El `expires_at` del cliente no autoriza nada.
  - El token no aparece en URLs, logs ni errores.
  - **Aceptado y documentado:** guardarlo en `localStorage` alarga la exposición hasta 24 h si hubiera XSS en el origen del widget. El widget corre en un iframe con origen propio de EverProp y la sesión abre una sola conversación.
  - **Propuesto aparte, es previo a este ticket:** `messages` y `send` no vuelven a validar el origen ni que el widget siga activo. Si se desactiva un widget, los tokens ya emitidos siguen andando hasta que vencen.
- **Revisión de código (seguridad y correctitud):** encontró 6 problemas en el widget. Se corrigieron 5:
  - con la red caída, el widget quedaba en «Cargando…» para siempre;
  - una sesión vencida guardada mostraba la bienvenida en vez de «venció»;
  - el token viejo se perdía cuando `localStorage` estaba bloqueado;
  - un 401 al enviar no reiniciaba la sesión;
  - una pestaña podía borrar la sesión nueva de otra (`dropToken` ahora solo borra el token que falló).
  - **Queda como estaba, porque es previo:** después del primer envío, el mensaje puede tardar hasta 3 s en aparecer (el próximo polling), porque `deliver` usa el `poll` del render anterior.

## Prueba en iPhone (criterio 5, la hace Ramiro en staging)
1. Desde WhatsApp, abrí un link al sitio con el widget de staging.
2. Escribí un mensaje y esperá la respuesta, de un asesor desde la bandeja.
3. Cerrá el navegador de WhatsApp y volvé a abrir el link: tiene que aparecer la conversación, sin mensajes duplicados.
4. Reiniciá el teléfono y repetí el paso 3.
5. Para ver el estado de sesión vencida: un administrador revoca la sesión, o se espera a que venza, y el widget tiene que mostrar «Tu conversación anterior venció».
6. Anotá el resultado (modelo de iPhone, versión de iOS, versión de WhatsApp, capturas) en `docs/tickets/evidence/EVP-20/`.

**Ojo:** en iOS, el navegador interno de WhatsApp puede borrar el storage de los iframes de terceros. Si en el paso 3 no se recupera la conversación, el widget va a mostrar el aviso de que no guarda el chat. Ese resultado es el que hay que documentar.
