---
name: forward-migration
description: Crear un cambio de esquema MySQL en everprop-api como script forward-only (nunca editar baseline ni scripts existentes). Usar para cualquier tabla, columna, índice, constraint o stored procedure nuevo.
---

# Cambio de esquema forward-only

1. Buscar si ya existe la entidad: `grep -n "CREATE TABLE" everprop-api/database/schema/*.sql everprop-api/database/schema/forward/*.sql`. Extender antes que crear (tabla de ownership en `docs/eversys-conversations/data-and-contracts.md`).
2. Nombre: `everprop-api/database/schema/forward/AAAA-MM-DD.NNN_descripcion.sql`, con NNN siguiente al último del día. El hook `.claude/hooks/guard.mjs` bloquea editar baseline o forwards existentes.
3. Contenido: idempotente cuando MySQL lo permita, compatible con la versión anterior de la app (expand primero, contract en un release posterior), `tenant_id` + `UNIQUE(tenant_id,id)` + FKs compuestas, `DATETIME(3)`, CHECKs de enums, índices por consulta real.
4. Revisión con el agente `schema-migration-guardian`.
5. Probar en MySQL aislado (proyecto Docker distinto, p. ej. `--project-name everprop-api-migtest`) importando baseline + todos los forward con `everprop-api/scripts/import-schema.ps1`; nunca sobre la base local con datos importados ni producción.
6. Actualizar `everprop-api/config/database-contract.php` / `SchemaContractVerifier` y tests de `ReleaseSchemaTest` si el contrato cambia.
