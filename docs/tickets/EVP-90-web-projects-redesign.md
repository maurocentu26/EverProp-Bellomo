# EVP-90 — Panel Web: Rediseño Descriptivo de Proyectos y Vista Previa de Landing

Rama `ticket/EVP-90-web-projects-redesign` desde `origin/develop` (`fc20afa`) · 2026-10-28 · Antigravity con Mauro. Sin merge a `develop` ni a `main`: requieren autorización y revisión expresa del usuario en PR.

---

## 1. Qué pedía el ticket

Cambiar la vista de proyectos en el módulo web del panel de administración (`/admin/web`) por una experiencia descriptiva, visual e intuitiva que permita a los administradores:
1. Visualizar de manera rápida los proyectos con sus fotos oficiales (portada y logo), textos comerciales (eslogan/sumario, descripción), ubicación y características clave (luz, agua, gas, etc.).
2. Buscar rápidamente por nombre, eslogan o ubicación, y filtrar por categoría de desarrollo (Loteos, Huasis, Comerciales y otros).
3. Conmutar rápidamente la visibilidad pública de cada desarrollo en la landing sin tener que ingresar obligatoriamente a editar cada uno.
4. Contar con un modal de **Vista Previa de Landing** que renderice una simulación exacta y fiel de cómo los visitantes verán el desarrollo en la landing pública de Bellomo antes de publicarlo o tras realizar modificaciones.
5. Proponer y consensuar previamente un prototipo funcional tangible antes de la implementación final en el código fuente.

---

## 2. Qué se implementó

### A. Backend (`everprop-api`)
- **`ProjectLandingController::index`** (`app/Domain/Inventory/Http/Controllers/ProjectLandingController.php`):
  - Se enriqueció la respuesta de `GET /api/v1/admin/web/projects` para devolver no sólo metadatos básicos (`public_id`, `name`, permisos), sino toda la información de presentación pública disponible en `project_landing` (`slug`, `is_visible`, `sort_order`, `summary`, `description`, `category`, `status_label`, `is_featured`, `location`, `cover`, `logo`, `gallery`, `features`).
  - La consulta se realiza de manera eficiente mediante un único `keyBy('project_id')` sobre la tabla `project_landing` indexada por tenant, garantizando costo `O(1)` por fila y cero problemas de consultas N+1.

### B. Frontend (`everprop-public`)
- **`src/lib/project-landing.ts`**:
  - Se extendió el tipo `ProjectOption` para soportar las propiedades enriquecidas opcionales de la landing pública con tipado estricto en TypeScript.
- **`src/components/admin/ProjectWebEditor.tsx`**:
  - **Catálogo Descriptivo Principal**:
    - Reemplazo de la interfaz anterior de selección desplegable por una cuadrícula moderna de tarjetas enriquecidas.
    - Cada tarjeta expone: imagen de portada con relación 16:9, logotipo flotante del proyecto, badge de categoría oficial (Loteo, Huasi, Comercial), badge de estado comercial (Preventa, En pozo, etc.), dirección y localidad, eslogan comercial, etiquetas de características principales y switch directo para conmutar la visibilidad.
  - **Barra de Búsqueda y Filtros de Categoría**:
    - Input de búsqueda reactivo en tiempo real por texto (nombre, eslogan, ubicación).
    - Botones de filtro por categoría con contadores dinámicos: *Todos*, *Loteos*, *Huasi* y *Comercial*.
  - **Modal de Vista Previa de Landing (Landing Preview Modal)**:
    - Modal accesible e interactivo que simula el componente visual de la landing de Bellomo:
      - Encabezado con imagen hero y logotipo oficial.
      - Ficha técnica: Categoría, estado de preventa/construcción, ubicación geográfica precisa y enlace a Google Maps si está configurado.
      - Píldoras de servicios y amenidades destacadas.
      - Resumen ejecutivo y descripción detallada del emprendimiento.
      - Botón simulado de contacto comercial por WhatsApp directo para validar la llamada a la acción.
      - Acceso directo "Editar contenido web" desde el mismo modal de vista previa.
  - **Cumplimiento de Corporate Design System**:
    - Cero gradientes decorativos (`bg-white`, `bg-slate-50`, bordes limpios `border-slate-200`).
    - Cero emojis en componentes de interfaz de usuario.
    - Iconografía técnica estandarizada con `lucide-react`.

