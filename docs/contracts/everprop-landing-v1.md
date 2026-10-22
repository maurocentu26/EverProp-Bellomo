# Contrato EverProp ↔ Landing Bellomo — v1.0

Fecha: 2026-10-22. Documento de coordinación entre ambos repositorios. Los endpoints de este documento son PROPUESTOS; no se confunden con `/api/v1/public/projects`, que ya existe. Implementación preparada en `everprop-bellomo`; backend pendiente. No modificar este contrato unilateralmente: comunicar cualquier diferencia al chat de la landing.

## 1. Alcance y decisiones

Bellomo administra desde EverProp: (a) qué proyectos son visibles en la landing, (b) cuáles se destacan en el hero, (c) sus datos públicos, imágenes, logos, galería, características, documentos y orden. Guardar aplica inmediatamente; sin borradores, CMS de bloques ni rediseño. Textos institucionales, contacto y texto general del hero quedan fuera.

No duplicar inventario ni crear proyectos paralelos: agregar presentación web al proyecto existente. La landing NO accede a SQL, credenciales R2, endpoints administrativos ni sesiones del panel. Sólo consulta una API pública server-to-server. No ejecutar cambios en este repo backend sin seguir sus reglas de tickets.

## 2. Identidad y publicación

- Clave estable: `public_id` UUID del proyecto existente. Nunca relacionar por nombre, número Huasi, posición o similitud.
- `slug`: único por tenant, minúsculas ASCII y guiones, patrón `^[a-z0-9]+(?:-[a-z0-9]+)*$`, máximo 120. URL canónica de la web: `/proyectos/{slug}`. No usar IDs internos.
- Slug se fija al publicar por primera vez y NO cambia al editar el nombre. Para renombrar URLs en una futura versión se necesitarán redirecciones explícitas.
- `is_visible` (boolean, inicialmente false): checkbox «Mostrar en la landing». Independiente del estado comercial. Un proyecto COMPLETED puede mostrar trayectoria; PLANNING también puede mostrarse si Bellomo lo habilita expresamente. No publicar automáticamente proyectos preexistentes.
- `is_featured` (boolean, inicialmente false): «Destacar en el inicio». Sólo puede ser true si `is_visible=true` y existe portada válida. Al ocultar un proyecto, desactivar también `is_featured` de forma atómica.
- La API de landing sólo devuelve proyectos no eliminados, del tenant resuelto, con `is_visible=true`; no reutilizar a ciegas el filtro público actual por estado. Sus unidades conservan las reglas comerciales de disponibilidad.
- No eliminar inventario al ocultar. Ocultar retira catálogo, hero y ficha. Ficha omitida => 404, aun con URL conocida.
- Revisar también `/public/projects`, `/public/properties` y las herramientas de Bellomito: no deben exponer por otro camino proyectos/unidades que Bellomo decidió ocultar en la web. Alinear filtros sin romper otros consumidores; documentar si necesitan un canal explícito `landing`.

## 3. Lectura pública que consume la landing (obligatoria)

### GET /api/v1/public/landing/projects

Sin autenticación de usuario. El tenant se resuelve con la infraestructura existente de EverProp. En local/testing se permite `X-Everprop-Tenant: <public_id de Bellomo>`; en producción NO depender de ese header: configurar hostname confiable de la API de Bellomo según `TrustedTenantResolver`. El hostname del frontend NO viaja automáticamente al backend. Ninguna clave administrativa debe ser necesaria.

Respuesta 200, Content-Type `application/json`. Snapshot COMPLETO, no paginado. Máximo 1000 proyectos (incluye todos los visibles); nunca truncar silenciosamente ni devolver una primera página. Si supera ese límite, acordar v1.1 antes de continuar. Orden de `data`: `sort_order ASC, public_id ASC`.

