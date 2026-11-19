# EVP-145: cabeceras HSTS, X-Content-Type-Options y Referrer-Policy en el panel

Rama `ticket/EVP-145-cabeceras-seguridad`, creada desde `develop` @ `57af421` · 2026-11-16 · Ramiro Ruggeri con Claude

## Problema

Hallazgo SEC-06 de la auditoría QA de staging del 2026-11-12. El panel ya enviaba `frame-ancestors 'none'` y `X-Frame-Options: DENY`, pero le faltaban tres cabeceras:
- `Strict-Transport-Security`;
- `X-Content-Type-Options`;
- `Referrer-Policy`.

## Cambio

En `everprop-public/next.config.ts` se agregó una regla base `/:path*` para todas las respuestas, incluido el widget:

| Cabecera | Valor |
|---|---|
| `Strict-Transport-Security` | `max-age=31536000; includeSubDomains` (sin `preload`, a propósito) |
| `X-Content-Type-Options` | `nosniff` |
| `Referrer-Policy` | `strict-origin-when-cross-origin` |

**Orden de las reglas:** Next aplica todas las reglas que coinciden, en orden, y si dos definen la misma cabecera gana la última. Por eso la regla base va primero y las más específicas pueden pisarla:
- el callback de Instagram conserva `Referrer-Policy: origin`;
- el widget conserva su `frame-ancestors` y sigue sin `X-Frame-Options`, así que se puede seguir embebiendo desde los orígenes permitidos.

**HSTS en local:** los navegadores ignoran HSTS sobre http, así que el desarrollo local no se ve afectado.

## Verificación

- **Servidor real:** `next dev` (webpack) en el puerto 3145, con `curl` a cada ruta:

  | Ruta | Resultado |
  |---|---|
  | `/login` y `/admin` | Las 3 cabeceras nuevas, más `frame-ancestors 'none'` y `X-Frame-Options: DENY`. |
  | `/widget/{id}` | Las 3 cabeceras y `frame-ancestors 'self'` (el valor por defecto de `EVERSYS_WIDGET_FRAME_ANCESTORS`), sin `X-Frame-Options`. |
  | `/integrations/instagram/callback` | Las 3 cabeceras, con `Referrer-Policy: origin`. |

- **Test nuevo** `tests/security-headers.test.mjs`: evalúa `headers()` con la misma regla de "gana la última" y comprueba los tres casos de arriba. Pasa con el cambio y falla sin él. También falla si la regla base queda después de la de Instagram.
- **Tests del frontend:** `node --test` sobre todos los archivos `tests/*.test.mjs`: 223 pasan y 1 falla. La falla, `assistant-trace.test.mjs`, ocurre igual en `develop` sin este cambio.
- **Calidad:** `tsc --noEmit` y ESLint en `next.config.ts` sin errores.

## Pendientes

- **Staging y producción:** confirmar con `curl -I` sobre el dominio desplegado. Que cada dominio sirva HTTPS ya está asegurado por Vercel.
- **`includeSubDomains`:** cubre los subdominios del host del panel. Si algún subdominio del mismo host sirve http, dejaría de funcionar en el navegador. Hoy no hay ninguno conocido.
- No es del módulo de IA, así que puede ir a `main`. Sin variables nuevas.
