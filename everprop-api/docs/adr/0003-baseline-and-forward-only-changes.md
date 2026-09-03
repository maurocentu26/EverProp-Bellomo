# ADR 0003: baseline inmutable y cambios forward-only

- Estado: aceptado
- Fecha: 2026-08-07

## Decisión

El baseline SQL canónico se conserva byte por byte y se importa de forma reproducible en bases dedicadas. No se traduce a 40 migraciones Laravel. Los cambios posteriores se almacenan separados, son forward-only y registran versión sin reescribir el baseline.

## Consecuencias

- Todo import verifica SHA-256 antes de ejecutar SQL.
- El verificador distingue el contrato baseline de extensiones conocidas.
- No se autoriza `migrate:fresh` fuera de una base `_test` dedicada.
