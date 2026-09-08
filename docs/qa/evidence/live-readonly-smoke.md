# Smoke live read-only — 8 de septiembre de 2026 ART

No se usaron credenciales ni métodos mutantes. Se repitieron los probes antes del último delta frontend-only y se confirmó que `origin/main@64003ba2d849519a5f030b56d582f16e5d3e523b` no modifica backend ni infraestructura live.

| Destino | Request | Resultado final |
|---|---|---|
| Vercel | `GET /admin` | 200 HTML |
| Vercel | `GET /healthz` | 404 |
| Vercel | `GET /readyz` | 404 |
| Vercel proxy | `GET /api/v1/auth/me` | 401 anónimo, esperado |
| Vercel proxy | `GET /api/v1/public/projects` | 200; catálogo accesible |
| Railway | `GET /healthz` | 200 |
| Railway | `GET /readyz` | 503 `unavailable` |
| Railway | `GET /api/v1/auth/me` | 401 anónimo, esperado |
| Railway | `GET /api/v1/public/projects` | 200; catálogo accesible |

Auth/me y catálogo mejoraron respecto del primer corte. Sin embargo, Railway todavía no supera readiness. Vercel tampoco expone los rewrites health/ready del candidato.

La respuesta de catálogo contiene mojibake en datos persistidos, por ejemplo `El RocÃ­o`. Corregir ese dato requiere backup y migración controlada; no se mutó producción durante esta auditoría.

En `HEAD /login` de Vercel sólo se observó HSTS; no se recibieron CSP, `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy` ni `Permissions-Policy`. La versión local agrega esos headers, pero no está desplegada.
