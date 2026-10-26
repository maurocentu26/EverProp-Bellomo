# EVP-65 — Corrección de grillas y QA con API alineada

Rama `ticket/EVP-65-qa-grillas` · base `a78f9da` (develop, incluye el rediseño de Ramiro `62e94b5`) · 2026-10-26 · Codex / Álvaro Ruggeri. Entrega por PR hacia develop para revisión de Ramiro, con commit y push autorizados por Álvaro. EVP-65 verificado en Jira: En curso, asignado a Álvaro.

## 1. Qué pedía el ticket

Corregir cuatro huecos confirmados por QA: categorías de lead, filtros móviles de Activos, última fila del catálogo de Proyectos y documentación del proyecto. Aprovechar el ancho disponible de las filas incompletas. Alinear la API con el código de Ramiro y completar Web/Nuevo proyecto, repitiendo el QA general.

Alcance ampliado por el usuario: corregir también los seis tests de notificaciones y volver a correr la suite completa. Fuera de alcance: cambios de datos comerciales, producción/staging, envíos externos y publicación de proyectos.

## 2. Qué se implementó

- `everprop-public/src/app/admin-design.css`: categorías de lead con flex-wrap y crecimiento; al quedar sola una opción, ocupa la fila completa. Se conserva una opción por fila en móvil. El estilo compartido también alcanza NewLeadDrawer, aunque el acceso rápido actual navega a NewLeadForm.
- En el mismo CSS, el último filtro de Activos abarca ambas columnas cuando es impar. Se conserva el botón Limpiar filtros a ancho completo.
- `everprop-public/src/app/admin/desarrollos/page.tsx`: agrega la clase `project-cards`. Sus tarjetas crecen para rellenar las filas incompletas; se conservan tres columnas, dos en tablet y una en móvil. El listado de unidades mantiene su estructura.
- `everprop-public/src/components/admin/BellomoResources.tsx`: usa `resource-grid` para distribuir los recursos con crecimiento flexible; con dos documentos se aprovecha todo el ancho. Se mantienen los breakpoints de una/dos/tres columnas, los enlaces y la galería ampliable.
- `everprop-public/tests/ui-grid-layout.mjs`: prueba de navegador sobre el demo local, sin agregar dependencias. Mide ocupación real de la última fila para los cuatro defectos.
- `everprop-public/tests/notifications-worker.test.mjs`: el mock de service worker ahora define navigator, como el navegador real. Las seis pruebas originales cubren la ausencia de métodos de badges; dos casos nuevos comprueban set/clear con éxito y rechazo, conservando entrega y navegación. No se cambió el worker de producción ni se eliminaron aserciones.

### API local

PHP y Nginx ahora montan `develop-preview/everprop-api`. `app/`, `routes/` y `config/` no tienen cambios respecto de la base de Ramiro; no se mezcló código de evp52-local. Se reutilizaron la configuración local y las dependencias cuyo composer.lock coincide, y los volúmenes locales existentes de MySQL, Redis, storage y cache. Se corrigió mediante ACL la lectura de `.env` por el usuario PHP 10001, sin hacer público el archivo. Se limpiaron únicamente las cachés de configuración y rutas.

Antes de aplicar SQL se creó un backup local privado (`output/qa-ramiro-corregido-2026-10-26/api-before-align.sql`, modo 0600). Se aplicaron los ocho forwards pendientes ya existentes, sin modificar el baseline ni escribir migraciones nuevas:

1. 2026-10-02.001 integration_token_ciphertext
2. 2026-10-07.001 collection_email_attempts
3. 2026-10-15.001 chatbot_runs_tenant_started
4. 2026-10-15.002 collection_email_kind
5. 2026-10-21.001 collection_email_sequence
6. 2026-10-22.001 project_landing
7. 2026-10-23.001 project_intakes
8. 2026-10-23.002 project_intake_units

## 3. Por qué esta solución

Se reutilizaron las clases y componentes existentes. Flex-wrap con crecimiento permite que cada fila use el espacio disponible sin lógica nueva para contar tarjetas, dependencias ni cambios de datos. Las reglas de proyectos están acotadas a sus tarjetas; no se deforman los lotes, el calendario ni el inventario de unidades. Los recursos conservan sus propios breakpoints y separación de 16 px.

## 4. Cómo se verificó

### Regresión y comprobaciones de código

- Prueba previa: las cuatro comprobaciones fallaron por ocupación incompleta: 237/481, 155/326, 350/720 y 741/1120 px respectivamente.
- Después del cambio y nuevamente después de retirar la fixture: **4/4 aprobadas**. `grid-tests.log` registra la última ejecución.
- `npm run build`: aprobado, incluye `/admin/web` y `/admin/desarrollos/nuevo`.
- `npm run lint`: 0 errores, 126 advertencias del repositorio. No se hizo limpieza fuera del alcance.
- `node --test tests/*.test.mjs`: **175/175 aprobadas, 0 fallidas, 0 omitidas**, después de corregir el mock de notificaciones y agregar dos casos de badges. Evidencia: `unit-tests-after-notifications-fix.log`. Antes se reprodujeron los seis fallos (`notifications-before-fix.log`); después, la tanda específica pasa **8/8** (`notifications-after-fix.log`). Se conserva `baseline-notifications.log` como evidencia histórica de los seis fallos en la base de Ramiro.
- `npx eslint tests/notifications-worker.test.mjs`: aprobado sin salida ni errores. Las cuatro regresiones de grillas se volvieron a ejecutar: **4/4**, en `grid-tests-after-notifications-fix.log`.
- `git diff --check`: aprobado.
- `php artisan everprop:schema:verify` dentro de Docker PHP 8.4/MySQL: aprobado; baseline SHA intacto, 66 tablas, 60 tenant-scoped, 143 FK y usuario de runtime no root.
- `php artisan everprop:production-check --connections`: pasan las dependencias y todos los chequeos de esquema, incluidos project landing/intakes. El comando completo devuelve fallo por las condiciones de producción deliberadamente no configuradas en localhost: APP_ENV, HTTPS, cookies seguras y hosts de producción. No se debilitaron controles ni se trató este resultado como aprobación de producción.

