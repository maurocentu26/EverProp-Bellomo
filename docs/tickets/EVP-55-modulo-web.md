# EVP-55 — Módulo Web: Hero y Proyectos

Rama `ticket/EVP-55-modulo-web` desde `origin/develop` (`c36a24f`) · 2026-10-22 · Codex con Mauro. Sin commit, push, PR, merge ni despliegue: requieren autorización expresa. Usuario autorizó iniciar en paralelo y aplicar exclusivamente el nuevo SQL en la base local.

## 1. Qué pedía el ticket

Administrar la presentación pública de los proyectos existentes desde Web → Proyectos y Web → Hero conforme al [contrato 1.0](../contracts/everprop-landing-v1.md). Sin duplicar inventario ni editar sus datos comerciales. Incluye permisos existentes, publicación explícita, destacados, orden y selección de assets públicos aprobados. No incluye textos generales del hero, nuevas cargas, videos, otras secciones o activación productiva.

## 2. Qué se implementó

- `everprop-public/src/app/admin/web/page.tsx`: editor con selección del proyecto, pestañas Proyectos/Hero, permisos de edición/publicación, controles de imágenes/PDF, orden, características, mensajes de error por campo y confirmación al cambiar de proyecto con cambios pendientes. Entrada Web en el menú existente.
- `everprop-public/src/lib/project-landing.ts`: payload y tipos; reutiliza `apiFetch` y el CSRF existente. `EverpropApiError` conserva errores por campo.
- `ProjectLandingController`: GET `/admin/web/projects`, GET/PUT `/admin/projects/{public_id}/landing` y GET público `/public/landing/projects` bajo `/api/v1`. Snapshot completo, máximo 1000 sin truncamiento, orden estable, sin caché ni datos internos. Lectura pública por tenant resuelto; edición con policies existentes y transacción/bloqueo del proyecto padre.
- `ProjectLanding`: valores iniciales, validación de campos, claves de objetos, booleanos JSON, slugs, referencias a archivos y serialización. URL inmutable desde primera publicación. Ocultar desactiva destacado atómicamente.
- Forward `2026-10-22.001_project_landing.sql`: presentación editorial y registro de assets por tenant/proyecto; índices, FK compuestas y versión de esquema. No publica ni migra contenido existente automáticamente.
- `ImportLandingAssets`: `php artisan everprop:landing-assets /ruta/manifest-aprobado.json`. Registra referencias ya existentes; no se conecta a R2, no sube/baja archivos ni infiere correspondencias por nombre. Repetición serial y rollback transaccional ante entradas inválidas.
- PublicProjectController/PublicPropertyController y scopes: aceptan `channel=landing` para exigir publicación editorial explícita. Ocultar explícitamente excluye el proyecto también de catálogos legacy. Bellomito aplica publicación explícita en WEB_CHAT para buscar, consultar, registrar interés y solicitar visita.
- [Fixture compartido](../../everprop-api/tests/Fixtures/landing-v1.json) y [mapeo inicial pendiente de revisión humana](../contracts/EVP-55-project-mapping.tsv).

## 3. Por qué esta solución

Reutiliza el inventario, UUIDs, resolver de tenant, políticas, sesión, CSRF y componentes visuales. El JSON editorial tiene un schema validado y vive fuera de legacy_data. Las restricciones de slug/visibilidad y el bloqueo del proyecto padre protegen el primer guardado concurrente.

**Coordinación de canal antes de activar:** el snapshot de landing sólo incluye publicaciones explícitas, incluso con estado PLANNING/COMPLETED. Las unidades siguen disponibles sólo según sus reglas comerciales. Los catálogos anteriores sin `channel=landing` conservan proyectos comercialmente públicos todavía sin configuración para no romper consumidores; al crear una configuración oculta, se excluyen de ambos caminos. Toda lectura de catálogo en la landing debe usar el nuevo snapshot; si consulta inventario adicional, enviar `channel=landing`. WEB_CHAT requiere publicación explícita para proyectos con unidades. Comunicar esta precisión al responsable de la landing antes de activarla; no se modificó el contrato unilateralmente.

