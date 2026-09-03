# ADR 0002: Sanctum y RBAC del esquema existente

- Estado: aceptado
- Fecha: 2026-08-07

## Decisión

La autenticación first-party utiliza Sanctum con cookies y sesiones Redis. No se exponen personal access tokens, registro público ni reset de contraseña. El esquema no tiene tablas normalizadas de roles/permisos: `users.role_code` se mapea a capacidades en código y los scopes de inventario existentes refinan el acceso.

## Consecuencias

- No se instala Spatie Permission.
- La denegación es el valor por defecto.
- La credencial de password se agrega al `users` existente mediante un cambio forward-only, sin crear otra identidad.
- `SUPER_ADMIN` no recibe un `Gate::before` universal; las operaciones platform-level son explícitas y auditables.