```json
{
  "schema_version": "1.0",
  "data": [
    {
      "public_id": "11111111-1111-4111-8111-111111111111",
      "slug": "edificio-huasi-7",
      "name": "Huasi 7",
      "summary": "Monoambientes y departamentos de uno y dos dormitorios.",
      "description": "Descripción pública completa del proyecto.\nPuede contener párrafos.",
      "category": "HUASI",
      "location": {
        "city": "San Salvador de Jujuy",
        "province": "Jujuy",
        "address": "Alto Padilla"
      },
      "status_label": "En construcción",
      "is_featured": true,
      "sort_order": 10,
      "featured_order": 10,
      "cover": {
        "url": "https://pub-6e84e10f99f7480da92cffa0fbe4b8b3.r2.dev/assets/H7%20-%20ALTO%20PADILLA/RENDERS/imag%201x.jpg",
        "alt": "Render de la fachada de Huasi 7",
        "kind": "RENDER"
      },
      "logo": null,
      "gallery": [],
      "features": ["Ascensor", "Cocheras"],
      "documents": [],
      "updated_at": "2026-10-22T15:00:00Z"
    }
  ]
}
```

Todos los campos anteriores deben existir, también los nullable y los arrays vacíos. No devolver `is_visible` ni IDs internos: la pertenencia al resultado ya determina visibilidad. No incluir `legacy_data`, notas, propietarios, clientes, costos, credenciales ni rutas privadas. Campos extra son tolerados por la landing pero no deben contener datos internos.

### Tipos y límites exactos

| Campo | Tipo / validación |
|---|---|
| `public_id` | UUID único en el snapshot |
| `slug` | Según sección 2, único en el snapshot |
| `name` | string de 1–160 caracteres sin espacios exteriores |
| `summary` | string de 1–400 caracteres, texto corto de tarjetas/hero |
| `description` | string de 0–20000 caracteres, texto plano con saltos de línea; nunca HTML/Markdown ejecutable |
| `category` | enum `HUASI`, `LAND_DEVELOPMENT`, `COMMERCIAL` |
| `location.city`, `.province` | string de 1–160 caracteres |
| `location.address` | string hasta 300 o null |
| `status_label` | string hasta 100 o null; etiqueta editorial, no disponibilidad de unidades |
| `is_featured` | boolean; true requiere cover no null |
| `sort_order`, `featured_order` | integer >= 0. Empates se resuelven por public_id ASC |
| `cover` | objeto imagen o null; null permitido sólo si no es destacado |
| `logo` | `{url, alt}` o null; alt de 1–300 caracteres |
| `gallery` | array ordenado de objetos imagen, máximo 100 |
| `features` | array ordenado de strings de 1–300 caracteres, máximo 100 |
| `documents` | array ordenado de `{title: string(1..160), url: URL}`, máximo 30 |
| `updated_at` | fecha ISO 8601 con zona, ej. `2026-10-22T15:00:00Z` |

Objeto imagen = `{url: URL, alt: string(1..300), kind: "PHOTO" | "RENDER"}`. Orden de galería/features/documentos es exactamente el del array. No necesita sort_order adicional por archivo.

Categorías editoriales del hero: `HUASI` → Departamentos Huasi; `LAND_DEVELOPMENT` → Loteos y urbanizaciones; `COMMERCIAL` → Locales y cocheras (incluye cocheras). No inferirlas del nombre. Cada categoría muestra sólo los destacados; si no tiene ninguno, no se muestra su pestaña. Sin destacados, hero sin selección de proyectos y catálogo completo debajo. Cualquier cantidad de destacados hasta el límite del snapshot; no completar con proyectos locales o no destacados.

La ficha obtiene sus datos del mismo snapshot buscando slug. No se necesita endpoint público de detalle adicional en v1: esto reduce discrepancias entre listado, visibilidad y ficha.

### Vacíos y errores

