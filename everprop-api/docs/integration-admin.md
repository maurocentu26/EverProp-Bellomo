# Integración de `everprop-web-admin`

Estado: **READY FOR INTEGRATION**. Este repositorio no modifica el frontend.

## Configuración

- Base local: `http://127.0.0.1:18080`.
- Producción: usar el hostname tenant configurado; nunca enviar `tenant_id`.
- Agregar el origen exacto del admin a `CORS_ALLOWED_ORIGINS` y su host/puerto a `SANCTUM_STATEFUL_DOMAINS`.
- Todas las llamadas de navegador deben usar `credentials: 'include'`.

## Sesión

```ts
await fetch(`${api}/sanctum/csrf-cookie`, { credentials: 'include' });

await fetch(`${api}/api/v1/auth/login`, {
  method: 'POST',
  credentials: 'include',
  headers: {
    'Content-Type': 'application/json',
    'X-XSRF-TOKEN': decodeURIComponent(readCookie('XSRF-TOKEN')),
  },
  body: JSON.stringify({ email, password }),
});
```

Luego usar `GET /api/v1/auth/me`; logout es `POST /api/v1/auth/logout` con CSRF. Respuestas esperadas: 401 sin sesión, 403 sin capacidad, 404 para recurso inexistente o cross-tenant, 409 por versión optimista, 419 por CSRF y 422 por validación.

## Inventario administrativo

- CRUD: `/api/v1/admin/projects` y `/api/v1/admin/properties`.
- Publicación: `PATCH /admin/projects/{public_id}/publish` y `PATCH /admin/properties/{public_id}/publish`.
- Anidados: `/admin/properties/{property_public_id}/features` y `/media`.
- Los endpoints de detalle se enrutan con `public_id`. En payloads administrativos `project_id` es el identificador interno devuelto al usuario autorizado.
- Actualizar/publicar propiedad requiere `version`; un 409 obliga a refrescar antes de reintentar.
- Upload de medios usa `multipart/form-data`; no construir paths desde el cliente.

Listados aceptan `page`, `per_page` (máximo 100), `sort` y `direction`. Los filtros completos están en `openapi.yaml`. La forma paginada es `{ data, links, meta }`.

## RBAC visible para UI

`/auth/me` entrega `capabilities`. La UI debe ocultar o deshabilitar acciones no permitidas, aunque la API siempre vuelve a autorizar. `READ_ONLY` sólo lee; `SALES_ADVISOR` depende de sus scopes; `TENANT_ADMIN` administra el tenant.
