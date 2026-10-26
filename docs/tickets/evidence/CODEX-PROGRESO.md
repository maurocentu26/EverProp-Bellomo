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