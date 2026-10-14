# EVP-21 — Habilitar acceso y gestión comercial completa de leads para rol rotador (provisorio)

Rama `ticket/EVP-21-acceso-comercial-rotador` (desde `develop`) · fecha 2026-10-14 · Antigravity con Mauro Centurion
Ticket Jira [EVP-21](https://eversys.atlassian.net/browse/EVP-21).

## 1. Qué pedía el ticket

Por decisión explícita del cliente y con fines de agilidad durante la etapa provisoria/transición, el rol Rotador (`ROTATOR`) debe contar con acceso a toda la información comercial de los leads, tanto al crearlos como al visualizarlos y editarlos en la ficha del lead.

**Criterios de aceptación:**
1. En el alta de nuevo lead (`/admin/leads/new`):
   - El rotador puede seleccionar y vincular un inmueble o proyecto de interés (`property_id`), cargando el catálogo sin restricciones.
   - El formulario permite cargar prioridad, presupuesto y moneda.
   - El backend autoriza la vinculación de inmuebles y la creación en etapas comerciales estándar.
2. En la ficha del lead (`/admin/leads/[id]`):
   - El rotador puede acceder a la ficha del lead y reasignar asesor (`canAssign`).
   - Se visualizan los datos comerciales de calificación (presupuesto, prioridad, intereses independientes y cronograma de visitas).
   - Se mantiene bloqueado el acceso a módulos administrativos ajenos al CRM comercial (usuarios y cobranzas/acuerdos de pago).
3. Backend:
   - Se actualizan los límites de `RotatorRoleBoundary` para permitir lectura de catálogo (`projects`, `properties`) y endpoints de leads, visitas y seguimientos.
   - Se habilita visibilidad por defecto `ALL` de inventario en `InventoryAccess` para usuarios `ROTATOR`.
   - Se actualiza `VisitPolicy` para incluir `ROTATOR`.
   - Se actualizan las pruebas unitarias y de integración correspondientes.

## 2. Qué se implementó

### Backend (`everprop-api`):
- [RotatorRoleBoundary.php](../../everprop-api/app/Domain/Identity/RotatorRoleBoundary.php): Se flexibilizó el middleware para permitir que usuarios con rol `ROTATOR` lean el catálogo (`GET /api/v1/admin/projects*`, `GET /api/v1/admin/properties*`), gestionen intereses de leads (`POST/PATCH/DELETE /api/v1/admin/leads/*/properties*`), seguimientos (`follow-ups`) y citas (`visits`). Se mantiene el rechazo `403` sobre administración de usuarios y cobranzas.
- [AdminLeadController.php](../../everprop-api/app/Domain/CRM/Http/Controllers/AdminLeadController.php):
  - En `store()`: se removió la validación restrictiva que impedía al rotador asociar `property_id` o crear leads con etapa.
  - En `update()`: se removió la validación que restringía la actualización exclusivamente a `agent_id`, permitiendo actualizar notas comerciales y campos generales.
- [InventoryAccess.php](../../everprop-api/app/Domain/Inventory/Services/InventoryAccess.php): Se agregó `RoleCode::ROTATOR` a los roles con visibilidad `ALL` de catálogo por defecto para permitir vincular activos del tenant sin necesidad de asignar alcances manuales en `user_inventory_scopes`.
- [VisitPolicy.php](../../everprop-api/app/Domain/CRM/VisitPolicy.php): Se incluyó `RoleCode::ROTATOR` en `viewAny`.
- [RotatorTest.php](../../everprop-api/tests/Feature/CRM/RotatorTest.php): Se actualizaron las pruebas de integración para verificar la creación con inmueble vinculado, la consulta del catálogo, la actualización comercial y la persistencia de las restricciones en módulos administrativos.

### Frontend (`everprop-public`):
- [NewLeadForm.tsx](../../everprop-public/src/components/admin/NewLeadForm.tsx):
  - Se habilitó la carga de catálogo para rotadores eliminando el retorno temprano.
  - Se habilitó la Sección 2 (Interés inmobiliario) para rotadores, permitiendo seleccionar desarrollo y activo específico.
  - Se desbloqueó el selector de etapa comercial y se habilitaron los campos de prioridad, presupuesto y moneda para persistencia completa.
- [MainLayout.tsx](../../everprop-public/src/components/admin/MainLayout.tsx): Se permitió el acceso a la ruta de ficha individual de lead (`/admin/leads/[id]`) para usuarios con rol `ROTATOR`.
- [RotatorLeadQueue.tsx](../../everprop-public/src/components/admin/RotatorLeadQueue.tsx): Se agregó enlace directo a "Ver ficha" (`/admin/leads/${lead.id}`).
- [LeadDetailView.tsx](../../everprop-public/src/components/admin/LeadDetailView.tsx):
  - Se incorporó la visualización de presupuesto y prioridad en la tarjeta de resumen.
  - Se extendió el permiso de cambio de asesor (`canAssign`) para incluir a rotadores.
  - Se mantuvieron ocultos los acuerdos de financiación de cobranzas para rotadores.
- [admin-sample.ts](../../everprop-public/src/data/admin-sample.ts) y [everprop-api.ts](../../everprop-public/src/lib/everprop-api.ts): Se agregaron y mapearon los campos `budget`, `currency`, `priority` y metadatos de unidades/proyectos.
- [leads-api.test.mjs](../../everprop-public/tests/leads-api.test.mjs): Se agregó prueba automatizada verificando la creación de lead con `property_id` y el mapeo completo de atributos comerciales.

## 3. Por qué esta solución

- **Alineación con decisión del cliente:** El cliente requirió de forma explícita que este rol temporal cuente con capacidades comerciales completas para no frenar la operativa diaria.
- **Principio Ponytail (lazy senior dev):** Mínimo diff efectivo reutilizando la infraestructura existente de `LeadAccessPolicy` y los componentes de UI actuales, sin inventar nuevos roles ni duplicar formularios.
- **Techo y deuda técnica:** Todas las flexibilizaciones fueron marcadas con comentarios `ponytail:` indicando que se trata de una concesión provisoria que deberá revocarse al formalizar los roles comerciales definitivos.

## 4. Cómo se verificó

| Comprobación | Resultado |
|---|---|
| `php -l` (sintaxis PHP en controladores y policies) | OK (0 errores) |
| `npx tsc --noEmit` (TypeScript en panel web) | OK (0 errores) |
| `node --test tests/leads-api.test.mjs` | OK (3/3 tests pasados) |
| Aislamiento de módulos | Confirmado: rotador no tiene acceso a `/admin/users` ni `/admin/installments` |

## 5. Pendientes y riesgos

- El rol `ROTATOR` tiene permisos provisorios de escritura sobre datos de leads e intereses de catálogo en su tenant. Cuando el cliente defina la separación estricta entre mesa de entradas y asesores, estas flexibilizaciones deberán revertirse según los comentarios `ponytail:`.
