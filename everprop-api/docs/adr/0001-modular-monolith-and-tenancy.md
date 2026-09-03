# ADR 0001: monolito modular y tenancy compartida

- Estado: aceptado
- Fecha: 2026-08-07

## Decisión

Se adopta un monolito modular Laravel con base compartida y esquema compartido. `TenantContext` es request-scoped, inmutable y obligatorio para operaciones tenant-scoped. El aislamiento combina resolución confiable, queries explícitas, scopes defensivos, Policies, foreign keys compuestas y pruebas de integración.

## Motivos

El baseline validado ya expresa las invariantes multitenant en MySQL. Separar bases o introducir microservicios rompería ese contrato sin aportar valor al primer ciclo de integración.

## Consecuencias

- No se acepta `tenant_id` del cliente.
- Los jobs transportan sólo IDs escalares confiables y mantienen `tenant_id` explícito en cada query; si un job usa modelos tenant-aware, debe restablecer y limpiar `TenantContext`.
- El acceso platform-level requiere servicios explícitos y auditables; no existe bypass global.
