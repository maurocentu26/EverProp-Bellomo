# Informe ejecutivo preproducción — EverProp Bellomo

## Resumen ejecutivo

**Veredicto senior: GO para revisión, CI y staging; NO-GO para habilitar usuarios reales en el despliegue actual.** El candidato integrado está técnicamente verde en local, pero Railway continúa con `/readyz` 503 y todavía faltan pruebas operativas de backup/restore, storage durable, worker/scheduler y matriz real de seis roles.

- **Fuente integrada:** `origin/main@64003ba2d849519a5f030b56d582f16e5d3e523b`, incluido el último ajuste de Mauro sobre destinatarios de notificaciones.
- **Rama aislada:** `codex/preproduction-audit-20260908`; no se trabajó sobre `main` ni sobre una rama de Mauro.
- **Alcance correcto:** panel Bellomo `/admin` mostrado por el usuario.
- **Merge:** 39 archivos upstream, 3.374 altas, 1.094 bajas y 12 conflictos resueltos manualmente.
- **Candidato local:** frontend, backend, contrato, navegador desktop/mobile e imagen productiva en verde.
- **Hallazgos nuevos del merge:** 5 defectos P0/P1 encontrados y cerrados antes de publicar la rama.
- **Live read-only:** Vercel `/admin` 200 y catálogo 200; Railway catálogo 200, pero readiness sigue 503.

## Lectura visual del estado

| Dimensión | Estado | Lectura humana |
|---|---|---|
| Código candidato | 🟢 | Compila, tipa, testea y empaqueta. |
| Navegador | 🟢 | Chrome desktop/mobile: 6/6 mock y 2/2 API real. |
| Backend/tenancy | 🟢 | 63/63 tests, 223 aserciones, schema y RBAC verdes. |
| Dependencias | 🟢 | npm y Composer sin advisories reportados. |
| Datos Bellomo | 🟢 local | 73 lotes únicos; fixture y cambio AP8 alineados. |
| Calidad frontend | 🟡 | 0 errores y 83 warnings no bloqueantes. |
| Operación live | 🔴 | Railway `/readyz` 503. |
| Recuperación | 🔴 | Sin restore/rollback/storage durable ensayados. |

Flujo de decisión:

`rama integrada` → `CI/revisión` → `staging Bellomo` → `smoke + roles + restore` → `GO producción`

El candidato está en el primer nodo; saltear los controles intermedios no está recomendado.

## Qué incorporamos de Mauro

- Rediseño responsive del dashboard y navegación móvil.
- Modo oscuro y refinamientos visuales del panel.
- Filtros compactos por desarrollo, estado y manzana.
- Navegación clickeable de propiedades y accesos rápidos.
- Inventario visual de 73 lotes Bellomo.
- Audio/notificación de escritorio conservados sobre el transporte seguro existente.
- Cambio comercial de AP8 lotes 17 y 18 a `RESERVED`.

## Qué corregimos o descartamos del merge

1. **Notificaciones P0:** se eliminaron Route Handlers/SSE globales en memoria que no exigían sesión, tenant, CSRF ni límites. El navbar vuelve a usar polling contra Laravel autenticado y tenant-scoped.
2. **Sin falsos datos:** una API vacía o fallida ya no repone notificaciones desde `localStorage`; los errores permanecen visibles.
3. **Navegación segura:** `actionUrl` sólo acepta rutas same-origin bajo `/admin`; se rechazan URL externas, protocol-relative y esquemas ejecutables.
4. **Destinatario estricto:** el último cambio de Mauro se conservó sin privilegio especial para admin, aliases personales hardcodeados ni pseudo-broadcast; API y mock exigen coincidencia explícita de ID/email.
5. **RBAC de UI:** creación, edición, asignación, etapas, settings y quick actions respetan capabilities en desktop y móvil.
6. **Filtros coherentes:** al cambiar de proyecto se limpia una manzana incompatible; chips con ARIA y cierre por Escape.
7. **Alta sin flash de permisos:** el guard se evalúa antes de montar el formulario de propiedad.
8. **Merge compilable:** se eliminó una declaración duplicada introducida al resolver navegación.
9. **Tenancy en leads:** un tenant sin etapa ya no intenta usar `stage_id=1` ajeno ni devuelve 500; responde 422 y revierte la transacción.
10. **Datos AP8:** lotes 12/14/15/16 vuelven a `AVAILABLE`, 17/18 quedan `RESERVED`; una migración forward-only aplica el cambio de Mauro a bases existentes.
11. **Texto y estados:** se corrigieron mojibake visibles y defaults de estado; agenda/visitas demo continúan ocultas o explícitamente no persistentes en modo API.

## Evidencia cuantitativa final