### C. Ingesta de Datos Oficiales de Bellomo
- Se procesó el documento oficial de copy de Bellomo y se precargaron en base de datos local los 32 proyectos de la empresa (17 loteos, 9 proyectos Huasi y 3 comerciales/cocheras) con sus descripciones, servicios, coordenadas de Google Maps y slugs correspondientes, vinculando los assets ya existentes en Cloudflare R2.

### D. Pruebas Automatizadas
- **`everprop-public/tests/web-projects-redesign.test.mjs`**:
  - Test unitario de sanitización de payload con `landingPayload`.
  - Test de integración de renderizado estático del componente `ProjectWebEditor` verificando la presencia de títulos, placeholder de búsqueda, pestañas de categoría y cumplimiento de la regla de no degradados del Corporate Design System.

---

## 3. Por qué esta solución

1. **Eficiencia y Cero Dependencias Innecesarias (Ponytail)**:
   - Se aprovechó la estructura de datos existente en `project_landing` y las rutas de API vigentes sin alterar esquemas de base de datos ni crear tablas redundantes.
   - Se respetó estrictamente el contrato compartido de la landing (`landing-contract.ts` v1.0).
2. **Experiencia de Usuario (UX)**:
   - El administrador ya no debe ingresar a ciegas a cada proyecto para saber qué fotos o textos tiene cargados; la vista de catálogo resume el estado visual general y permite auditorías rápidas.
   - El modal de previsualización evita tener que cambiar de pestaña o abrir el entorno de producción para validar cómo impacta un cambio de texto o de imagen.

---

## 4. Cómo se verificó

- **Backend (PHP/Laravel en Docker)**:
  - `php artisan test tests/Feature/Inventory/ProjectLandingTest.php`: 20 tests pasados con 161 aserciones.
  - `vendor/bin/pint --test app/Domain/Inventory/Http/Controllers/ProjectLandingController.php`: Sin observaciones de estilo.
  - `vendor/bin/phpstan analyse app/Domain/Inventory/Http/Controllers/ProjectLandingController.php`: 0 errores encontrados en nivel 8.
- **Frontend (Next.js/React)**:
  - `npx tsc --noEmit`: 0 errores de compilación TypeScript.
  - `npx eslint src/components/admin/ProjectWebEditor.tsx src/lib/project-landing.ts tests/web-projects-redesign.test.mjs`: 0 errores, 0 warnings.
  - `node --test tests/project-landing-upload.test.mjs tests/web-projects-redesign.test.mjs`: 5 tests pasados exitosamente.
- **Integración en Vivo**:
  - API local de EverProp corriendo en `http://localhost:18080`.
  - Panel administrativo Next.js corriendo en `http://localhost:3000/admin/web`.
  - Landing de Bellomo corriendo en `http://localhost:3001/desarrollos` y `/proyectos/el-rocio`, respondiendo con código 200 OK y consumiendo los datos de la API.

---

## 5. Pendientes y Riesgos

- **Imágenes en Cloudflare R2**:
  - Aunque los logos y fotos están mapeados en el seed local, en staging y producción se debe verificar que los nombres de archivo y rutas en el bucket R2 correspondan con los IDs registrados en `project_landing_assets`.
- **Regla estricta de Merges**:
  - La rama `ticket/EVP-90-web-projects-redesign` se subirá al repositorio remoto y se abrirá el Pull Request correspondiente hacia `develop`, quedando a la espera de la revisión y aprobación expresa del usuario.
