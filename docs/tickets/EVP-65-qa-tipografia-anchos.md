# EVP-65 — Correcciones de QA antes de integrar el rediseño

Rama `ticket/EVP-65-rediseno-visual` · base `45829ea` · 2026-10-26 · Codex / Álvaro Ruggeri · PR #72.

## 1. Qué pedía el ticket

Corregir los cuatro problemas confirmados tras actualizar la rama: navegación menor al cuerpo, máximos de página distintos, columna lateral angosta en tablet y desborde de la tarjeta de seguimientos a 320 px. Álvaro solicitó corregirlos y documentarlos en el PR antes del merge. EVP-65 verificado En curso y asignado a Álvaro.

## 2. Qué se implementó

- `everprop-public/src/app/admin-design.css`: navegación administrativa de 1,0625 rem (17 px; aproximadamente 20,4 px con lectura Grande); columna de Mi Día estirada a todo el ancho al pasar a flex; tarjetas de urgencia en una columna hasta 360 px, y hasta 480 px con texto Grande.
- `everprop-public/src/components/admin/MainLayout.tsx`: clase de contenedor compartido que deja las páginas al ancho disponible dentro del máximo exterior de 100 rem. Se conservan límites internos de lectura y diálogos.
- Corregido también el selector de etapa de Mi Día: su etiqueta permite envolver y el select puede encogerse en su columna. El chequeo de 320 px lo detectó después de corregir la tarjeta.
- Capturas de tablet y móvil en `docs/tickets/evidence/EVP-65-qa/`.

## 3. Por qué esta solución

Se modifican las reglas compartidas existentes, sin repetir cambios en cada página ni reaplicar el stash anterior. Se preserva el diseño nuevo del PR. La escala rem respeta la preferencia de lectura y las tarjetas pasan a una columna cuando no caben palabras completas. Sin dependencias, API, datos ni migraciones.

## 4. Cómo se verificó

- Firefox/Playwright, sesión local de prueba: Mi Día a 1920, 1440, 850, 390 y 320 px; aserciones de ancho de página, tamaño de navegación, columna lateral, desborde principal y etiquetas recortadas.
- A 1920 px, Activos, Leads y Agenda usan los 1600 px del contenedor (antes 1400/1500/1400).
- A 850 px, ambas columnas de Mi Día miden 802 px; a 320 px no hay desborde de la tarjeta ni del selector de etapa.
- Texto Grande y modo oscuro: comprobación adicional en escritorio y móvil.
- 49 pruebas aprobadas: Mi Día, Agenda, Cobranzas, Activos, Proyectos, Conocimiento, Configuración, preferencias de lectura, Matriz y Estadísticas.
- `npx tsc --noEmit`: aprobado. ESLint de MainLayout: cero errores y un aviso previo por `ShieldAlert` no usado. `git diff --check`: aprobado.

## 5. Pendientes y riesgos

No se certifican todos los diálogos, roles, lector de pantalla, zoom al 200 % ni integración funcional con backend; no se ejecutó build de producción para este ajuste. API local sigue usando evp52-local. El PR permanece abierto para revisión humana; estos controles locales no sustituyen sus checks remotos ni autorizan merge. El stash anterior se conserva intacto.