| Gate | Resultado |
|---|---|
| Vitest | 6 archivos, 22/22 PASS |
| TypeScript | PASS |
| ESLint estricto | PASS, 0 errores |
| ESLint completo | 83 warnings |
| Next 16.3.4 build | PASS; 15 rutas, 14 bajo `/admin` |
| npm audit runtime | 0 vulnerabilidades |
| Playwright mock | 6/6 PASS, desktop + mobile |
| Playwright API | 2/2 PASS, desktop + mobile |
| Composer validate/audit | PASS, 0 advisories |
| Pint | PASS, 144 archivos |
| PHPStan | PASS, 0 errores |
| PHPUnit | 63/63 PASS, 223 aserciones |
| Schema dev/test | 42 tablas, 39 tenant-scoped, 98 FK, 2 procedures, 3 views |
| Baseline SQL | SHA-256 canónico intacto |
| OpenAPI ↔ Laravel | 55/55 PASS; Redocly PASS |
| HTTP local | 7/7 PASS |
| MySQL runtime | DML + `EXECUTE` sólo sobre su base |
| Imagen backend | 236.540.523 bytes, usuario `everprop`, sin env ni PHPUnit; migración forward incluida |

El recorrido API real verificó login Sanctum, alta 201, persistencia tras reload, navegación, logout 204 y protección back/forward. Durante esa prueba apareció el 500 por etapa ausente; se reprodujo, corrigió, cubrió con PHPUnit y luego el E2E quedó 2/2 verde.

## Cobertura funcional histórica y delta integrado

El inventario normalizado previo al merge contiene 90 comportamientos únicos sobre 513 marcadores estáticos:

| Estado | Casos | Proporción |
|---|---:|---:|
| PASS | 67 | 74,4% |
| FAIL | 9 | 10,0% |
| BLOCKED | 14 | 15,6% |
| Total | 90 | 100% |

Ese número es una línea base auditada, no una afirmación artificial de que cada instancia repetida sea un caso distinto. El delta de Mauro se cubrió con revisión de los 39 archivos, resolución de 12 conflictos, nuevas regresiones unitarias, build y los 8 recorridos Playwright. El detalle botón/acción sigue en `INTERACTION_INVENTORY.csv`.

## Defectos

| Severidad | Total | Cerrados verificados | Mitigados | Abiertos |
|---|---:|---:|---:|---:|
| P0 | 3 | 2 | 0 | 1 |
| P1 | 17 | 11 | 4 | 2 |
| P2 | 6 | 1 | 2 | 3 |
| P3 | 1 | 0 | 0 | 1 |
| **Total** | **27** | **14** | **6** | **7** |

Los cinco defectos agregados en esta integración quedaron cerrados; el P0 abierto es operativo y corresponde al despliegue live no listo.

## Estado live read-only al cierre

| Destino | Resultado |
|---|---|
| Vercel `/admin` | 200 |
| Vercel `/healthz`, `/readyz` | 404 / 404 |
| Vercel auth anónima | 401 correcto |
| Vercel catálogo projects | 200, mejora respecto del corte anterior |
| Railway `/healthz`, `/readyz` | 200 / 503 |
| Railway auth anónima | 401 correcto |
| Railway catálogo projects | 200, mejora respecto del corte anterior |

La respuesta de catálogo live aún muestra mojibake en nombres ya persistidos (por ejemplo, `El RocÃ­o`). El código local corrige textos de fixture, pero limpiar datos persistidos requiere una migración de datos separada y respaldo previo.

## Riesgos que impiden el GO productivo

1. Railway no declara readiness: `/readyz` continúa en 503.
2. Agenda/visitas no dispone de persistencia server-side integral; en API se oculta o informa como no persistente.
3. Worker, scheduler, failed jobs y alertas no están demostrados en el entorno final.
4. Storage durable, backup reciente, restore y rollback no fueron ensayados.
5. Falta E2E real positivo/negativo con las seis identidades y dos tenants.
6. Falta accesibilidad ampliada: axe, lector, zoom 200% y motores distintos de Chrome.
7. Quedan 83 warnings de mantenibilidad, no bloqueantes para staging pero sí deuda explícita.

## Condiciones exactas para aprobar producción

1. Revisar el diff y exigir CI verde sobre el SHA publicado de esta rama.
2. Desplegar este candidato a staging, no directamente a producción.
3. Corregir readiness y validar host→tenant, cookies, CORS, CSRF, trusted hosts y catálogo.
4. Ejecutar matriz de seis roles y dos tenants con casos negativos de escritura/IDOR.
5. Verificar worker/scheduler, storage durable y alertas.
6. Crear backup, restaurarlo en aislado y ensayar rollback con RPO/RTO registrados.
7. Repetir Playwright API y smoke HTTP sobre staging.
8. Habilitar usuarios sólo con ventana de rollback y responsable operativo presente.

## Recomendación final

Publicar la rama para revisión y avanzar inmediatamente a CI/staging. **No usar la versión live como operación empresarial mañana mientras Railway siga en 503 y no exista evidencia de recuperación.** El código candidato dejó de tener bloqueantes locales conocidos en los flujos cubiertos; el riesgo remanente está concentrado en operación, datos live y amplitud de certificación, no en una excusa de “compila en mi máquina”.