- Sin proyectos publicados: 200 con `{ "schema_version":"1.0", "data":[] }`; es un resultado válido, NO una falla.
- Tenant ausente/no válido: conservar respuesta segura del resolver (sin fallback a otro tenant).
- Fallas: 5xx; rate limit 429. Nunca responder 200 con contenido administrativo, error o snapshot parcial.
- CORS no es necesario para esta integración server-to-server. No habilitar escritura pública.

## 4. Escritura desde el panel (backend/panel)

Endpoint propuesto: `PUT /api/v1/admin/projects/{public_id}/landing`, autenticado y autorizado sobre ese proyecto/tenant. Aprovechar policies existentes; no confiar en tenant_id enviado. Body contiene la configuración completa:

```json
{
  "is_visible": true,
  "slug": "edificio-huasi-7",
  "name": "Huasi 7",
  "summary": "Monoambientes y departamentos de uno y dos dormitorios.",
  "description": "Descripción completa.",
  "category": "HUASI",
  "location": {"city":"San Salvador de Jujuy","province":"Jujuy","address":"Alto Padilla"},
  "status_label": "En construcción",
  "is_featured": true,
  "sort_order": 10,
  "featured_order": 10,
  "cover": null,
  "logo": null,
  "gallery": [],
  "features": [],
  "documents": []
}
```

El ejemplo de escritura anterior ilustra todos los campos, pero `is_featured=true` con `cover=null` DEBE producir 422. Cambiar a false o proporcionar portada para guardarlo.

GET `/api/v1/admin/projects/{public_id}/landing` devuelve `{data: <configuración completa + public_id + updated_at>}`. Sin configuración inicial devolver is_visible/is_featured false, órdenes 0 y valores iniciales derivados del inventario donde corresponda. Campos incompletos permitidos mientras is_visible=false; al publicar validar todos los requisitos del recurso público. PUT correcto: 200 con el mismo envelope; validación 422 con errores por campo; sin permisos 403; inexistente/fuera de tenant 404 conforme policies actuales. Conflictos de slug 422. Cambios atómicos; un guardado fallido no altera el snapshot.

Backend puede reutilizar tablas o campos actuales: el contrato fija comportamiento y payload, no obliga una estructura SQL. Nunca guardar archivos o texto editorial dentro de legacy_data como contrato permanente.

## 5. Archivos y R2

URLs públicas HTTPS bajo el origen actualmente permitido por Next:
`https://pub-6e84e10f99f7480da92cffa0fbe4b8b3.r2.dev/assets/`.

Sin querystring, fragmentos ni credenciales; paths correctamente codificados. No URLs temporales firmadas, localhost, otros tenants o archivos privados. Para agregar otro origen coordinar también el cambio de allowlist/Next; no asumir que cualquier URL se renderiza.

El panel debe permitir seleccionar archivos ya existentes en R2 y, si habilita cargas nuevas, guardarlas como assets públicos de Bellomo. No reusar el endpoint de media de una unidad como si fuera galería del proyecto. Ruta propuesta para nuevas cargas: POST `/api/v1/admin/projects/{public_id}/landing/media`, multipart `file` + `kind` (PHOTO/RENDER para imágenes) + `alt` o `title` según uso. Respuesta 201 `{data:{url, mime_type, size_bytes}}`; usar esa URL en PUT. Aplicar ownership/policies, validación real MIME/tamaño y paths del tenant. No implementar cargas de video en este alcance.

Imágenes para hero: recomendar originales de al menos 1920px de ancho; logos PNG/WebP/SVG sanitizado. Documentos v1: PDF público. Cambiar archivo debe generar una URL nueva para evitar caché antigua. Quitar una referencia no debe borrar un archivo compartido por otra sección.

## 6. Actualización, errores y activación