La primera configuración exige permiso de publicación, incluso oculta, porque puede retirar exposición comercial legacy. Las siguientes ediciones ocultas permiten al editor existente trabajar sin publicar. Assets sólo elegibles si están registrados para ese tenant/proyecto y bajo el origen HTTPS del contrato; imágenes JPEG/PNG/WebP/AVIF y PDF. SVG no admitido en esta etapa sin sanitización.

## 4. Cómo se verificó

- MySQL 8.4 del stack existente: base nueva `bellomo_crm_evp55_schema_test`, baseline con SHA-256 canónico verificado y todos los forwards importados correctamente. 64 tablas, 58 tablas tenant y 138 FK. No se inició otro stack. Forward repetido en la base de tests sin errores.
- Aplicación local expresamente autorizada: 28 proyectos y 3578 unidades antes/después; `project_landing` y `project_landing_assets` creadas vacías. Ningún proyecto real publicado ni archivo asociado.
- Pruebas PHP focalizadas: suite de inventario/aislamiento/forwards/AgentTurn con 43 tests y 349 aserciones; comprobación final ampliada de ProjectLandingTest con 14 tests y 87 aserciones. `ProjectLandingTest`, `PublicInventoryTest`, `TenantIsolationAndRbacTest`, `ForwardScriptsTest` y `AgentTurnTest`. Incluyen aislamiento, read-only, primera configuración sin publish, anonimato, snapshot vacío/orden/completo/límite, protección de slug, objetos de imagen, assets de otro proyecto, importador repetido y rollback.
- PHPStan sobre Inventory, importador y tools afectadas: sin errores. Pint sobre archivos PHP afectados: pasa.
- Frontend: `tsc --noEmit`, ESLint focalizado y `npm run build`: pasan; incluye `/admin/web`.
- Fixture validado con el `landingCatalogSchema` real de `Bellomo landing/everprop-bellomo/src/lib/landing-contract.ts`, sin modificar ese repositorio.
- Navegador local en `http://127.0.0.1:5173/admin/web`: sesión existente, proyectos reales cargados, alternancia Hero/Proyectos, controles y estados vacíos. Sin guardar ni publicar datos reales. Captura local `.qa/evp55-web.png`.
- Revisión independiente schema-migration-guardian y tenant-isolation/LLM: hallazgos corregidos; sin bloqueantes pendientes en la revisión estática. Pruebas respaldan las correcciones.

## 5. Pendientes y riesgos

- Revisar mapeo UUID ↔ slug y archivos R2 por una persona. El TSV sólo tiene UUIDs y nombres del inventario local; no prueba identidad con producción ni con proyectos de la landing. No crear ni asignar UUIDs faltantes automáticamente.
- Registrar manifiesto de assets sólo tras revisar ownership y contenido público. El importador valida URL, extensión y metadatos del manifiesto: **no verifica bytes/MIME remotos**. No tratar un manifiesto no revisado como prueba de privacidad.
- Coordinar canal con la landing, configurar hostname confiable de producción y activar variables server-only allí sólo con autorización. No probados integración viva entre ambos servidores, ≤60s en entorno desplegado ni routing productivo.
- Aplicar forward antes del código en otros entornos: los scopes públicos consultan las nuevas tablas. Nada aplicado en staging/producción.
- No hay protección contra navegación interna fuera del módulo con cambios sin guardar; sí aviso al cambiar proyecto o cerrar/recargar. Guardar sigue siendo una acción explícita.
- Commit/push/PR pendientes de autorización; Jira permanece En curso hasta entrega/revisión. Los cambios previos del usuario, incluido AGENTS.md, no forman parte del ticket.

### Manifiesto de referencias aprobado (ejemplo, no datos reales)

```json
{
  "tenant_public_id": "11111111-1111-4111-8111-111111111111",
  "assets": [{
    "project_public_id": "22222222-2222-4222-8222-222222222222",
    "url": "https://pub-6e84e10f99f7480da92cffa0fbe4b8b3.r2.dev/assets/proyecto/portada.jpg",
    "mime_type": "image/jpeg",
    "title": "Portada aprobada"
  }]
}
```
