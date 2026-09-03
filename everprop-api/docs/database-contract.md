# Contrato de base de datos

## Baseline inmutable

- Archivo: `database/schema/bellomo_crm_omnichannel_mysql8.baseline.sql`
- SHA-256: `4C8B170BC6F8B6827E9B85E756ACB2254CCF392B0FF4C11459C775366BAE472D`
- Base declarada: `bellomo_crm`
- 40 tablas; 38 tenant-scoped.
- Tablas globales exactas: `schema_versions`, `tenants`.
- 95 foreign keys, 2 procedimientos y 3 vistas.

El baseline se copia byte a byte y nunca se modifica. `scripts/import-schema.ps1` verifica el hash antes de importar en las bases dedicadas. `php artisan everprop:schema:verify` compara hash, objetos y runtime sin usar root.

## Evolución

Los cambios viven en `database/schema/forward/`, son idempotentes y forward-only. La extensión `2026-08-07.001_add_users_password_hash.sql` agrega `users.password_hash` al usuario canónico; no crea una tabla de identidad paralela.

No usar `migrate:fresh` salvo en una base dedicada terminada en `_test`. No convertir el baseline en 40 migraciones manuales.

## Integridad multitenant

Las relaciones operativas usan `(tenant_id, id)` y foreign keys compuestas. La aplicación suma `TenantContext`, query explícita, scope defensivo, policy y pruebas negativas; ninguna capa se considera suficiente por sí sola.

## Procedimiento de leads

`sp_create_or_get_open_lead` serializa por contacto, reutiliza el lead abierto y ejecuta round-robin. El procedimiento controla y confirma su propia transacción. Por eso el endpoint público usa fases idempotentes: resolver contacto, ejecutar procedure y completar touchpoint/consentimiento/outbox en una transacción posterior. Un corte entre fases se completa al reintentar; no existe atomicidad única a través del `CALL` sin una futura revisión del procedure.
