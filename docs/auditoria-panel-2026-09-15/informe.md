# Auditoría técnica del panel — 15 de septiembre de 2026

Base revisada: `codex/mejoras-panel`, commit `cb95141`. Referencia del martes: `eeeefcc` (8 de septiembre). Esta entrega es un diagnóstico: no modifica reglas comerciales ni corrige silenciosamente el producto.

## Resultado

Se observaron **4 comportamientos problemáticos de API en pruebas de integración y 3 comportamientos de frontend en pruebas aisladas**. Estos últimos no son tres recorridos completos reproducidos en navegador. Hay además tres hallazgos de código y dos riesgos que requieren validación específica. El panel compila y la suite existente pasa, pero eso no cubría los casos nuevos.

El registro [archivos.md](archivos.md) enumera 358 archivos: 57 tienen lectura de flujo o fragmentos relevantes además de controles estáticos; el resto recibió controles automáticos o de metadatos. **No se hizo lectura manual exhaustiva de los 358 archivos.** «Sin hallazgo específico» no equivale a ausencia demostrada de defectos ni a certificación de cada interacción visual en todas las combinaciones de dispositivos y perfiles.

### Reconsideración de certeza e impacto

- A01/A02: la divergencia entre endpoints está demostrada con los mismos permisos del usuario. Su alcance depende de que existan cuentas con esas restricciones; no demuestra exposición de todos los usuarios ni entre tenants. La intención comercial de las cotizaciones en CRM debe contrastarse antes de cambiar ese flujo.
- A03: está demostrada la aceptación de una nueva vinculación a un activo eliminado. El estado HTTP correcto podría ser 404 o 422 según el contrato; la prueba eligió 404. No se demostró que la interfaz ofrezca seleccionar ese activo.
- A04: el 500 es real mediante petición directa. No se identificó un botón de borrado de lead que lo invoque; se reduce su prioridad a P3.
- A05: la etapa principal sí se guarda en la simulación. Lo incorrecto es actualizar también el interés local pese a que su guardado falló; no es un caso de «no se guardó nada».
- A06: compartir un rol de presentación no constituye por sí solo un fallo de seguridad. El problema se sostiene al cruzarlo con el cockpit, que ofrece controles de gestión sin comprobar solo lectura. El backend sigue rechazando escrituras y otras pantallas sí usan `canWrite`. Falta reproducir el recorrido con ese perfil en navegador.
- A07: la excepción se reproduce al bloquear el almacenamiento simulado. Es un caso condicionado a esa restricción, no un fallo del login en condiciones normales.
- A08–A10 y R01/R02 no tienen el mismo grado de evidencia que las cuatro pruebas de API. No se deben presentar como errores observados en producción.

## Comprobaciones ejecutadas

| Control | Resultado |
|---|---|
| Suite existente Laravel, PHP 8.4 / MySQL | 79 pruebas aprobadas, 401 aserciones |
| Suite existente frontend | 41 pruebas aprobadas |
| TypeScript `tsc --noEmit` | Aprobado |
| Next `npm run build` | Aprobado; generación de 22 páginas completada |
| ESLint | 181 archivos, 0 errores y 137 advertencias |
| PHPStan nivel configurado | 55 incidencias en 15 archivos; control no aprobado |
| Parseo PHP, sin ejecutar su contenido | 170 archivos, 0 errores de sintaxis |
| Reproducciones nuevas de backend | 4 expectativas de seguridad fallan: A01–A04 |
| Reproducciones nuevas de frontend | 3 expectativas funcionales fallan: A05–A07 |

Las reproducciones fallidas son evidencia del problema, no pruebas aprobadas. Están fuera de la suite regular para que este diagnóstico no cambie sus resultados. Los fixtures del backend se ejecutaron dentro de transacciones con reversión y verifican que el entorno sea `testing` y la base tenga `test` en su nombre.

## Hallazgos prioritarios

### A01 · P1 · El CRM revela precios que Inventario oculta

**Archivo:** `everprop-api/app/Domain/CRM/Http/Controllers/AdminLeadController.php`, líneas 97 y 377–408.

**Reproducción:** un asesor con `can_view_prices=false` consulta la propiedad: el endpoint de inventario omite el precio. Vincula esa misma propiedad a su propio lead y consulta la ficha: recibe `price: 123456`. La propiedad y el usuario pertenecen al mismo tenant; esto demuestra una inconsistencia de permisos, no una fuga entre empresas.

