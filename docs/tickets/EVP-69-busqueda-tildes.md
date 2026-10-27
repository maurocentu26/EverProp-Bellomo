# EVP-69 — Búsqueda de leads sin tildes

Rama `ticket/EVP-69-busqueda-tildes` desde develop `ac089a3345f5c78c31c4deafe17f1d23527b2acc` · 2026-10-27 · Codex para Álvaro.

## 1. Qué pedía el ticket

EVP-69 abarca lista, ficha y alta de leads con una experiencia clara y accesible. Continuando el objetivo de reducir dificultades, se comprobó en staging que `lucia` devolvía cero resultados mientras `Lucía` encontraba a Lucía Herrera. Jira confirmó EVP-69 En curso y asignado a Álvaro; comentario 10186 informa el seguimiento antes de editar.

## 2. Qué se implementó

`everprop-public/src/app/admin/leads/page.tsx` normaliza consulta, nombre, correo y título de inmueble con Unicode NFD, eliminación de marcas combinantes, minúsculas y trim. No cambia datos originales, teléfono, filtros comerciales, orden, autorización, API ni paginación. `ñ` y `n` también se consideran equivalentes para esta búsqueda local.

`everprop-public/tests/lead-search.test.mjs` ejecuta el callback real de filtrado obtenido del AST del archivo, evitando duplicar su implementación. Cubre tildes compuestas y descompuestas, mayúsculas, espacios, títulos, teléfono, correo, vacío, ausencia de coincidencias, combinación con filtros y restricción del asesor en modo demo.

`.github/workflows/web.yml` ejecuta las regresiones de búsqueda y formulario de leads en CI; antes solo se comprobaban localmente y no formaban parte del job Web quality.

## 3. Por qué esta solución

Una función local breve sirve a las cuatro comparaciones del mismo listado. Reutiliza Unicode nativo, sin dependencias ni cambios al contrato. No se usa el normalizador de materiales porque pertenece a otro dominio y sus reglas de espacios no son el contrato de esta búsqueda.

## 4. Cómo se verificó

* Antes del cambio: prueba de búsqueda sin tildes falló con `lucia`; el caso de regresión existente de teléfono/correo/filtros pasó.
* Después: `node --test tests/*.test.mjs`: 190/190 aprobadas, sin skips. Log `/tmp/evp69-search-tests.log`.
* `npx eslint src/app/admin/leads/page.tsx tests/lead-search.test.mjs`: aprobado sin salida ni errores. Log `/tmp/evp69-search-lint.log`.
* `NEXT_PUBLIC_DATA_MODE=mock npm run build -- --webpack`: aprobado con TypeScript. Log `/tmp/evp69-search-build.log`.
* Navegador local con build de producción y datos ficticios: `benitez` y `benítez` encuentran Esteban Benítez; `arganaraz` encuentra Gonzalo Argañaraz. Campo y resultado contenidos a 320/768/1440 px con texto Grande; altura del campo 48 px. Sin crear ni modificar clientes. Servidor temporal 3001 detenido al terminar.
* Auditoría previa de staging: filtros contenidos en siete anchos 320/375/768/820/1024/1199/1440 con Grande; combinación Contactados + Instagram produce vacío y Limpiar filtros restaura siete clientes. Acciones revisadas a 320 sin objetivos menores de 44 px. No acredita el resto del panel.
* Evidencia visual fuera de Git: `cierre-meta/evp69-busqueda-sin-tildes-local-320.png` en el directorio de artefactos de esta sesión.

## 5. Pendientes y riesgos

Álvaro autorizó commit, push, PR y, si CI aprueba, merge y despliegue exclusivamente en staging el 27/10/2026. La validación remota de este seguimiento queda pendiente de desplegarlo. Producción fuera de alcance.

La búsqueda sigue limitada a leads cargados; no incorpora búsqueda remota completa ni altera los permisos del servidor. No se modificaron el buscador de Mi Día ni el rotador, que son recorridos distintos. No se verificaron dispositivos físicos Safari iOS/Chrome Android ni producción. La protección de borradores al navegar es una propuesta separada pendiente de autorización/ticket.
