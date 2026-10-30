# EVP-102 — UI: Indicador de enlace activo en sidebar colapsado edge-to-edge sin asfixia de padding

Rama `ticket/EVP-102-navbar-activo-colapsado` · commits `e63e2db` · fecha 2026-10-30 · autor (Mauro Centurión y Antigravity)

## 1. Qué pedía el ticket
Corregir la visualización del enlace activo en la barra de navegación lateral (`SidebarNav`) cuando el panel se encuentra en modo colapsado (icon mode). 

En el estado previo, la cápsula blanca (`<section>`) aplicaba un `padding: 10px` incondicional. En modo colapsado, con el sidebar midiendo 48px y el contenedor interno 32px, restar 20px de padding horizontal dejaba el enlace activo comprimido a un ancho de apenas 12px frente a 48px de alto. Esto provocaba que el color oscuro activo (`#141518`) se renderizara como una tira estrecha y deformada, rodeada por un marco blanco sobrante.

**Criterios de aceptación:**
1. En modo colapsado (`data-state="collapsed"`), el enlace activo (`aria-current="page"`) cubre todo el ancho del elemento contenedor de borde a borde (edge-to-edge) sin márgenes blancos asimétricos.
2. La curvatura superior e inferior de la cápsula (`border-radius: 22px`) delimita limpiamente el elemento activo vía `overflow: hidden`.
3. El modo expandido (`data-state="expanded"`) se mantiene 100% inalterado con su padding de 10px, títulos de sección y tipografía de 17px intactos.
4. Cumplimiento estricto del `corporate-design-system`: sin degradados, sin emojis, contrastes sólidos AA y altura táctil accesible mínima de 44px (48px efectivo).

**Fuera de alcance:**
- Modificación de rutas, autenticación o reestructuración de la barra de navegación en desktop expandido o móvil.

## 2. Qué se implementó
- En [`everprop-public/src/app/admin-design.css`](file:///c:/Users/mauro/Documents/EverSys/Proyectos/EverProp/everprop-public/src/app/admin-design.css#L1370-L1374), se agregaron las reglas específicas para el sidebar colapsado:
  ```css
  /* Navegación lateral colapsada: cápsula sin padding y enlace activo edge-to-edge (EVP-102) */
  .admin-workspace [data-state="collapsed"] [data-slot="sidebar-content"] nav[aria-label="Navegación administrativa"] > section { padding: 0; overflow: hidden; }
  .admin-workspace [data-state="collapsed"] nav[aria-label="Navegación administrativa"] a { width: 100%; border-radius: 0 !important; min-height: 48px; }
  .admin-workspace [data-state="collapsed"] nav[aria-label="Navegación administrativa"] .space-y-1 > :not([hidden]) ~ :not([hidden]) { margin-top: 0; }
  ```
- **Flujo de punta a punta:**
  1. Al contraer el menú lateral (haciendo clic en el botón de topbar o vía cookie `sidebar_state=false`), el componente `Sidebar` asigna el atributo `data-state="collapsed"`.
  2. El selector `.admin-workspace [data-state="collapsed"] ... > section` remueve el padding lateral y vertical de la cápsula (`padding: 0`) y activa `overflow: hidden`.
  3. Los enlaces ocupan el 100% del ancho (32px de 32px disponibles dentro de `px-2`), manteniendo los iconos centrados y haciendo que el background activo `#141518` cubra de extremo a extremo la cápsula.
  4. Al expandir el sidebar nuevamente (`data-state="expanded"`), los estilos se restablecen instantáneamente al diseño amplio con padding de 10px y esquinas redondeadas individuales de 14px.

## 3. Por qué esta solución
- **Principio de mínima intervención (Ponytail):** No requirió alterar componentes React ni estructuras JSX en `AdminNavigationMenu.tsx` ni en `Sidebar.tsx`. Se resolvió con 4 líneas de CSS puro en `admin-design.css`.
- **Alternativas descartadas:**
  - *Botón circular centrado (40px × 40px):* Requería ensanchar la barra a 56px y modificar múltiples variables de Tailwind/shadcn en `sidebar.tsx`. Se descartó para no alterar los anchos estándar del panel.
  - *Modificación condicional por JS:* Innecesaria ya que el atributo de estado nativo de shadcn (`data-state="collapsed"`) permite aplicar el comportamiento directamente mediante selectores CSS puros con cero costo de re-renderizado.

## 4. Cómo se verificó
1. **Inspección en vivo vía Puppeteer (Edge Headless):**
   - **Modo colapsado:**
     - `sectionWidth`: 32px
     - `activeLinkWidth`: 32px (100% de la cápsula)
     - `sectionPadding`: 0px
     - `activeLinkHeight`: 48px
     - `sectionBorderRadius`: 22px
     - `activeLinkBg`: `#141518` (dark) / `#f2f4f3`
   - **Modo expandido:**
     - `sectionWidth`: 240px
     - `activeLinkWidth`: 220px
     - `sectionPadding`: 10px
     - `activeLinkHeight`: 48px
2. **Evidencia fotográfica guardada en:**
   - [`docs/tickets/evidence/EVP-102-sidebar-colapsado-live.png`](file:///c:/Users/mauro/Documents/EverSys/Proyectos/EverProp/docs/tickets/evidence/EVP-102-sidebar-colapsado-live.png)
3. **TypeScript / Typecheck:** `npx tsc --noEmit` completado exitosamente con 0 errores.
4. **Dev Server en vivo:** Turbopack recargó los estilos en `http://localhost:3000/admin` respondiendo HTTP 200 OK.

## 5. Pendientes y riesgos
- **Riesgo:** Nulo. Las reglas CSS están estrictamente aisladas al selector `.admin-workspace [data-state="collapsed"]` y no afectan vistas públicas, modales ni el menú expandido.
- **Pendientes:** Ninguno para este ticket.
