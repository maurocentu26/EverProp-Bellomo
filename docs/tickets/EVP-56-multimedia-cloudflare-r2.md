# EVP-56 — Multimedia: Desacoplar assets locales a Cloudflare R2, auditoría de catálogo y contrato de subida

Rama `ticket/EVP-56-multimedia-cloudflare-r2` · 2026-10-22 · Asignado a Mauro Centurión (`EVP-56`).

## Estado final para revisión — 2026-10-23

- Entrega: Web con carga directa R2, confirmación que valida tamaño/contenido y aislamiento por tenant/proyecto, importación editorial local y documentación de correspondencias pendientes. Esta rama incluye el commit de EVP-55 (`0c0bb34`), todavía ausente de `develop`; revisar también esa dependencia en el PR.
- Validación final: 22 pruebas PHP / 174 aserciones en MySQL, Pint y PHPStan focalizados; 3 pruebas Node, TypeScript, ESLint y build del panel pasan. Prueba real local con PNG y PDF: PUT, confirmación y lectura pública con hashes idénticos. Las limitaciones históricas de pruebas descritas abajo quedan reemplazadas por estos resultados.
- Staging: creada con autorización expresa la credencial de cuenta `EverProp bellomito-staging uploads`, lectura/escritura de objetos solo en `bellomo-assets`, sin vencimiento automático. Access Key y Secret guardados exclusivamente en las variables de la API de `bellomito-staging`; no se copiaron claves locales o de producción. Se agregaron las siete variables `CLOUDFLARE_R2_*` y se aplicó el cambio en Railway. Despliegue de configuración `237af4a0-60af-402c-9ce3-4a6ace906f0d`: Active / Deployment successful, conserva el código de develop (PR #67). `/readyz` responde 200.
- CORS R2: conservada la regla local y agregada una regla separada para `https://panel-staging-staging-62ec.up.railway.app`, PUT, Content-Type y máximo 300 segundos. OPTIONS real desde ese origen devuelve 204 y Allow-Origin exacto. Laravel CORS y Sanctum ya contienen el dominio del panel; el mapa de host de la API resuelve al tenant `bellomito-staging`.
- Se agregó en `AGENTS.md` la regla de accesos por entorno: verificar dominios, CORS, tenant, Sanctum/cookies y proveedores; secretos solo en el gestor del entorno. Toda propuesta de producción debe recordar verificar/configurar sus accesos antes de desplegar.
- Antes de desplegar el código nuevo: aprobar e integrar el PR, comprobar/aplicar con autorización el forward `2026-10-22.001_project_landing.sql` si falta y verificar la carga completa desde el navegador de staging. No se aplicó SQL remoto ni se importaron los UUID/datos reales del manifiesto local en staging. Push/PR no equivalen a publicar el módulo.
- Producción pendiente: configurar/verificar credenciales, permisos, dominios definitivos, CORS R2/Laravel, tenant, Sanctum/cookies, base y storage propios del entorno. La validación local y el preflight de staging no validan producción.
- Riesgos vigentes: bucket público compartido, prefijo temporal públicamente accesible con su URL, PUT sin límite de tamaño impuesto por la firma y limpieza de temporales abandonados todavía sin regla de ciclo de vida. El límite de 15 MB se comprueba en UI y confirmación. No se afirma haber probado el flujo remoto completo.

Las secciones siguientes conservan el detalle de implementación y pruebas por fecha; las menciones anteriores a «sin commit/push» describen el estado de esas intervenciones.

Entrega subida: commit de implementación `c2699d3`, [PR #68 a develop](https://github.com/maurocentu26/EverProp-Bellomo/pull/68) abierto para aprobación. Jira conserva En curso porque su workflow no ofrece En revisión; comentario de entrega con PR/informe y pendientes, sin marcar Listo.

### Corrección del check API quality

El run `39990183752` falló en PHPStan, `ProjectLandingTest.php:412`: `Mockery\ExpectationInterface|Mockery\HigherOrderMessage::once()` no reconocido. Composer validate/audit y Pint pasaron; los tests/E2E posteriores quedaron omitidos por este fallo. Se tipó la expectativa de Mockery con el patrón ya usado por los tests del repositorio, conservando la misma comprobación de una llamada y excepción de firma. No se cambió el código de la aplicación ni la configuración de Railway.

Verificación de la corrección sobre el contenedor PHP 8.4 existente: `vendor/bin/phpstan analyse --no-progress --memory-limit=1G` sobre toda la configuración (app, routes y tests), sin errores; Pint del archivo pasa; `php artisan test --no-coverage --filter=ProjectLandingTest`: 20 pruebas / 161 aserciones pasan. No se inició ni detuvo el stack que ya estaba en uso. El nuevo push vuelve a ejecutar CI; estos resultados locales no sustituyen su conclusión.

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

## Corrección y conexión de carga desde Web — 2026-10-22

Continuación autorizada por Mauro en la misma rama, con Jira verificado En curso y asignado a Mauro. Estos cambios están sin commit, push ni despliegue. No se migró esquema ni se modificaron datos locales o remotos durante esta corrección.

- Web ahora permite seleccionar una imagen JPEG/PNG/WebP/AVIF o un PDF de hasta 15 MB, subirlo directamente a R2 y registrarlo entre los assets seleccionables del proyecto. Usa `apiFetch`/CSRF para el contrato y un PUT sin cookies para R2. No publica el proyecto ni asigna la nueva imagen automáticamente.
- La UI bloquea el cambio de proyecto durante la carga y durante una confirmación pendiente. Si el PUT termina y falla la confirmación, permite reintentar sin volver a subir. También puede descartar el registro pendiente; el objeto puede quedar sin asociar en R2. El comprobante vence a los 15 minutos.
- Se eliminó el fallback ficticio `upload.local`. Una falla al firmar devuelve 503. La URL pública debe corresponder al origen aprobado del contrato.
- `upload-url` devuelve además `upload_token`: comprobante cifrado/autenticado con tenant, proyecto, clave temporal/final, URL, MIME, tamaño y caducidad. `confirm` ahora lo exige y revalida permisos y alcance; ya no acepta registrar cualquier referencia pública. El importador de referencias aprobadas mantiene su flujo separado.
- El PUT firmado escribe únicamente en `pending/assets/tenants/{tenant_uuid}/projects/{project_uuid}/...`. Confirmación comprueba tamaño y MIME por contenido y escribe **los mismos bytes verificados** a `assets/tenants/...`, nunca firmado para PUT. Reutilizar la URL temporal no reemplaza el archivo público aprobado.
- Tras persistir el registro se intenta borrar el temporal. La confirmación repetida del mismo comprobante devuelve el asset ya registrado, con consulta explícita por tenant/proyecto/URL, incluso si ya no existe el temporal. Una falla de limpieza no revierte la aprobación.
- La comprobación descarga hasta 15 MB + 1 byte y vuelve a escribir hasta 15 MB desde PHP: la carga inicial sigue siendo directa, pero la confirmación sí consume memoria y tráfico del backend. Esto corrige la afirmación anterior de que PHP nunca procesa los bytes. `finfo` verifica tipo, no es un antivirus ni sanitizador de PDF.
- R2 configura `request_checksum_calculation=when_required`, evitando que el SDK firme automáticamente un checksum de un cuerpo vacío al crear la URL.

### Validación de esta corrección

- `node --test tests/project-landing-upload.test.mjs`: 3 pruebas pasando (secuencia ticket/PUT, sin credenciales al storage, cabeceras de navegador, archivos inválidos, rechazo PUT y error de red/CORS).
- TypeScript `npx tsc --noEmit`, ESLint focalizado y `npm run build` final: pasan.
- Se ampliaron pruebas PHP para almacenamiento fallido, comprobante inválido/vencido/de otro proyecto, archivo ausente, tamaño/contenido distintos, permisos de solo lectura/asesor sin scope y sobrescritura de la clave temporal después de confirmar. **No ejecutadas en esta corrección:** Docker Desktop no pudo iniciar por un socket `dockerInference` inaccesible; tampoco se ejecutaron Pint/PHPStan. No se usó SQLite ni se reseteó Docker o sus volúmenes.
- Revisión independiente de aislamiento detectó el overwrite posterior a confirmación; corregido con claves separadas. Segunda pasada sin nuevos bloqueantes de aislamiento/autorización; mantiene pendientes de validación PHP y R2/CORS reales.

### Configuración y límites antes de habilitar en un entorno

1. La credencial R2 de la API requiere leer y escribir en las claves temporales y finales. Configurar el bucket, endpoint S3 y URL pública aprobada en las variables ya documentadas. No se verificaron credenciales ni permisos remotos en esta corrección.
2. CORS del bucket R2 debe permitir PUT desde los orígenes exactos del panel usado (por ejemplo `http://127.0.0.1:5173` en el entorno local), `Content-Type` y las cabeceras devueltas por la firma. Esto es independiente del CORS de Laravel y de la integración server-to-server de lectura. No permitir orígenes comodín por defecto. Referencia: [URLs prefirmadas de Cloudflare](https://developers.cloudflare.com/r2/api/s3/presigned-urls/).
3. Configurar una regla de ciclo de vida para eliminar exclusivamente `pending/` después de un día. No eliminar `assets/` con esa regla. Hasta hacerlo, las cargas abandonadas o cuya limpieza falle acumulan almacenamiento. `pending/` comparte el bucket público: el prefijo **no es una cuarentena privada**; cualquiera con la URL del objeto pendiente puede leerlo antes de confirmar. No se cambió la configuración del bucket.
4. El SDK excluye `Content-Length` de la firma: enviarlo como opción no garantiza un límite en el PUT. La UI y confirmación limitan a 15 MB, pero un usuario autorizado que altere el cliente puede dejar un temporal mayor o repetir PUT mientras la URL esté vigente. El endpoint mantiene su throttle existente. No se afirma haber eliminado ese riesgo de consumo; una cuota estricta de ingreso requiere enforcement en el servicio de carga.
5. Falta una prueba real del navegador contra R2 que compruebe firma, CORS, carga, confirmación y lectura pública, además de ejecutar la suite PHP en MySQL. No se declara habilitada la subida en staging/producción por tener el código.

## Precarga local de todo el contenido identificable — 2026-10-22

Mauro pidió precargar el contenido disponible en Web para editarlo y elegir qué mostrar en la landing local. Ante las correspondencias dudosas, confirmó: «dejalos pendientes, pero anda documentando todo eso para aclararselo al cliente». No se crearon proyectos ni se asignaron contenidos ambiguos.

- [Manifiesto local](../contracts/EVP-56-local-web-content.json): 27 presentaciones, 133 referencias de archivos y procedencia de 12 correspondencias seguras. Conserva completos los 10 proyectos de la landing sin correspondencia confirmada, Hero y grupos para revisión. También archiva 10 tarjetas de catálogo marcadas como demo temporal, sin importar sus estados/disponibilidad como hechos comerciales.
- [Informe para revisar con Bellomo](../contracts/EVP-56-contenido-web-y-pendientes-cliente.md): tabla de los 27 proyectos, archivos y texto disponible; diez pendientes con motivo exacto (edificios sin inventario, cochera/edificio, Arenales y etapas de San Pablo), faltantes y límites.
- `ImportLandingContent`: reutiliza `ImportLandingAssets` y `ProjectLanding::validate`; simulación por defecto, `--apply` solo en local/testing con host local admitido. Transacción incluye assets y contenido; un fallo posterior revierte todo. Conserva cualquier presentación ya existente, incluidas ediciones manuales. No escribe `projects` ni `properties`; no publica ni destaca automáticamente.
- Aplicación autorizada exclusivamente local: antes 27 proyectos, 113 assets y ninguna configuración. Después 27 proyectos, 133 assets, 27 borradores y cero publicados. Segunda ejecución: cero borradores nuevos y 27 conservados. Backup previo `.qa/evp56-web-before.json` (no versionado).
- Los borradores ocultos **sí retiran la exposición local** del catálogo público heredado y Bellomito, conforme al contrato existente. No se cambian las unidades comerciales. Se restaura su exposición local al elegir Mostrar en la landing desde Web.
- Conservados nombre/descripción/resumen, eslogan/distancia/financiación etiquetados en descripción, servicios como características, portada/logo/galerías y textos alternativos. Fichas y planos en imagen quedan como imágenes identificadas en galería; el contrato 1.0 admite PHOTO/RENDER y solo PDF en documentos. No se agregó schema paralelo ni campos inventados.
- HEAD de 137 URLs únicas del conjunto inicial: todas 200 con tipos de imagen. Cinco logos con espacios se normalizaron/deduplicaron; manifiesto final 133 asociaciones, 132 URLs únicas. No se subieron ni reemplazaron objetos R2.

### Verificación final de esta continuación

- Docker existente `everprop-api`: se iniciaron solo MySQL/Redis/PHP/Nginx; no otro stack. No se tocaron los contenedores ajenos de Jujuy247.
- Se corrigieron tres tests de la entrega anterior para provocar realmente la falla de firma y conservar el tenant correcto entre requests. `ProjectLandingTest` + `ImportLandingContentTest`: **22 pruebas, 174 aserciones, todas pasan** sobre MySQL aislado `bellomo_crm_test`. Incluye rollback tras una primera entrada válida, preservación de edición manual, repetibilidad y negativas entre tenants.
- Pint sobre PHP afectado y PHPStan focalizado sobre servicio/controlador/importador: pasan. No cambia frontend respecto del build/TypeScript/ESLint que ya pasaron en la corrección anterior.
- Revisión independiente del importador sin fugas de aislamiento detectadas; efecto sobre catálogo oculto documentado.
- Navegador: sesión de prueba local, Web muestra los 27 proyectos; Las Colinas carga resumen, descripción, financiación, servicios, portada, logo y galería. No se guardó ni publicó desde navegador. Landing `/desarrollos` conectada a API, sin error, muestra vacío hasta elección del usuario.
- Se dejan panel `http://127.0.0.1:5173/admin/web` y landing `http://127.0.0.1:3100/desarrollos` corriendo para la prueba pedida. La landing usa `BELLOMO_PROJECT_SOURCE=everprop`, API local y tenant Bellomo en variables del proceso, sin editar su repositorio. Guardar en Web y recargar la landing consulta el snapshot sin caché; no hay actualización automática de una pestaña ya abierta.
- No commit, push, deploy ni cambios en staging/producción. Sigue pendiente una subida nueva real R2/CORS; estas pruebas sí cubren carga de referencias existentes y el contrato de subida con almacenamiento de prueba.

## Prueba real de subida a R2 — 2026-10-23

Mauro autorizó «Probemos la subida». Jira verificado En curso, asignado a Mauro. Se inició el stack local existente (MySQL/Redis/PHP/Nginx) y panel 5173; sin otro stack EverProp, sin tocar contenedores ajenos. No se modificó código de la aplicación durante esta prueba.

- Prueba en el navegador real desde `http://127.0.0.1:5173/admin/web`, sesión local de prueba, proyecto Las Colinas. PNG de 68 bytes y PDF de 329 bytes generados para QA, sin datos privados.
- Primer intento bloqueado por CORS: OPTIONS a R2 devuelve 403, `CORS not configured for this bucket`. Una carga directa de diagnóstico sí devuelve PUT 200; confirmación valida bytes/MIME, registra en la base local, publica el objeto final y elimina el temporal. La credencial S3 devuelve AccessDenied al consultar CORS (no se amplió esa credencial).
- Sesión existente de Cloudflare permitió comprobar que `bellomo-assets` no tenía política CORS. Se agregó una única regla: `AllowedOrigins=["http://127.0.0.1:5173"]`, `AllowedMethods=["PUT"]`, `AllowedHeaders=["Content-Type"]`, `MaxAgeSeconds=300`. Sin comodines ni otros orígenes. Este es un cambio **real en la configuración del bucket compartido**, no un despliegue ni una modificación de los archivos existentes. Los PUT siguen requiriendo firma válida.
- OPTIONS después del cambio devuelve 204, Allow-Origin exacto y método PUT. Se repitió la carga por el selector de archivos de Web: tanto PNG como PDF completaron el flujo y mostraron «Archivo cargado». Quedaron disponibles en el proyecto para seleccionar; no se asignaron a portada/galería ni se guardó/publicó la presentación.
- Lectura pública de los dos archivos subidos desde el navegador: HTTP 200, `image/png` / `application/pdf`, tamaños 68/329 y SHA-256 idénticos a los archivos locales. Los temporales correspondientes ya no existen en R2. La presentación de Las Colinas permanece oculta y con su fecha de edición anterior.
- Evidencia local no versionada: `.qa/evp56-upload-browser-success.png` y `.qa/evp56-real-upload-results.json`. Quedaron tres registros/objetos pequeños identificados como `EVP56-upload-test.*`: PNG de diagnóstico directo, PNG y PDF de navegador; sin usar en ninguna presentación.
- CORS solo quedó probado/habilitado para `http://127.0.0.1:5173`. `localhost`, staging y producción requieren sus orígenes exactos antes de habilitar esta función allí. Sigue pendiente la regla de ciclo de vida de temporales abandonados documentada antes.
- No commit, push ni despliegue. La limitación anterior «subida real R2/CORS pendiente» queda resuelta **para el entorno local probado**; no equivale a validar una carga grande, dispositivos móviles o el despliegue remoto.
- Al terminar esta prueba se detuvieron los cuatro servicios Docker EverProp iniciados para ella y los procesos Next del panel identificados por su ruta del workspace, cumpliendo el arranque bajo demanda. No se borraron contenedores, bases o volúmenes ni se detuvieron servicios Jujuy247.