- Objetivo: cambios guardados visibles en una NUEVA carga de la página en <=60 segundos. No incluye refresco automático de una pestaña abierta.
- La landing preparada usa fetch server-side `cache:no-store`, timeout 8s, sin redirects ni envío de cookies. Backend/proxy no debe conservar un snapshot viejo más de 60s; preferir `Cache-Control:no-store` inicialmente.
- Sin dependencia de webhook ni rebuild para actualizar. No hacer un fetch por cada tarjeta.
- En modo EverProp, una falla o respuesta incompatible muestra catálogo temporalmente no disponible; NO reconstruye datos locales ni mezcla fuentes. No se promete última versión persistida en esta v1, porque podría republicar proyectos ocultos.
- Modo local actual se mantiene hasta activación explícita. Configurar en la landing (variables server-only): `BELLOMO_PROJECT_SOURCE=everprop`, `EVERPROP_API_URL=<origen backend>`, y sólo en desarrollo `EVERPROP_TENANT_PUBLIC_ID=<UUID Bellomo>`. Producción exige HTTPS y hostname tenant configurado. Reiniciar/redeploy una vez para activar variables, no por cada cambio editorial.
- No poner secretos en NEXT_PUBLIC ni enviar una sesión administrativa al frontend.

## 7. Migración inicial (coordinar, sin inferencias)

Crear una tabla de correspondencia revisada por humano entre public_id EverProp y slug actual de la landing. Ejemplos de slugs actuales: `edificio-huasi-7`, `edificio-huasi-x`, `torre-departamentos-h9`, `las-colinas`, `la-arbolada`. La similitud de nombres NO prueba identidad. Los agrupadores actuales `/desarrollos/edificios-huasi` no representan un proyecto único: en modo API el catálogo enlaza fichas individuales `/proyectos/{slug}`. URLs agrupadas antiguas que no coincidan con un slug devuelven 404; si se requiere conservarlas, acordar un mapa explícito antes de activar.

Poblar presentación y referencias de assets existentes, aprobar correspondencias y recién entonces marcar visibles. La landing local contiene proyectos que pueden no existir aún en API: no inventar UUIDs ni crearlos silenciosamente. En modo API también se retira el showcase constructivo estático de la home para no filtrar proyectos ocultos por una sección secundaria.

## 8. Pruebas de aceptación compartidas

1. Listar datos reales de Bellomo; comprobar que UUIDs, categorías y slugs coinciden con el mapeo aprobado.
2. Cambiar nombre, resumen y portada desde panel; nueva carga de home, catálogo y ficha refleja los tres sin build.
3. Cambiar destacados/órdenes; hero sólo incluye los marcados, en orden y categoría correctos; logo corresponde al proyecto.
4. Ocultar destacado: desaparece de snapshot, hero, catálogo, fichas (404) y resultados de búsqueda/Bellomito del canal web.
5. Catálogo vacío válido no recupera datos estáticos. Categoría vacía no rompe el hero; 1 destacado permite recorrer sin errores.
6. Guardado incompleto, featured sin cover, slug duplicado, archivos privados y escritura sobre otro tenant se rechazan.
7. Tenant incorrecto nunca recibe proyectos Bellomo. Anónimo no escribe ni recibe IDs internos/datos privados.
8. 5xx, timeout, versión no soportada, UUID/slug duplicados o payload inválido no activan un fallback local.
9. Probar producción con su hostname real: header local no constituye prueba de routing productivo.

## 9. Entrega esperada del chat backend

Confirmar contrato 1.0 o señalar diferencias ANTES de desarrollar. Entregar endpoint GET funcional, endpoints de edición y UI de panel, mapeo UUID↔slug, fixture JSON que valide contra `src/lib/landing-contract.ts`, evidencias de tenant/publicación, y origen público de producción. Mantener este archivo junto a la implementación como fuente del acuerdo. La landing no modifica EverProp; el otro chat debe seguir sus tickets y autorizaciones.

Fixture ejecutable de referencia: `docs/everprop-landing-contract-v1.fixture.json` (UUID de ejemplo, no corresponde al inventario real). Validación de la landing: `npm test`, especialmente `tests/landing-contract.test.mjs`.
