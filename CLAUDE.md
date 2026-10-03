@AGENTS.md

# EverProp + Eversys Conversations — contrato para Claude

Monorepo: `everprop-api/` (Laravel 13, PHP 8.4, MySQL 8.4, Redis) y `everprop-public/` (Next.js 16). Cada subcarpeta tiene su `AGENTS.md`: leerlo antes de tocar código ahí (`everprop-api/AGENTS.md` es obligatorio para backend; en frontend, leer `node_modules/next/dist/docs/` antes de usar APIs de Next).

## Fuente de verdad del producto IA

El diseño aprobado para revisión vive en `docs/eversys-conversations/`. Ante cualquier conflicto con conversaciones, memoria o skills externas, **prevalecen esos documentos**.

| Necesito… | Leer |
|---|---|
| Alcance, personas, recorridos, estados | `product-scope.md` |
| Módulos, secuencias, handoff, RAG, límites | `architecture.md` |
| Tablas existentes, contratos de tools, errores, idempotencia | `data-and-contracts.md` |
| Decisiones y cuándo revisarlas | `adr.md` (D01–D18) |
| Amenazas, dataset, gates de release | `evaluation-and-security.md` |
| Techo USD 150 y ledger | `economics.md` |
| Qué construir y en qué orden | `implementation-backlog.md` (E01–E05, S01–S17, Q01–Q03) |

## Invariantes (no negociables)

1. Tenant siempre resuelto en servidor (`TrustedTenantResolver`, canal firmado). Nunca desde el cliente, el prompt ni el payload.
2. Sin RBAC paralelo: `users.role_code`, capacidades y scopes existentes (ADR D05).
3. Baseline SQL inmutable. Cambios solo con scripts `database/schema/forward/AAAA-MM-DD.NNN_descripcion.sql`.
4. El LLM propone; el backend autoriza. Herramientas cerradas con JSON Schema `additionalProperties:false`; tenant, actor, epoch e `idempotency_key` los genera el servidor. Sin SQL, shell ni HTTP arbitrario (D07, D09).
5. Precio, moneda, disponibilidad y códigos de unidad salen de Inventory en vivo. `12`, `12A`, `12B` son entidades distintas. Moneda `null` = no confirmada.
6. Mutaciones idempotentes: `UNIQUE(tenant_id, tool_name, idempotency_key)` + hash; mismo key con otro hash = 409.
7. Receipt/outbox durables antes de ACK; `UNKNOWN` nunca se reintenta a ciegas (D10).
8. Handoff con `control_epoch` y serializador de envío; salida IA con epoch viejo se descarta (D11).
9. Visita solicitada = `REQUESTED`, nunca "confirmada" sin confirmación humana persistida (D12).
10. Presupuesto: reserva atómica en ledger antes de cada llamada facturable (D14). Nunca bajar seguridad para cumplir costo.
11. Sin commit, push, PR, deploy, migraciones sobre datos reales ni conexiones a Meta/proveedores sin autorización expresa del usuario (X04).

## Comandos (Docker, PHP 8.4)

Los comandos de backend se corren **desde `everprop-api/`** (ahí está `compose.yaml`). Rutas como `scripts/`, `config/` y `tests/` son relativas a esa carpeta.

```powershell
cd everprop-api
docker compose --project-name everprop-api exec everprop-api-php vendor/bin/pint --test
docker compose --project-name everprop-api exec everprop-api-php vendor/bin/phpstan analyse
docker compose --project-name everprop-api exec everprop-api-php php artisan test
cd ..; node evals/validate.mjs     # desde la raíz: valida el dataset de evaluación
```
Frontend: `npm run lint` y `npm run build` dentro de `everprop-public/`. No usar SQLite para afirmar compatibilidad.

## Equipo de subagentes (`.claude/agents/`)

| Agente | Usar para | Backlog |
|---|---|---|
| `conversation-runtime-engineer` | receipts, turnos, outbox, epoch, handoff, dispatcher | S03, S07 |
| `agent-runtime-engineer` | coordinador IA, gateway de tools, schemas, ledger, ingestión RAG léxica | S08–S13 |
| `channel-integrations-engineer` | widget web, adaptador WhatsApp, firmas, ChannelPolicy | S05, S06, S17 |
| `schema-migration-guardian` | revisar scripts forward y reconciliación de esquema | S01, E03 |
| `tenant-isolation-reviewer` | revisar cualquier diff con queries, policies, jobs, cachés | E01, E02, Q02 |
| `llm-security-reviewer` | revisar prompts, tools, RAG, salidas del modelo | S09–S12, Q02 |
| `eval-engineer` | dataset, gates, reporte por segmento | Q01 |

Bandeja de asesores (S04) y consola: se implementan directo en `everprop-public/` siguiendo su `AGENTS.md`; revisión con `tenant-isolation-reviewer`.

Flujo por ítem de backlog (skill `backlog-item`): planificar leyendo el doc correspondiente → implementar (agente implementador) → **revisión obligatoria** por `tenant-isolation-reviewer` si toca datos y por `llm-security-reviewer` si toca IA → correr tests → reportar evidencia (commit, entorno, fecha). Un revisor nunca revisa su propio código. Los subagentes no lanzan otros subagentes: el hilo principal orquesta implementación y revisión.

## Definition of Done

Tests proporcionales al riesgo, incluyendo negativos cross-tenant; migraciones probadas en MySQL aislado; docs actualizados si cambia un contrato; sin secretos en logs; evidencia registrada. No marcar "verificado" por tener tabla, healthcheck o código generado.

## Requisitos del entorno

- Plugin `llm-secure-patterns` instalado en Claude (lo usan `llm-security-reviewer`, `agent-runtime-engineer` y `channel-integrations-engineer`). Si no está, esos agentes siguen con `docs/eversys-conversations/evaluation-and-security.md` como referencia.
- `.claude/hooks/guard.mjs` requiere Node en el PATH. Es una defensa extra, no una barrera: las reglas de `AGENTS.md` aplican igual aunque un comando no esté cubierto.
