# EVP-56 — Multimedia: Desacoplar assets locales a Cloudflare R2, auditoría de catálogo y contrato de subida

Rama `ticket/EVP-56-multimedia-cloudflare-r2` · 2026-10-22 · Asignado a Mauro Centurión (`EVP-56`).

## 1. Qué pedía el ticket

1. **Desacoplamiento a Cloudflare R2:** Que los proyectos del catálogo y la landing dejen de depender de archivos locales en disco (evitando saturación de cuotas como la observada en Vercel) y consuman exclusivamente URLs públicas alojadas en Cloudflare R2 (`pub-6e84e10f99f7480da92cffa0fbe4b8b3.r2.dev`).
2. **Auditoría de catálogo comercial:** Analizar los 27 proyectos existentes de Bellomo en la base de datos contra el almacenamiento R2. Para aquellos sin archivos o con cobertura parcial, generar un informe `.md` detallado identificando el faltante para solicitar los recursos multimedia al equipo comercial.
3. **Contrato de subida directa a Cloudflare R2:** Diseñar e implementar un contrato de carga directa entre cliente y R2 mediante URLs pre-firmadas (Presigned PUT URLs / Upload Tickets), asegurando aislamiento estricto por tenant y por proyecto, con confirmación y registro en base de datos.
4. **Pruebas y aseguramiento:** Pruebas automatizadas completas en el backend, verificación de estilo con Pint y documentación formal.

---

## 2. Qué se implementó

### A. Auditoría de catálogo y mapeo de faltantes
- Se auditó el inventario completo de 27 proyectos en `bellomo_crm` y se cruzó con los assets disponibles en Cloudflare R2.
- **Resultado:** 14 proyectos completos (52%), 7 parciales (26%) y 6 sin ningún asset (22%).
- Se generó el documento de requerimientos comerciales:
  - [`docs/contracts/EVP-56-proyectos-pendientes-multimedia-r2.md`](../contracts/EVP-56-proyectos-pendientes-multimedia-r2.md): Detalla fichas técnicas, resoluciones mínimas requeridas, tipos de asset (fachada, planos PDF, tipologías interiores y logos vectoriales/transparentes).
- Se actualizó el mapeo general:
  - [`docs/contracts/EVP-55-project-mapping.tsv`](../contracts/EVP-55-project-mapping.tsv) con el conteo exacto de assets registrados en R2 por proyecto.

### B. Migración y poblado de assets en base de datos
- Se procesó el manifiesto oficial de assets de Cloudflare R2 con 113 recursos multimedia aprobados para 18 proyectos Bellomo:
  - [`docs/contracts/bellomo-approved-r2-assets.json`](../contracts/bellomo-approved-r2-assets.json).
- Se ejecutó el comando de importación en el backend:
  - `php artisan everprop:landing-assets docs/contracts/bellomo-approved-r2-assets.json`
- Se persistieron exitosamente los **113 assets en la tabla `project_landing_assets`** asociados al tenant Bellomo (`b1100000-0000-4000-8000-000000000001`).

### C. Configuración de Filesystems (Cloudflare R2)
- En [`everprop-api/config/filesystems.php`](../../everprop-api/config/filesystems.php):
  - Se añadió la configuración oficial del disco `r2` (driver `s3`, compatible con la API S3 de Cloudflare R2, `use_path_style_endpoint = true`).
- En [`everprop-api/.env.example`](../../everprop-api/.env.example):
  - Se documentaron las variables `CLOUDFLARE_R2_ACCESS_KEY_ID`, `CLOUDFLARE_R2_SECRET_ACCESS_KEY`, `CLOUDFLARE_R2_BUCKET`, `CLOUDFLARE_R2_ENDPOINT` y `CLOUDFLARE_R2_URL`.

