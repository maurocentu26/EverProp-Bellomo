# Charters QA humana sobre `/admin`

## Administrador/gerente

Dashboard, cambio de modo, sidebar, tema, búsqueda global, navegación, propiedades, proyectos, inventario, leads, comercial, agenda y settings. Se crearon únicamente `Casa QA Integral`, `QA Lead Integral 20260907`, un interés sintético y dos lotes 901–902 en mock/localStorage. El interés se eliminó y el asesor se restauró.

## Asesor

Login mock Valentina, dashboard asignado, cola prioritaria, filtros, etapa y seguimiento. Se confirmó navegación limitada, pero el baseline permitía acceso directo a settings/alta de propiedad; se agregaron guards y falta E2E de rol.

## Inventario

Proyecto Barrio San José, tabs, modal de batch, generación sintética, matriz y detalle de lote. Se confirmó ambigüedad accesible en links repetidos llamados sólo “1”, “2”, etc.

## CRM

Búsqueda/filtros, alta, detalle, interés create/edit/delete, reasignación/restauración, edición/cancelación y simulador financiero. Luego se confirmó en navegador API local login 200 y alta 201 en desktop/mobile, con dos leads persistidos en MySQL; RBAC/tenancy críticos pasaron en PHPUnit. El recorrido UI→API completo de detalle/intereses/follow-ups sigue parcial.

## Agenda/configuración

Agenda funcionó sólo como demo local; el input datetime no pudo confirmarse con CUA y no se creó visita. Settings era un placeholder con tres botones muertos. El working tree evita presentar ambas como persistencia real.

## Responsive/accesibilidad

Playwright smokeó 393×851 y 1280×720 en Chrome. CUA no permitió fijar 360/390/768/1440 exactos; no hubo Firefox/WebKit/Edge, axe, lector o zoom 200%. Se registró BLOCKED, no PASS inferido.
