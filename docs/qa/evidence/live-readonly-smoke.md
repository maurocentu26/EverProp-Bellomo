# Smoke live read-only — 8 de septiembre de 2026 ART

No se usaron credenciales ni métodos mutantes. Se repitieron los probes después de cerrar el entorno local.

| Destino | Request | Resultado final |
|---|---|---|
| Vercel | `GET /admin` | 200 HTML |
| Vercel | `GET /healthz` | 404 |
| Vercel | `GET /readyz` | 404 |
| Vercel proxy | `GET /api/v1/auth/me` | 401 anónimo, esperado |
| Vercel proxy | `GET /api/v1/public/projects` | 404 `Resource not found.` |
| Railway | `GET /healthz` | 200 |
| Railway | `GET /readyz` | 503 `unavailable` |
| Railway | `GET /api/v1/auth/me` | 401 anónimo, esperado |
| Railway | `GET /api/v1/public/projects` | 404 `Resource not found.` |

Auth/me mejoró respecto del primer corte, cuando devolvía 500 con detalle interno. Sin embargo, producción todavía no resuelve el catálogo Bellomo ni supera readiness. Vercel tampoco expone los rewrites health/ready del working tree.

En `HEAD /login` de Vercel sólo se observó HSTS; no se recibieron CSP, `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy` ni `Permissions-Policy`. La versión local agrega esos headers, pero no está desplegada.
