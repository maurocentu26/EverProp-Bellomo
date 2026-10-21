# EVP-49 - Semáforo de acción del inicio

Rama `ticket/EVP-49-semaforo-inicio`, desde develop `6f8dfc9`. Fecha 2026-10-20. Álvaro / Codex. Implementación publicada en la rama del ticket para revisión por PR hacia develop.

## 1. Qué pedía el ticket
[Jira EVP-49](https://eversys.atlassian.net/browse/EVP-49): diseño sobrio, legible, con corporate-design-system. Sin cambios en clasificación, permisos ni API.

## 2. Qué se implementó
- AdvisorCockpit.tsx: sección Prioridades del día, iconos compactos sin animación continua, explicaciones visibles, tipografía mínima de 12px y composición adaptable.
- admin-design.css: eliminación de reglas contradictorias y animaciones ya sin consumidores; superficies neutrales, color semántico en iconos y borde superior, selección visible y foco.
- panel-text-size.css: etiqueta ampliada legible.
- Agenda identificada como agenda, sin confundir sus citas con clientes al día.

## 3. Por qué esta solución
Se conserva JSX, datos, controles y cálculo compartido existentes. No agrega dependencias ni abstracciones. La raíz del problema era CSS global que imponía tamaños de 9px y anulaba fondos/bordes.

## 4. Cómo se verificó
- npm run build: PASS.
- npm run lint completo: 0 errores, 153 advertencias del repositorio.
- node --test tests/commercial-queue.test.mjs: 11/11 PASS.
- ESLint del componente: 0 errores, 3 advertencias preexistentes por imports sin usar.
- Navegador local con API y cuenta demo: tema claro y oscuro, filtro atrasados muestra 2 de 2; nuevos muestra 3 de 3; hoy muestra estado vacío; aria-pressed sincronizado con pestaña.
- No toca queries, policies, jobs, caché ni IA: revisores de tenant/LLM no aplican al diff de presentación.

## 5. Pendientes y riesgos
Sin deploy ni merge. CI remoto se registra en el PR. Falta revisión en dispositivo móvil real. La base local tiene una diferencia de esquema preexistente; no se modificó. Evidencia visual en evidence/EVP-49/.