**Causa:** los joins de CRM devuelven `properties.price` sin aplicar `InventoryAccess` ni la visibilidad de precios. La prueba confirma la ficha individual; la lista usa el mismo patrón de selección.

**Corrección recomendada:** reutilizar la autorización y serialización de inventario al resolver intereses comerciales. Comprobar también la visibilidad del activo antes de vincularlo. Cubrir los casos de precio oculto, proyecto fuera de alcance y tenant distinto.

**Historia:** la selección de precio ya estaba antes del martes (líneas originadas el 6 de septiembre).

### A02 · P1 · Generación masiva permite fijar precios sin permiso

**Archivo:** `everprop-api/app/Domain/Inventory/Http/Controllers/AdminPropertyController.php`, líneas 70–101.

**Reproducción:** con permiso para gestionar inventario y `can_manage_prices=false`, el alta individual con precio devuelve **403**. La generación de un lote con precio devuelve **201**.

**Causa:** `store()` verifica `setInitialPrices()`; `batchGenerate()` solo verifica `create()`. El proyecto se limita al tenant, pero no se observa una comprobación equivalente del alcance del proyecto en ese método.

**Corrección recomendada:** aplicar la misma política a `price` y `corner_price`, incluso si valen cero, y verificar el alcance del proyecto antes de abrir la transacción. La prueba ejecutada demuestra el bypass de precio; el alcance del proyecto es una comprobación adicional recomendada.

**Historia:** el método ya estaba antes del martes y no cambió entre `eeeefcc` y `cb95141`.

### A03 · P2 · Puede vincularse una propiedad eliminada

**Archivo:** `everprop-api/app/Domain/CRM/Http/Controllers/AdminLeadController.php`, líneas 611–620; revisar también el alta inicial de interés, líneas 248–258.

**Reproducción:** se marca `deleted_at` en una propiedad del tenant. Vincularla mediante su UUID a un lead devuelve **200**, cuando debería rechazar el activo no disponible para nuevas vinculaciones.

**Causa:** consulta con `DB::table()` sin filtro de eliminación lógica. No se aplica automáticamente el scope del modelo Eloquent.

**Corrección recomendada:** excluir eliminados para nuevas relaciones y aplicar permisos. Mantener por separado la visualización histórica de intereses existentes, si el negocio la necesita; no borrar el historial.

**Historia:** consulta presente desde el 7 de septiembre.

### A04 · P3 · Ruta de borrado de lead sin implementación

**Archivo:** `everprop-api/routes/api.php`, línea 59; `AdminLeadController.php`.

**Reproducción:** `DELETE /api/v1/admin/leads/{id}` devuelve **500** porque `destroy()` no existe.

**Corrección recomendada:** limitar `apiResource` a los métodos implementados. No agregar una nueva función de borrado: no hace falta inventar ese flujo para corregir la ruta expuesta.

**Historia:** declaración de ruta anterior al martes.

### A05 · P2 · Se anuncia éxito aunque falle parte del guardado

**Archivo:** `everprop-public/src/components/admin/advisor/AdvisorCockpit.tsx`, líneas 267–325.

**Reproducción aislada:** la actualización de etapa responde bien y el PATCH del interés falla. La función muestra el toast de éxito y actualiza localmente los intereses.

**Causa:** el `.catch()` del PATCH secundario consume el error dentro de `Promise.all`. Además, dos solicitudes independientes no constituyen una transacción.

**Corrección recomendada:** persistir el conjunto mediante una operación transaccional cuando deba ser atómico. Mientras tanto, no silenciar el fallo ni afirmar que se guardó todo; recargar el estado real ante un resultado parcial. No confundir esto con obligar a crear una cita al cambiar la etapa.

**Historia:** el bloque que consume el error existe desde el 7 de septiembre.

### A06 · P2 · Solo lectura se convierte visualmente en asesor

**Archivos:** `everprop-public/src/lib/everprop-api.ts`, línea 145; `src/hooks/use-current-session.ts`, líneas 20–27.

**Reproducción aislada:** `mapRole('READ_ONLY')` devuelve `ADVISOR`; el hook deriva `isAdvisor=true`. Algunas pantallas consultan el rol API y otras estas banderas, lo que produce permisos visuales inconsistentes.

