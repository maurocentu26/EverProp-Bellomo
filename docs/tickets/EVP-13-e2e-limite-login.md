# EVP-13 — El E2E de navegador choca con el límite de login del E2E de API

Rama `ticket/EVP-13-e2e-limite-login` (desde `develop`) · fecha 2026-10-12 · Claude Code con Ramiro Ruggeri
Ticket Jira [EVP-13](https://eversys.atlassian.net/browse/EVP-13).

## 1. Qué pedía el ticket

El paso "Browser E2E" de `api.yml` fallaba en los PR #12 y #13, también al reintentarlo, con `page.waitForURL: Timeout`. La captura del fallo muestra "Too Many Attempts" en el login del panel.

La causa:
- `api-vertical.mjs` hace 5 logins desde la misma IP;
- el límite `throttle:login` es justamente de 5 por minuto por IP;
- si el build del panel tarda menos de un minuto, el login del navegador recibe un 429.

En el PR #16 apareció además otra falla intermitente: el texto del visitante aparece dos veces en la bandeja, en la vista previa de la lista y en el hilo, y el locator estricto falla.

**Criterio:** el E2E no depende de la duración del build y el límite real de login no se toca.

## 2. Qué se implementó

En [ui-vertical.mjs](../../everprop-api/tests/e2e/ui-vertical.mjs):
- **Login:** después de enviar, espera dos cosas a la vez: que la página salga de `/login` o que aparezca "Too Many Attempts".
  - Si aparece el aviso, espera 61 s (la ventana del límite), recarga el formulario y reintenta una sola vez.
  - Si vuelve a quedar limitado, o no sale de `/login` en 30 s, falla con un mensaje claro.
- **Texto duplicado:** `getByText(text1).first()`. Cualquiera de las dos apariciones prueba que el mensaje llegó.

## 3. Por qué esta solución

- **No se afloja el límite de login** con `LOGIN_RATE_LIMIT_PER_MINUTE`: el CI sigue probando la configuración real, y el E2E solo respeta la ventana.
- **No se reordenan los pasos del workflow:** la dependencia de tiempo seguiría ahí, solo que más escondida.
- **Se espera el resultado que ve el usuario y no la respuesta HTTP:** el panel podría hacer el login desde el servidor, y entonces el navegador no vería esa respuesta.

## 4. Cómo se verificó

| Comprobación | Resultado |
|---|---|
| `node --check` del script | OK |
| Causa | Confirmada con la captura `fallo-1.png` del artefacto de la corrida 38321855580 ("Too Many Attempts") y el conteo de logins de `api-vertical.mjs` (5) contra el límite (5 por minuto) |
| E2E completo | Se verifica en el CI del PR de esta rama. No se corrió local porque necesita el stack completo, el panel en producción y Playwright |

## 5. Pendientes y riesgos

- Cuando el límite se activa, el E2E tarda unos 60 s más. Es aceptable en CI.
- **Al mergear,** volver a correr el CI de #12 y #13: el PR prueba el merge con `develop`.
