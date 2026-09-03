# Integración de `everprop-bellomo`

Estado: **READY FOR INTEGRATION**. Este repositorio no modifica la web Next.js.

## Catálogo

- `GET /api/v1/public/projects`
- `GET /api/v1/public/projects/{public_id}`
- `GET /api/v1/public/properties`
- `GET /api/v1/public/properties/{public_id}`

Sólo se exponen proyectos `PRE_SALE`, `UNDER_CONSTRUCTION` o `COMPLETED` y propiedades `AVAILABLE`. Propiedades asociadas a un proyecto `PLANNING` quedan ocultas. Los recursos públicos no incluyen `tenant_id` ni IDs internos.

La web usa su hostname tenant en producción. El header `X-Everprop-Tenant` es exclusivo de local/testing. Listados aceptan paginación, filtros y ordenamientos documentados en `openapi.yaml`.

## Envío de leads

`POST /api/v1/public/leads` exige `Idempotency-Key` estable por envío, aplica rate limit y rechaza campos inesperados. No enviar `tenant_id`. Para una llamada desde un origen configurado como Sanctum stateful, obtener primero `/sanctum/csrf-cookie` y enviar `X-XSRF-TOKEN` con credenciales.

Un primer alta devuelve 201; una repetición idéntica devuelve 200 con `idempotent_replay: true`; reutilizar la clave con otro payload devuelve 409. Los datos admitidos incluyen contacto, identidad, consentimiento opcional, fuente del lead, propiedad pública opcional y touchpoint.

## Cache y errores

No cachear respuestas 4xx/5xx ni datos administrativos. Tratar 404 como no publicable sin distinguir si existió. La respuesta de validación es 422; 429 indica rate limit. Health y readiness viven en `/healthz` y `/readyz` y no contienen metadatos sensibles.