**Impacto:** controles de gestión pueden aparecer para un usuario que luego recibe 403. No demuestra que el backend permita escribir: las pruebas existentes de solo lectura sí rechazan escrituras.

**Corrección recomendada:** representar explícitamente solo lectura y utilizar capacidades uniformes para mostrar acciones. Mantener la validación del servidor.

**Historia:** el fallback a asesor es anterior al martes.

### A07 · P2 · El ingreso depende innecesariamente de localStorage

**Archivo:** `everprop-public/src/lib/auth-context.tsx`, líneas 41, 65–68, 91 y 97.

**Reproducción aislada:** la API autentica correctamente, pero `localStorage.removeItem()` lanza una excepción. `login()` termina rechazado antes de establecer el usuario.

**Impacto:** navegadores o políticas que bloqueen almacenamiento pueden impedir el ingreso aunque Sanctum haya creado la sesión. Restauración y salida contienen accesos similares; esos caminos se identificaron por lectura, no por una prueba nueva independiente.

**Corrección recomendada:** hacer tolerante a fallos la limpieza de datos demo; el estado de la sesión real no debe depender de ella.

**Historia:** este bloque no cambió desde el martes.

## Hallazgos confirmados por lectura del código

### A08 · P2 · Etiquetas de formularios sin asociación accesible

**Archivos:** `src/components/admin/LeadFinancingAgreements.tsx`, líneas 421–458 y 506–526; `src/components/admin/LeadKanban.tsx`, líneas 199–205, dentro de `everprop-public`.

Hay etiquetas visibles hermanas de inputs/selects sin `htmlFor`/`id`, sin envolver el control y sin nombre ARIA. Ejemplos: Monto cobrado, Método de pago y Proyecto. El texto visible no queda asociado programáticamente al control.

**Corrección:** asociar etiquetas y controles con identificadores únicos. El barrido AST produjo candidatos adicionales; no se cuentan todos como defectos porque varios usan correctamente `<label><input /></label>` o reciben atributos mediante props.

### A09 · P2 · Cada consulta de novedades recorre todo el historial

**Archivos:** `everprop-api/app/Domain/Identity/Http/Controllers/AdminNotificationController.php`, línea 60; `everprop-public/src/components/admin/AdminNavbar.tsx`, líneas 93–98.

El frontend consulta cada dos segundos. El endpoint obtiene todas las filas de notificaciones del usuario para calcular un hash, incluso cuando no hay novedades. El costo crece con el historial y con las pestañas conectadas.

**Corrección:** mantener una revisión incremental o un agregado que cambie con las operaciones relevantes, y medir el costo con un historial grande. Esto es un hallazgo de complejidad por código; no se realizó una prueba de carga ni se afirma lentitud actual con pocos registros.

### A10 · P2 · La matriz pierde letras del identificador de unidad

**Archivo:** `everprop-public/src/components/admin/InventoryMatrix.tsx`, línea 88.

Se renderiza `unitNumber.replace(/\D/g, '')`: `12A` y `12B` se muestran ambos como `12`. El título accesible conserva más información, pero el texto principal deja de distinguir unidades alfanuméricas. Además, el botón tiene ancho y alto fijos de 40 px, por lo que identificadores largos requieren un tratamiento explícito.

**Corrección:** conservar el identificador real y permitir ancho mínimo adaptable. No se ha demostrado que el inventario actual contenga esos dos códigos; el defecto aparece si se registran unidades de ese tipo.

## Riesgos separados de los fallos reproducidos

- **R01 — Instalación parcialmente aplicada.** `scripts/apply-visit-extension.php` considera lista la extensión si existen cuatro columnas; no verifica todos los índices, FK ni el backfill. El SQL hace DDL antes del UPDATE y exige unicidad de `follow_up_id`. Si falla la carga histórica después del DDL, reintentar puede anunciar que está listo sin completarla. La prueba existente verifica repetición sobre una base ya extendida; no prueba cada estado de interrupción. Validar recuperación sobre una copia con duplicados históricos antes de una instalación real.
- **R02 — Push tras cierre de sesión con limpieza incompleta.** El frontend intenta quitar la suscripción, pero permite timeout. El logout del servidor invalida la sesión y no revoca una suscripción específica; el job entrega por usuario activo. Revisar este caso con dos sesiones/dispositivos y un service worker bloqueado. No eliminar indiscriminadamente las suscripciones de todos los dispositivos al cerrar una sesión. No está reproducido en un teléfono real.

