# EVP-41 — Restaurar acceso comercial del rotador

Rama `ticket/EVP-41-acceso-comercial-rotador` · base `origin/develop` (`9dff877`) · fecha 2026-10-17 · autor Codex con Mauro Centurión. El usuario autorizó trabajo en paralelo a EVP-40 y posteriormente commit/push para publicar el fix. Sin autorización de merge ni deploy.

Jira: [EVP-41](https://eversys.atlassian.net/browse/EVP-41), asignado a Mauro, En curso.

## 1. Qué pedía el ticket

El rotador debe poder ver la información comercial tanto al crear un lead como al abrir su ficha: etapa, prioridad, presupuesto/moneda, notas, asesor, proyecto e inmueble de interés. Se requieren tests y prueba real en navegador, conservando aislamiento entre empresas y restricciones administrativas.

La exclusión de proyectos estaba presente en `main` (`6f2802f`) y en desarrollo. El comentario final de EVP-21 confirma que fue una restricción deliberada de aquella release; el informe local de EVP-21 describía permisos más amplios. EVP-41 registra el pedido actual y corrige el flujo sin reescribir ese antecedente.

Fuera de alcance: IA, cobranzas/acuerdos de pago, nuevos roles, escrituras de inventario, migraciones y datos reales.

## 2. Qué se implementó

- `everprop-api/app/Domain/Identity/RotatorRoleBoundary.php`: dos entradas en el permiso de lectura de catálogo, `GET /admin/projects` y `GET /admin/projects/*`. Se reutilizan `ProjectPolicy`, `InventoryAccess` y sus consultas explícitamente filtradas por tenant. No se habilita ninguna escritura nueva.
- `everprop-api/tests/Feature/CRM/RotatorTest.php`: lectura de catálogo y ficha con datos comerciales persistidos; proyectos y propiedades de dos tenants con código `12A`; detalle ajeno y selector de tenant manipulado rechazados; usuario pausado rechazado; POST/PUT/PATCH/DELETE/publicación bloqueados; precio y moneda conservan el permiso existente.
- `everprop-api/tests/Feature/Identity/UserProvisioningTest.php`: la cuenta rotadora activada puede leer proyectos, conservando POST de proyectos y administración prohibidos.

Causa: `loadEverpropCatalog()` consulta proyectos y propiedades mediante `Promise.all`. El 403 de proyectos rechazaba toda la carga de `NewLeadForm` y `LeadDetailView`, mostrando errores en lugar del formulario o la ficha. Con la lectura autorizada, los componentes existentes cargan sin modificaciones de frontend. También beneficia los consumidores hermanos de ese catálogo, incluida la edición del lead.

Sin cambios de esquema, proveedores, dependencias, precios, visibilidad configurada del inventario ni campos del contrato API.

## 3. Por qué esta solución

El formulario, ficha, datos comerciales y policies ya existían. El defecto compartido estaba en el límite de acceso del rol; agregar excepciones por pantalla o esconder errores habría dejado el catálogo incompleto. Solo se amplía GET de proyectos dentro del alcance autorizado por las policies existentes.

Se conserva `can_view_prices`: no se cambia su política ni los permisos de otros roles. Los usuarios creados por el alta administrativa reciben ese permiso según la lógica preexistente.

## 4. Cómo se verificó

Entorno: stack Docker local preexistente, PHP 8.4.24 y MySQL 8.4.11. PHPUnit usa `bellomo_crm_test` con transacciones; se generó `.env.testing` local ignorado, sin publicar secretos. No se importó ni modificó el baseline y no se levantó otro stack.

- Rojo previo: los tests de lectura de proyectos fallaron con 403 antes de las dos líneas de corrección.
- `docker exec everprop-api-php php artisan test --filter='RotatorTest|LeadInventoryGuardsTest|InventoryWriteGuardsTest|UserProvisioningTest'`: **21 tests, 187 assertions, PASS**.
- `node --test everprop-public/tests/leads-api.test.mjs`: **3 tests, PASS**.
- `docker exec everprop-api-php vendor/bin/pint --test app/Domain/Identity/RotatorRoleBoundary.php tests/Feature/CRM/RotatorTest.php tests/Feature/Identity/UserProvisioningTest.php`: **PASS**.
- `docker exec everprop-api-php vendor/bin/phpstan analyse --no-progress`: **sin errores**.
- `git diff --check`: **PASS**.
- Revisión independiente `tenant-isolation-reviewer`, incluyendo el diff final: **sin hallazgos**. Revisión LLM no aplica: no se modificó IA.

### Navegador real

Frontend de prueba desde el mismo HEAD, sin mocks, servido en `http://127.0.0.1:3002` y conectado directamente al backend local `127.0.0.1:18080`. Se usó una copia ignorada en `.qa/evp41`, reutilizando dependencias instaladas; no se tocó el frontend preexistente que apunta a un túnel. Se añadió temporalmente el origen local a Sanctum y se restauró al terminar.

Tenant sintético `qa-evp41`, usuarios rotador y asesor sintéticos, proyecto `QA EVP-41 Edificio` y unidad `12A` de USD 95.000. Sin cuentas ni datos de clientes reales.

Recorrido observado:

1. Login como rotador y apertura de Nuevo lead: formulario y catálogo cargados.
2. Carga de nombre y correo sintéticos, prioridad Alta, presupuesto USD 120.000, notas, asesor y departamento 12A.
3. Guardar lead desde la UI y abrir Ver ficha desde la cola del rotador.
4. Ficha muestra presupuesto, prioridad, asesor, notas, proyecto, activo, unidad y precio. Seguimientos y sección de visitas también cargan.
5. Recarga completa de la ficha: sesión y datos persistidos conservados.
6. Logs de nginx confirman HTTP 200 de proyectos, propiedades, lead, seguimientos y visitas durante la carga de la ficha.

Evidencia: [resumen comercial tras recargar](evidence/EVP-41/ficha-rotador.png) y [interés con proyecto, unidad y precio](evidence/EVP-41/intereses-rotador.png).

No se ejecutó build/lint de frontend porque no cambió su código; se compiló y ejercitó el frontend real en modo desarrollo. No se ejecutó la suite completa del backend.

## 5. Pendientes y riesgos

- Publicación de la rama de ticket autorizada. Para producción, preparar `hotfix/evp-41-acceso-comercial-rotador` desde `origin/main` y trasladar solo el commit de EVP-41. Nunca integrar la rama de ticket basada en develop directamente a main. Pendientes PR, revisión humana y merge; no se autoriza deploy.
- Hallazgo independiente de navegador: el rotador recibe una invitación a avisos push, pero `/admin/push/config` devuelve 403. Registrado como [EVP-42](https://eversys.atlassian.net/browse/EVP-42), Por hacer; no impide la gestión comercial y no se ampliaron esos permisos.
- Los acuerdos de pago/cobranzas siguen excluidos del rol. No se validaron sus operaciones.
- Los fixtures sintéticos quedan en la base local para reproducir; no se borraron bases, filas ni volúmenes. Se detuvo solamente el frontend de prueba iniciado por esta tarea; el stack preexistente permanece en ejecución.
