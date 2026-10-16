---
name: backlog-item
description: Ejecutar un ítem del backlog de Eversys Conversations (E01–E05, S01–S17, Q01–Q03) de punta a punta con el equipo de subagentes, respetando dependencias, gates y Definition of Done. Usar cuando el usuario pide "hacer S03", "arrancar G1", "implementar el handoff", etc.
---

# Ejecutar un ítem del backlog

1. **Ubicar el ítem** en `docs/eversys-conversations/implementation-backlog.md`: responsable, dependencias, criterio de aceptación, prueba/evidencia. Si una dependencia no está hecha, decilo y proponé hacerla primero. Si depende de X01–X04 (Meta, datos reales, proveedor, deploy), avanzá solo con simuladores y marcá el bloqueo.
2. **Leer el contrato**: la sección del doc que el ítem referencia (`data-and-contracts.md`, `architecture.md`, `evaluation-and-security.md`) y el código real que va a tocar. Rastrear el flujo de punta a punta antes de proponer cambios.
3. **Plan corto** al usuario: archivos a tocar, esquema nuevo (si hay), tests que van a demostrar el criterio de aceptación, riesgos. Pedir confirmación si el cambio toca esquema, permisos o contratos públicos.
4. **Implementar** con el agente dueño:
   - Runtime conversacional/handoff → `conversation-runtime-engineer`
   - IA, tools, ledger, RAG → `agent-runtime-engineer`
   - Canales → `channel-integrations-engineer`
   - Esquema → `schema-migration-guardian`
   - Correcciones E01–E05 → hacerlas directamente siguiendo `everprop-api/AGENTS.md`
5. **Revisión independiente obligatoria** (en paralelo): `tenant-isolation-reviewer` si toca datos/queries/jobs; `llm-security-reviewer` si toca IA/prompts/RAG/salidas. Corregir todo BLOQUEANTE/ALTO y volver a pedir revisión.
6. **Verificar**: pint, phpstan, `php artisan test` (MySQL en Docker), lint/build del frontend si aplica, `node evals/validate.mjs` si hubo casos nuevos. Correr, no suponer.
7. **Evidencia**: resumen con commit base, entorno, fecha, tests agregados y resultado, gaps conocidos. Actualizar el doc de contrato si cambió. No commit/push sin autorización.