## Estado por módulo

| Módulo | Evaluación y evidencia |
|---|---|
| Autenticación / perfiles | Cookies y aislamiento de sesión cubiertos por suite. A06 y A07 pendientes de corrección. |
| Tenancy / autorización | Consultas y pruebas negativas entre empresas. A01/A02 muestran divergencias entre permisos de módulos dentro del tenant. |
| Cockpit / semáforo | Cálculo compartido, límites de fecha y notas internas cubiertos por tests. A05 en guardado parcial. No se cambian las cuatro tarjetas ni el vínculo entre etapa y cita. |
| Leads / intereses | Asignación, disciplina y paginación cubiertas; A01, A03 y A04 requieren corrección. |
| Agenda / seguimientos | Pruebas de crear, cancelar, reasignar y contar citas del día pasan. R01 en recuperación de instalación. |
| Inventario / desarrollos | A02 y A10. Aislamiento tenant y recurso público cubiertos por pruebas existentes. |
| Cobranzas | Pagos parciales, idempotencia, saldo, reversión y permisos cubiertos por suite; A08 en formularios. |
| Notificaciones | Destinatario, lectura, reintentos y URLs cubiertos. A09 y R02; recepción con app cerrada sigue necesitando dispositivo/configuración real. |
| Materiales / recursos | Suite verifica procedencia, identificadores, archivos existentes y acceso por perfil/proyecto. |
| Componentes / temas | Compilación y análisis AST/CSS. A08 y A10; no se certifica una matriz visual completa con solo estas herramientas. |
| Scripts / esquema / configuración | 170 PHP parseados y checks de instalación existentes. R01; baseline SQL conservado sin cambios. |

## Deuda técnica y archivos sin referencias

PHPStan reporta 55 incidencias: entre ellas inferencia de enums Eloquent, propiedades dinámicas de recursos, tipos de colecciones, arrays sin tipos y PHPDoc incorrecto. Deben revisarse; no es válido transformarlas automáticamente en «55 errores de seguridad». Resultados completos en [phpstan.json](phpstan.json).

ESLint reporta 137 advertencias y ningún error. Detalle por archivo y línea en [eslint.json](eslint.json).

El grafo estático encuentra **19 archivos TS/TSX sin camino desde las entradas Next actuales**, entre ellos `src/App.tsx`, `NewLeadDrawer.tsx`, el layout React Router y componentes públicos heredados. Son candidatos a limpieza, no autorización automática para borrar: comprobar importaciones dinámicas, herramientas y usos externos. No se eliminó ninguno. El detalle está en [frontend-source-review.json](frontend-source-review.json).

## Reproducción de los hallazgos

Desde `everprop-api`, con el contenedor PHP y la base de tests preparados:

```text
php vendor/bin/phpunit docs/audit/PanelAuditTest.php --colors=never
```

Desde `everprop-public`:

```text
node --test docs/audit/frontend-audit.cjs
```

Los siete casos expresan el comportamiento esperado y actualmente fallan. Al corregirlos deben integrarse a la suite regular, conservando los controles de datos de prueba.

## Alcance y cierre

Se analizaron archivos propios de aplicación/configuración, el grafo del frontend, scripts y pruebas PHP. No se auditó internamente código de terceros en `node_modules`/`vendor`, no se abrieron credenciales, no se reimportó el baseline ni se probó carga de producción. Tampoco se ejecutó una revisión nueva de cada pantalla en cada tema, perfil y dispositivo físico: eso es validación visual y de campo adicional, no algo que el parseo de archivos demuestre.

Los siete fallos reproducidos tienen el código causal presente en la referencia del martes; la atribución se comprobó con `git blame`/diff, **sin ejecutar de nuevo aquella versión**. La revisión no justifica decir que el proyecto está perfecto ni que todas las mejoras anteriores introdujeron fallos.

Entrega de esta auditoría: informe, registro por archivo, resultados estáticos y reproducciones. **No se modificó código productivo, no se hizo push y no se cambió la lógica comercial.** Prioridad siguiente: A01/A02, luego A03–A07 y A08–A10; resolver los riesgos antes de certificar instalación y Push en destino.