La prueba de grillas se ejecuta desde `everprop-public/` con un Playwright ya instalado:

```sh
PLAYWRIGHT_PATH=/ruta/al/paquete/playwright \
PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/ruta/a/chromium \
node tests/ui-grid-layout.mjs
```

Solo permite origen localhost/127.0.0.1. Usa las credenciales del demo local por defecto; admite UI_QA_ORIGIN/UI_QA_EMAIL/UI_QA_PASSWORD por entorno.

### QA de navegador

**134 combinaciones de ruta/estado/ancho**, sin overflow horizontal del documento ni Endpoint not found:

- Las 25 rutas de la primera revisión en 390, 768, 1024 y 1440 px: 100.
- Los cinco pasos del ingreso guiado en esos cuatro anchos: 20.
- Dashboard, Estadísticas, Nuevo lead, Proyectos, Activos, Web y Nuevo proyecto a 320 y 1920 px: 14.

La métrica de documento se complementó con capturas y revisión visual focalizada de las cuatro grillas, Web/Hero y los pasos del ingreso. No equivale a probar todas las combinaciones posibles de datos y permisos.

Web carga proyectos y formulario, cambia a Hero, permite seleccionar un proyecto y recupera el borrador guardado. Nuevo proyecto bloquea el tipo vacío, crea un proyecto sintético oculto y navega los pasos Datos básicos, Unidades, Material comercial, Presentación Web y Revisión/publicación. Se abrió y canceló Cargar una unidad. Se verificó bloqueo de publicar cuando faltan URL/resumen. Se guardaron URL/resumen de la fixture y se comprobaron después de recargar. No se publicó.

También se repitieron pestañas y filtros sin datos de Estadísticas, tema claro/oscuro, lectura Grande, menú móvil (abrir/navegar/cerrar), acceso rápido a Nuevo lead, filtro de Activos vacío y su limpieza, apertura del hilo/compositor móvil sin enviar, y ampliar/siguiente/cerrar en la galería de recursos. Las imágenes del material se comprobaron cargadas tras el lazy loading.

La fixture se retiró en una transacción con guardas por UUID y nombre exactos, estado oculto y ausencia de unidades. Los conteos de proyectos, propiedades, leads, contactos, visitas y usuarios coinciden antes/después; se conservan los datos previos. No se ejecutaron workers ni publicaciones externas.

Artefactos locales: `output/qa-ramiro-corregido-2026-10-26/`: `qa-results.json`, `interactive.json`, `cobertura.json`, `grid-tests.log`, `build.log`, `unit-tests.log`, `baseline-notifications.log`, conteos antes/después, fixture marcada retirada y capturas PNG/mosaicos.

## 5. Pendientes y riesgos

Los cuatro defectos quedan corregidos y el QA de Web/Nuevo proyecto ya no está bloqueado por una API antigua. Frontend y API locales quedan levantados en 3000/18080.

- Los seis fallos del mock de notificaciones quedan resueltos; la suite completa de frontend pasa 175/175. No se volvió a ejecutar la suite de backend: este seguimiento solo modifica tests de frontend. La recepción push en un dispositivo físico sigue sin verificarse.
- La vista interna de consumo IA devuelve 403 con el administrador demo, mostrando el aviso de acceso exclusivo del equipo Eversys; no se cambiaron sus permisos.
- No se certifican Safari/Firefox, dispositivo físico, lectores de pantalla, contraste medido, todos los roles ni auditoría WCAG completa.
- No se probaron subidas a R2, publicación pública, conexiones a proveedores, envíos o pagos. La prueba de archivos cubre controles/estado vacío y galería existente, no carga remota.
- El esquema local fue actualizado; el backup permite recuperar el estado anterior si se necesitara volver al código viejo. No se tocó producción ni staging.
- Se solicita revisión de Ramiro antes de decidir el merge. No se realizó merge ni despliegue. Antes de producción siguen pendientes sus accesos, forwards, dominios, CORS/R2, Sanctum/cookies y credenciales del entorno real.

## Evidencia incluida para revisión

[Resultado agregado del QA](evidence/EVP-65-qa-grillas/resultado-qa.json). Los logs completos y las 134 capturas permanecen en el entorno local; no se incluyen dumps de base de datos ni configuración local.

| Corrección | Captura |
|---|---|
| Categorías de lead | [1440 px](evidence/EVP-65-qa-grillas/corregido-categorias-lead-1440.png) |
| Filtros de Activos | [390 px](evidence/EVP-65-qa-grillas/corregido-filtros-activos-390.png) |
| Última tarjeta de proyecto | [1024 px](evidence/EVP-65-qa-grillas/corregido-proyectos-1024.png) |
| Documentación del proyecto | [1440 px](evidence/EVP-65-qa-grillas/corregido-documentos-1440.png) |