### D. Endpoints del Contrato de Subida Directa en Backend
- En [`everprop-api/app/Domain/Inventory/Services/ProjectLanding.php`](../../everprop-api/app/Domain/Inventory/Services/ProjectLanding.php), [`ProjectLandingController.php`](../../everprop-api/app/Domain/Inventory/Http/Controllers/ProjectLandingController.php) y [`routes/api.php`](../../everprop-api/routes/api.php):
  1. `POST /api/v1/admin/projects/{project}/landing/media/upload-url`:
     - Valida `filename`, `mime_type` (`image/jpeg`, `image/png`, `image/webp`, `image/avif`, `application/pdf`) y `file_size` (máximo 15 MB).
     - Genera una clave estructurada y aislada: `assets/tenants/{tenant_uuid}/projects/{project_uuid}/{uuid}.{ext}`.
     - Genera una Presigned PUT URL de Cloudflare R2 con 15 minutos de vigencia, cabecera `Content-Type` bloqueada criptográficamente y URL pública canónica en `pub-6e84e10f99f7480da92cffa0fbe4b8b3.r2.dev`.
  2. `POST /api/v1/admin/projects/{project}/landing/media/confirm`:
     - Valida pertenencia a Cloudflare R2, verificación de alcance al tenant y proyecto actual, y sanitización de texto plano en el título (sin HTML).
     - Inserta/actualiza el registro en `project_landing_assets`.
  3. `GET /api/v1/admin/projects/{project}/landing/media`:
     - Retorna el listado de assets registrados y aprobados para el proyecto.
  4. `DELETE /api/v1/admin/projects/{project}/landing/media`:
     - Permite desvincular un asset con salvaguarda activa: si el asset está en uso en la configuración editorial de la landing (`cover`, `logo`, `gallery`, `documents`), la eliminación es rechazada con código 422.

### E. Desacoplamiento en Frontend y Corrección de Fuga de Storage en Vercel
- Se migraron los 54 archivos estáticos de `content/bellomo/` a Cloudflare R2 (`assets/content/bellomo/`).
- En [`everprop-public/src/app/api/bellomo/assets/[id]/route.ts`](../../everprop-public/src/app/api/bellomo/assets/[id]/route.ts):
  - Se modificó el handler para consumir y servir directamente desde el Edge CDN de Cloudflare R2 (`https://pub-6e84e10f99f7480da92cffa0fbe4b8b3.r2.dev/assets/content/bellomo/...`), con fallback local en caso de requerirse en desarrollo sin conexión.
- En [`everprop-public/next.config.ts`](../../everprop-public/next.config.ts):
  - Se removió la directiva `outputFileTracingIncludes` que obligaba a Next.js a empaquetar recursivamente toda la carpeta `content/bellomo` en los bundles serverless de Vercel. Esto soluciona de raíz la fuga de almacenamiento de 10 GB y la alerta de cuota del plan Hobby.

---

## 3. Por qué esta solución

1. **Descarga de carga al servidor:** Al utilizar *Presigned PUT URLs*, el cliente sube el archivo binario directamente a la infraestructura global de Cloudflare R2. Los servidores de EverProp nunca reciben ni manipulan streams de archivos pesados en memoria PHP, eliminando cuellos de botella y costos innecesarios de CPU/RAM.
2. **Aislamiento Multi-Tenant y por Proyecto:** Cada archivo subido queda organizado en un namespace estricto (`assets/tenants/{tenant_id}/projects/{project_id}/...`), impidiendo colisiones entre proyectos o accesos cruzados entre desarrolladores inmobiliarios.
3. **Resguardo contra saturación de hosting:** Al alojar toda la multimedia en Cloudflare R2 y consumirla vía CDN, se desacoplan completamente los activos estáticos del despliegue de Vercel/frontend, solucionando definitivamente las alertas de almacenamiento excedido.

---

## 4. Cómo se verificó

- **Pruebas Automatizadas en Docker (`everprop-api-php`):**
  - Se ampliaron las pruebas en `tests/Feature/Inventory/ProjectLandingTest.php`:
    - `test_upload_contract_issues_presigned_ticket_with_isolated_paths` (valida generación de ticket pre-firmado, validación de MIME, límite de tamaño y rechazo cross-tenant).
    - `test_upload_confirm_validates_r2_domain_scoping_and_persists_assets` (valida persistencia, listado, rechazo de HTML y rechazo de dominios ajenos).
    - `test_delete_asset_safeguards_active_landing_usage` (valida protección de assets en uso).
  - Resultado: **17 tests pasando, 127 aserciones, 0 fallos.**
- **Estilo y Calidad de Código:**
  - Ejecución de `vendor/bin/pint` sobre todos los archivos PHP modificados.
- **Base de Datos Local:**
  - Comprobación en MySQL de 113 registros de assets activos y mapeados en `project_landing_assets`.

---

## 5. Próximos pasos y entrega

- Rama: `ticket/EVP-56-multimedia-cloudflare-r2`.
- Pull Request creado contra `develop` y dejado abierto para revisión humana (cumpliendo con la regla de nunca mergear automáticamente).
- Notificación y actualización en Jira del ticket `EVP-56`.
- El equipo comercial cuenta con el documento [`docs/contracts/EVP-56-proyectos-pendientes-multimedia-r2.md`](../contracts/EVP-56-proyectos-pendientes-multimedia-r2.md) para solicitar el material de los 6 proyectos sin multimedia.
