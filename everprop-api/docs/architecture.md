# Arquitectura

## Límites

EverProp API es un monolito modular Laravel. Los módulos viven bajo `app/Domain` y exponen comportamiento mediante servicios de aplicación, Form Requests, Resources y Policies. No hay acceso directo entre controladores y detalles de infraestructura cuando una operación compuesta necesita transacción o idempotencia.

## Módulos

- `Identity`: usuarios, autenticación y capacidades.
- `Tenancy`: resolución confiable, contexto request-scoped y aislamiento.
- `Inventory`: proyectos, propiedades, características y medios.
- `CRM`: contactos, consentimientos, leads, asignación y touchpoints.
- `Integrations`: webhooks, deduplicación y outbox.
- `Shared`: respuestas, errores, health y utilidades transversales.

## Flujo HTTP

1. Nginx acepta sólo el puerto local configurado.
2. Laravel valida hosts/proxies confiables.
3. El resolver establece una sola vez `TenantContext` desde la allowlist de hostname. Un resolver explícito alternativo existe sólo en `local` y `testing`.
4. Sanctum restaura la sesión; el middleware valida usuario y tenant activos.
5. Route binding y queries filtran por `tenant_id` antes de las Policies.
6. Form Requests permiten campos explícitos; `tenant_id` nunca es asignable.
7. API Resources controlan la salida.

## Datos

El baseline MySQL 8.4 contiene 40 tablas, 95 foreign keys, dos procedimientos y tres vistas. Las 38 tablas de dominio están tenant-scoped; `schema_versions` y `tenants` son las únicas globales. Las foreign keys compuestas son la última barrera contra relaciones cruzadas.

Los procedimientos canónicos conservan su semántica. `sp_create_or_get_open_lead` controla su propia transacción; por eso se invoca en un límite de servicio que no lo envuelve en otra transacción.

## Seguridad

- Denegación por defecto y Policies por recurso.
- Sesiones y cache en Redis con prefijo propio.
- Credenciales locales nuevas y separadas para desarrollo y testing.
- Runtime MySQL limitado a DML, lectura y `EXECUTE`.
- PII excluida de logs; errores cross-tenant responden como recurso inexistente.
- Idempotencia respaldada por constraints, no por un `SELECT` previo.
- Archivos privados por defecto y paths derivados del contexto tenant.
