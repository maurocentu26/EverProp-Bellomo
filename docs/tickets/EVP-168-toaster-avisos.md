# EVP-168 — Mostrar los avisos del panel: montar el Toaster de sonner

Rama `ticket/EVP-168-toaster-avisos` · commits pendientes · fecha 2026-11-19 · Claude (Opus 5.5) con Mauro Centurión

## 1. Qué pedía el ticket

Que los avisos del panel (confirmaciones, errores y novedades) se vean. El panel tiene 122 llamadas a `toast()` de sonner en 25 archivos, pero ninguna pantalla montaba el `<Toaster>` (no aparece en todo el historial de git), así que cuando algo fallaba el usuario no se enteraba. Se detectó en EVP-119.

Criterios: un error muestra su aviso en escritorio y móvil; respeta tema claro/oscuro y texto Grande; no tapa la navegación en 390 y 320 px; se anuncia a lectores de pantalla y se cierra con teclado; lint y build en verde. Fuera de alcance: reescribir los textos de los 122 avisos.

## 2. Qué se implementó

- [MainLayout.tsx](../../everprop-public/src/components/admin/MainLayout.tsx): un único `<Toaster>` de sonner dentro del contenedor del panel, abajo a la derecha, con el tema de `useTheme()`, colores por tipo (`richColors`), botón de cerrar, y región y botón en castellano ("Avisos", "Cerrar aviso"). El desplazamiento inferior sale de la variable `--toast-offset-bottom` (24 px en escritorio, 16 px en móvil por defecto).
- [admin-design.css](../../everprop-public/src/app/admin-design.css): en móvil (< 768 px), el contenedor del asesor fija `--toast-offset-bottom` en 100 px más el área segura, para que el aviso quede sobre su barra inferior.
- [panel-text-size.css](../../everprop-public/src/app/panel-text-size.css): los avisos usan la tipografía de la app; con texto Grande escalan a 15,6 px (título) y 14,4 px (descripción) y a 428 px de ancho; la cruz de cerrar pasa de 20 a 28 px.
- Avisos que cambian ahora que se ven:
  - "Nueva notificación" ([AdminNavbar.tsx](../../everprop-public/src/components/admin/AdminNavbar.tsx)): 8 s en lugar de 12 s. Si llegan varias juntas, solo dice cuántas (antes mostraba el texto y el destino de la primera). "Ver" solo aparece para destinos `/admin/...`, como en la bandeja de EVP-119; antes un `actionUrl` externo podía sacar al usuario del sitio.
  - "Nuevo lead asignado" ([MainLayout.tsx](../../everprop-public/src/components/admin/MainLayout.tsx)): se quitó la posición `top-center`, que tapaba la barra superior.

## 3. Por qué esta solución

- **Dentro del contenedor del panel:** así la variable del asesor llega por cascada sin calcular rol ni tamaño en JavaScript. Sonner usa `position: fixed` y `z-index: 999999999`, y ningún ancestro crea contexto de apilamiento, así que el aviso queda por encima de los diálogos modales (verificado).
- **Especificidad y `!important`:** sonner inyecta su CSS en tiempo de ejecución con tamaños en px y un `--width` en línea; las reglas del panel suben especificidad, y el ancho usa `!important`.
- No se tocaron los textos de los avisos (fuera de alcance). Ninguno se dispara en bucle: el sondeo de 30 s y 2 s solo refresca datos; los avisos salen de acciones del usuario o de notificaciones nuevas.

## 4. Cómo se verificó

- `npx tsc --noEmit`: sin errores. `npm run lint`: 0 errores; `AdminNavbar.tsx` y `MainLayout.tsx` tienen las mismas advertencias que en `develop` (5 y 1). `npm run test:notification-tray`: 4/4. `npm run build`: en verde.
- Navegador (worktree en `localhost:3168`, `NEXT_PUBLIC_DATA_MODE=mock`, asesor de muestra):
  - 390 px, oscuro, Chica: el aviso de una notificación nueva aparece con la tipografía de la app, `aria-live="polite"`, y termina en y=744 con la barra del asesor desde y=756 (sin superposición).
  - 320 px, Grande: ancho 16–304 px sin desborde, texto 15,6/14,4 px, termina en y=600 con la barra desde y=612. Región "Avisos alt+T" y botón "Cerrar aviso".
  - 1280 px, claro, Grande: tema claro, 428 px de ancho, cruz de 28 px. Una notificación con `actionUrl` externo no ofrece "Ver"; una con `/admin/leads` sí.
  - Error real: cambiar la etapa de un lead sin seguimiento muestra el aviso rojo "Es obligatorio registrar un seguimiento comercial…". Queda por encima del diálogo "Registrar seguimiento" que se abre a la vez, y es el elemento superior en su punto.
- No verificado: un error de red real contra la API (modo de muestra), un teléfono físico y lectores de pantalla reales.

## 5. Pendientes y riesgos

- **Cambio visible en todas las pantallas:** los 122 avisos empiezan a verse. Conviene recorrer los flujos principales en staging antes de producción; si alguno resulta redundante o con un texto incorrecto, va a un ticket aparte.
- En escritorio, un aviso abajo a la derecha puede tapar unos segundos el botón principal de un diálogo abierto; se cierra con la cruz, deslizando o esperando (sonner pausa al pasar el mouse).
- Sin cambios de backend ni de esquema. Antes de producción, verificar accesos del entorno como en cualquier cambio del panel.
