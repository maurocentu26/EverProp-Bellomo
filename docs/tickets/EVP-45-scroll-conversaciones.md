# EVP-45 — Altura y scroll de Conversaciones en escritorio

Rama `ticket/EVP-45-scroll-conversaciones`, creada desde `origin/develop` actualizado. Fecha: 2026-10-18. Codex con Mauro. Entrega por PR a develop autorizada por el usuario. Sin deploy.

## 1. Qué pedía el ticket

Evitar que el historial expanda toda la página en escritorio. Mantener la navegación, la cabecera y el compositor accesibles, con scroll independiente del historial y la lista. Conservar la vista móvil. Trabajo paralelo autorizado a EVP-43/44.

## 2. Qué se implementó

- `everprop-public/src/components/admin/MainLayout.tsx`: la ruta de Conversaciones usa el alto disponible del área administrativa y limita su overflow en escritorio. Se permite reducir el área principal dentro del flex padre.
- `everprop-public/src/components/admin/conversations/ConversationInbox.tsx`: sección y grid ocupan el espacio restante; fila del grid y paneles admiten contracción (`min-height: 0`). Se elimina el mínimo de 70vh que no contemplaba la cabecera y los márgenes. El historial y la lista conservan sus scrolls existentes.
- Sin cambios a datos, API, IA, permisos ni dependencias. Los cambios de EVP-44 se preservaron en un stash separado antes de cambiar de rama.

## 3. Por qué esta solución

El historial ya tenía `overflow-y-auto`, pero ningún ancestro le imponía un alto limitado. Se corrige la cadena flex/grid existente en lugar de calcular alturas con JavaScript o fijar píxeles dependientes del tamaño de la cabecera. Las restricciones nuevas se limitan al breakpoint de escritorio y a esta ruta.

## 4. Cómo se verificó

Prueba en navegador con una conversación existente de 89 elementos, sin enviar mensajes ni cambiar su control:

- Antes, a 1440×900: bandeja de 7.816px y área administrativa con scroll de 7.880px.
- Después, a 1440×900: área administrativa 828px / scrollHeight 828px; historial 481px con contenido de 7.529px; compositor visible (borde inferior 859px).
- A 1366×768: área administrativa 696px / scrollHeight 696px; historial 334px con contenido de 7.949px; compositor visible a 727px. Desplazar el historial dejó el scroll de la página en cero.
- A 390×844: chat sigue a pantalla completa, compositor a 836px e historial con scroll propio. Se restauró el tamaño original del navegador al terminar.
- `npm run build`: correcto, incluido TypeScript y generación de rutas.
- ESLint de los dos archivos modificados: cero errores, dos warnings preexistentes (import no usado y actualización de estado en un efecto). `npm run lint` global: 92 errores y 161 warnings en el árbol existente, incluidos archivos de skills ajenos al cambio; no se corrigieron fuera de alcance.
- `git diff --check`: correcto.
- Capturas locales privadas: `.qa/evp45/antes.png`, `despues-1440.png`, `despues-1366.png`, `movil.png`.

No requiere revisión de aislamiento o seguridad LLM: solo clases de layout, sin cambios al flujo de datos o decisiones de IA.

## 5. Pendientes y riesgos

- No se verificó teclado físico de iPhone/Android; la prueba móvil fue emulación de viewport en navegador.
- El ticket conserva la lógica existente de resúmenes, respuestas rápidas y adjuntos; no rediseña sus controles.
- No está publicado ni integrado. Las pruebas reales de Instagram y push de EVP-43/44 siguen pendientes.
