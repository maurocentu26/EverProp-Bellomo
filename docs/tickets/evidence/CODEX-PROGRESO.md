# Progreso Codex — Conformidad (2026-10-26)

Se cotejó el certificado PDF local del 8/9/2026. Conformidad detallada punto por punto en los informes EVP-71/72/73/74/75/78, sección Conformidad. ✓ identifica pruebas de componente/código, no aprobación en navegador; ✗ indica pendiente.

- EVP-71 Agenda: ✓ alta/revisión/cancelación y rol asesor/admin probados. Día seleccionado negro/blanco y hoy con punto rojo. Archivos: CalendarAgenda.tsx, agenda-redesign.test.mjs, admin-catalog.css.
- EVP-72 Cobranzas: ✓ pagos/planes conservados. Resumen mínimo 220 px, montos nowrap; saldo mensual USD/ARS probado, sin pagadas/canceladas ni sumar moneda null. Archivos: cobranzas/page.tsx, collections-redesign.test.mjs, admin-catalog.css.
- EVP-73 Activos: ✓ cinco tipos exigidos y filtro Venta/Alquiler/Temporal en mock/API, páginas 1/2. USD/ARS y 12/12A/12B preservados. Precio o moneda null: Precio a confirmar. Archivos: properties/page.tsx, inventory-labels.ts, parámetros de inventario en everprop-api.ts y pruebas inventory/inventory-api.
- EVP-74 Proyectos: ✓ portada/estado/disponibles y ficha conservados; barra de vendidas con leyenda y prueba cero vendidas; pastilla blanca flexible. Archivos: ProjectCard.tsx, projects-redesign.test.mjs, admin-catalog.css.
- EVP-75 Matriz: ✓ leyenda con conteos reales por manzana; códigos completos y Ver; tarjeta negra con m²/precio/estado/Ver ficha. Sheet conservado, apertura/cierre probados. Archivos: InventoryMatrix.tsx, lots-matrix-redesign.test.mjs, admin-catalog.css.
- EVP-78 Configuración: ✓ permisos/preferencias/confirmaciones conservados; radio 24 y sin uppercase. Estilos solo en admin-catalog.css; componentes compartidos intactos.

Suite: 171 pruebas, 165 aprobadas y las seis fallas conocidas de notifications-worker. Lint: 0 errores/127 advertencias; TypeScript directo OK. Build compiló y falló con spawn EPERM al lanzar TypeScript.

✗ Pendientes nueva medición/capturas y recorrido real por Claude. Sus mediciones 1366/375 normal/Grande (0 encimados/desbordes, sin scroll horizontal) corresponden a la pasada anterior. El guion completo cruza pantallas de Claude. Persistencia MySQL/Sanctum no aplica en mock (almacenamiento local); API real pendiente.

Sin navegador/servidor nuevo, backend, SQL, entornos, secretos, dependencias nuevas, git add/commit/push/deploy. El helper de precio también repercute en Mi Día sin editar AdvisorCockpit. NewVisitModal compartido sigue reservado a Claude.

Incidente al cierre: Windows informó paginación insuficiente y C quedó sin espacio. Se restauró este archivo tras una escritura fallida; se descartaron únicamente logs temporales duplicados generados por Codex. No se limpiaron archivos de Claude ni del servidor.

## Sesión acotada — EVP-73/74, Comercial y fichas (2026-10-26)

- Comercial: diez data-label, filas apilables por ancho del contenedor (<1100 px), vacíos fuera de tabla, Ver unidad por teclado; altas/permisos conservados. Helpers existentes para precio en vivo/moneda null y estado real.
- Ficha de activo: precio destacado, encabezado radio 24 y disponibilidad en pastilla pastel. Alta: tipografía/controles de inventario y tarjeta radio 24, sin reescribir formulario.
- Ficha de proyecto: estado real en pastilla y encabezado radio 24. Sin nueva tarjeta negra sin prioridad real ni métricas inventadas.
- Estilos solo en admin-catalog.css. No se tocaron archivos reservados de Claude ni sus cambios concurrentes. Sin Git de escritura, backend, entorno, secretos, Docker, servidor ni navegador.
- Nuevas pruebas: tests/commercial-catalog.test.mjs (2 aprobadas): filas/labels/precios/estados/enlaces, vacío/error y roles.
- Suite sin aislamiento: 173 pruebas, 167 aprobadas, seis fallas conocidas de notifications-worker. El comando normal falló por spawn EPERM.
- TypeScript: npx tsc --noEmit --incremental false OK. Detector de diseño: []. Lint: OK, 0 errores y 126 advertencias. Logs de esta pasada: docs/tickets/evidence/EVP-73/codex-acotado-{tests,lint,tsc,design}.log. Build no ejecutado en esta pasada acotada; no se declara OK.
- ✗ Revisión visual pendiente de Claude en 1366/1440 y 375, normal/Grande, claro/oscuro y movimiento reducido. No se generaron capturas ni se ejecutó el script DOM; no hay resultado [] acreditado de solapamientos. Rutas esperadas y Conformidad por pantalla en los informes EVP-73/74.
