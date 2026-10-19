---
name: tool-contract
description: Agregar o modificar una herramienta del AgentRuntime de Eversys (buscar_propiedades, consultar_propiedad, registrar_interes, solicitar_visita, derivar_a_asesor u otra nueva) con schema cerrado, autorización en backend, idempotencia y tests. Usar antes de exponer cualquier capacidad nueva al LLM.
---

# Contrato de una herramienta

Referencia: tabla "API propuesta y herramientas" en `docs/eversys-conversations/data-and-contracts.md` y ADR D07/D09.

## 1. ¿Debe existir?
Solo si un recorrido de `product-scope.md` la necesita y no la cubre otra. Nunca herramientas genéricas (SQL, HTTP, shell, "ejecutar acción"). Cada tool nueva acredita el permiso mínimo del actor (visitante vs asesor).

## 2. Schema (lo único que ve el modelo)
- `type: object`, `additionalProperties: false`, `required` explícito.
- Strings con `maxLength`; IDs `format: uuid`; enums cerrados; montos como decimal-string + `currency` enum.
- Prohibido en `arguments`: `tenant_id`, `user_id`, `lead_id` arbitrario, `idempotency_key`, precios cotizados, URLs.

## 3. Contexto de servidor
El gateway inyecta `{tenant, actor, conversation, run, epoch, allowed_tools, trace}` y genera `idempotency_key` determinístico (conversación + run + tool + hash de argumentos canónicos).

## 4. Autorización y ejecución
- Validar schema → policy/capacidad → scope de inventario → vigencia (no eliminada/retirada) → epoch vigente.
- Ejecutar vía servicio de dominio (`InventoryQuery`, `InterestWriter`, `VisitRequester`), nunca controlador admin.
- Mutaciones: `tool_executions` + efecto + `domain_outbox` en la misma transacción local. Replay → mismo resultado; mismo key con otro hash → 409.

## 5. Respuesta
`{ok, data, meta:{schema_version, persisted, replayed, trace_id}}` o `{ok:false, error:{code, message, retryable}}`. Códigos: VALIDATION_ERROR, NOT_FOUND, FORBIDDEN, VERSION_CONFLICT, IDEMPOTENCY_CONFLICT, STALE_CONTROL, QUOTA_EXCEEDED, DEPENDENCY_UNAVAILABLE, TIMEOUT, DELIVERY_UNKNOWN. Sin stack, SQL, secretos ni IDs de otro tenant.

## 6. Tests obligatorios
Argumento extra rechazado; ID de otro tenant → NOT_FOUND; rol sin capacidad → FORBIDDEN; replay idéntico → `replayed:true` sin segundo efecto; key igual con payload distinto → 409; timeout después del commit → replay recupera resultado; epoch viejo → STALE_CONTROL; y al menos un caso nuevo en `evals/cases/` (skill `eval-case`).

## 7. Revisión
`llm-security-reviewer` + `tenant-isolation-reviewer` antes de dar por terminado.
