# EVP-52 — Panel de rendimiento comercial · Dirección

Rama `ticket/EVP-52-metricas-comerciales`, desde `develop` `dc96c3e`. Fecha 2026-10-20. Álvaro Ruggeri / Codex. Commit de implementación identificable en el historial del PR.

## 1. Qué pedía el ticket
Panel sobrio con cierres por período/asesor, conversión, tasa de cierre, promedio de respuesta/resolución y leads atendidos/activos/descartados. Filtros hoy, siete días, mes y rango personalizado; comparativa por asesor. El usuario eligió Dirección entre tres prototipos antes de implementar y autorizó commit, push y PR hacia develop para Mauro/Ramiro. No autorizó merge en esta entrega.

## 2. Qué se implementó
- `everprop-api/app/Domain/CRM/Http/Controllers/CommercialStatisticsController.php`: endpoint GET `/api/v1/admin/commercial-statistics`, agregados de base de datos sin truncar por paginación; filtros `from`, `to`, `advisor`. Tenant exclusivamente del contexto, rechazo de `tenant_id`, asesor ajeno 404 y rango máximo 366 días.
- `everprop-api/app/Domain/CRM/LeadAccessPolicy.php`: acceso a estadísticas para TENANT_ADMIN y SALES_MANAGER activos. Asesores, READ_ONLY y ROTATOR no acceden.
- `everprop-api/app/Domain/CRM/Http/Controllers/AdminLeadController.php`: registra won_at/lost_at en creación y transición a WON/LOST; conserva fecha al guardar la misma etapa; limpia al reabrir. No inventa fechas históricas ni modifica baseline.
- `everprop-api/routes/api.php`: ruta autenticada con límite de 30 solicitudes por minuto.
- `everprop-public/src/app/admin/estadisticas/page.tsx` y `src/lib/commercial-statistics-api.ts`: diseño Dirección con tarjetas, barras, cobertura, tabla y definiciones, fechas inclusivas de Argentina, carga/error/reintento, foco/etiquetas, tabla con desplazamiento local y colores para tema oscuro/claro. API real; no sustituye fallos con muestras ficticias.
- Navegación compartida: enlace Estadísticas visible según rol de API.
- `everprop-api/tests/Feature/CRM/CommercialStatisticsTest.php`: cinco pruebas MySQL, incluyendo creación/verificación de 1.500 registros sintéticos, idempotencia y ausencia de envíos.
- Capturas en `docs/tickets/evidence/EVP-52/`, con datos de demostración de la base local.

Ampliación solicitada tras revisar el diseño inicial:
- Tres vistas: **Resumen**, **Equipo** y **Atención**. Menos controles visibles por defecto, fechas personalizadas a demanda, cuatro indicadores prioritarios y detalle por tarea.
- `StatisticsCharts.tsx`: evolución temporal con selector leads/cierres; barras de asesores ordenadas con selector de métrica; seleccionar barra filtra el período o responsable a nivel global. Botones nativos y etiquetas completas; filtros activos y restablecer. Resumen evita una tabla de diez columnas; Equipo y Atención tienen tablas específicas.
- La API entrega serie diaria completa en Argentina y el cliente agrupa hasta siete días cuando hay más de 31 puntos, sin perder cantidades. `statistics-series.ts` tiene prueba sobre 0/1/7/31/32/90/366 días y ambas métricas, ejecutada también en Web quality.
- `SeedStatisticsDemo.php`: `php artisan everprop:statistics-demo --tenant=bellomo`. Solo MySQL de Docker local y bases locales permitidas. Agrega 1.500 leads y conversaciones sintéticos en una transacción; UUID determinísticos y bloqueo de tenant evitan duplicados. Usa asesores y propiedades existentes; no cambia cuentas, precios, disponibilidad ni envía mensajes. Integración y canal de simulación deshabilitados. No elimina filas.
- Aviso visible de base con datos de simulación (boolean tenant-scoped) y conteo de leads simulados dentro de la cohorte.

Sin nuevas dependencias, variables ni scripts de esquema. Para ejecutar develop actualizado se requieren sus forward existentes: localmente se aplicaron los pendientes EVP-50 y collection-email-kind a la base de pruebas; EVP-50 también a la base local. No hubo conexión ni migración sobre producción.

## 3. Por qué esta solución
Se reutilizan apiFetch, sesión, componentes Button, diseño corporativo y policy CRM. No se usa el widget anterior que calculaba estadísticas desde listas de leads del cliente sin filtrar correctamente por mes.

Investigación UX aplicada:
- [IBM Carbon — Dashboards](https://www.carbondesignsystem.com/building-blocks/data-visualization/dashboards): priorizar indicadores y revelar detalle según la tarea; gráficos vinculados para explorar. Aplicación: resumen con jerarquía y vistas de análisis separadas, sin agregar gráficos decorativos.
- [GitLab Pajamas — Dashboards](https://design.gitlab.com/patterns/dashboards/): distinguir filtros de dashboard y filtros de visualización. Aplicación: fecha/asesor globales; selector de métrica local con alcance explícito.
- [NN/g — User Intent Affects Filter Design](https://www.nngroup.com/articles/applying-filters/): preservar continuidad durante el filtrado. Aplicación: cambios simples inmediatos, filtros personalizados aplicados juntos, resultados anteriores atenuados durante carga, sin mover al usuario al inicio.
- Perfiles consultados: UI Designer, UX Researcher y Data Visualization Engineer. Barras desde cero, magnitudes por longitud, unidades/muestras visibles, cantidades no mezcladas con porcentajes en el mismo eje.

Auditoría de seeds:
- Existen `seed_bellomo_real_data.sql` y `seed_real_simulation_data.sql`, reutilizadas por `everprop:local-demo` para inventario original y una pequeña muestra CRM.
- La seed SQL antigua tiene borrados y desactiva claves foráneas; `db:setup-simulation` además reimporta baseline y no es apropiado para ampliar una base ya poblada. No se ejecutaron.
- Existe `everprop:inventory-import` con plan, backup, rehearse y verify para el Excel de 3.577 unidades/27 desarrollos. El Excel no está en esta carpeta; el usuario eligió expresamente conservar las 73 propiedades existentes. No se afirmó que la seed reducida equivalga al catálogo completo actualizado.

Contrato de métricas:
- **Cierres del período:** leads actualmente WON cuya won_at está en el intervalo. Es una venta comercial declarada, no contrato ni importe facturado. Los cierres históricos sin fecha se informan por separado sobre toda la cartera filtrada. Reabrir elimina ese cierre del recuento; no es un libro histórico de eventos.
- **Cohorte:** leads creados en el período, con estado actual: activos + ganados + descartados = ingresados. Conversión = ganados/ingresados; cierre = ganados/(ganados+descartados). Contactados = al menos un seguimiento comercial (no nota), independientemente del estado; puede solaparse con los estados.
- **Respuesta:** conversaciones cuya primera entrada ocurrió en el período; primer mensaje humano con estado SENT/DELIVERED/READ. Usa fecha efectiva COALESCE(sent_at, delivered_at, read_at, occurred_at), excluye fallidos, en cola, bots y respuestas anteriores a la entrada. La última fecha de fallback preserva medición de registros antiguos sin confirmación temporal separada.
- **Resolución:** esas conversaciones actualmente RESOLVED, desde primera entrada a closed_at; excluye abiertas/reabiertas. No representa cada ciclo histórico.
- Medias por conversación, calculadas con sumas/muestras globales; no media de medias por asesor. Minutos corridos. Denominadores cero producen null / “Sin datos”.
- Atribución al responsable **actual**, no al autor histórico de la venta/respuesta. Usuarios dados de baja conservan su fila identificada. Se excluyen leads eliminados.
- Días de Argentina convertidos a `[00:00 local, 00:00 del día siguiente)` en UTC. No usa updated_at para inventar cierres.

## 4. Cómo se verificó
Entorno local: PHP 8.4 en Docker, MySQL real en `bellomo_crm_test`, con fixtures sintéticos y transacciones; Node/Next 16.3.6.

- Prueba nueva primero falló 404 antes de implementar el endpoint.
- `php artisan test --filter=CommercialStatisticsTest`: 4 pasan, 51 aserciones (incluye la serie diaria). Incluye bordes UTC/Argentina, cierres de leads anteriores al período, cierre sin fecha, medias ponderadas y envío demorado, bots/pendientes/fallidos excluidos, reapertura, creación en WON, fechas preservadas, filtros, rol gerente, roles denegados y tenant ajeno.
- `php artisan test --no-coverage`: **428 pasan, 1 omitida, 2632 aserciones**. Primer intento detectó un forward previo ausente en la base local de tests; se aplicó el script existente y se volvió a ejecutar toda la suite.
- `vendor/bin/pint --test`: 311 archivos, pasa.
- `vendor/bin/phpstan analyse --no-progress --memory-limit=1G`: sin errores. El intento con límite predeterminado 256M agotó memoria; no era un error del código.
- `npm run lint`: 0 errores, 152 advertencias preexistentes; build correcto.
- Pruebas JS existentes de conversaciones, seguimiento, cobranzas y materiales: 23/23 pasan.
- Revisión independiente `tenant-isolation-reviewer`: tres observaciones corregidas (fecha efectiva de envío, ROTATOR y usuarios dados de baja). Revisión final sin bloqueantes ni nuevos hallazgos; repitió las cuatro pruebas MySQL.
- Navegador con API y sesión local: vista mensual y filtro de asesor correctos; Hoy sin muestra devuelve tasas/tiempos “Sin datos”. Vista estrecha y tema oscuro inspeccionados; tabla conserva desplazamiento horizontal propio.
- Reconciliación SQL independiente del mes local: 13 leads (5 NEW + 2 CONTACTED + 1 QUALIFIED + 2 VISIT_SCHEDULED + 2 NEGOTIATION + 1 WON). Conversión 1/13=7,69%; cierre 1/(1+0)=100%; un WON sin fecha y cero cierres fechados. El panel expone esa diferencia y no adjudica fecha inventada.

CI remoto se registra en el PR; su estado final debe comprobarse sobre el SHA publicado.

Verificación de la ampliación:
- Suite completa local final: 429 pruebas pasan, 2.657 aserciones y una evaluación de modelo externo omitida. Se ejecutó de nuevo tras incorporar el generador; los casos de seed comprueban cantidades, vínculos y que no haya correo, notificaciones ni jobs encolados.
- Pruebas focalizadas backend: 5/74 aserciones. Prueba de agrupación JS pasa; lint 0 errores/152 advertencias existentes; build y PHPStan correctos.
- Revisor independiente repitió backend y agrupación y validó consultas nuevas de la serie y aviso sin bloqueantes.
- SQL local independiente: simulados NEW=450, CONTACTED=225, VISIT_SCHEDULED=150, NEGOTIATION=225, WON=300, LOST=150. Conversaciones OPEN=1.050 y RESOLVED=450. Inventario después: 73 propiedades; conserva 13 leads anteriores, total 1.513.
- API reconciliada para julio-octubre: 1.513 leads = 1.062 activos + 301 ganados + 150 descartados; 300 cierres fechados, uno previo sin fecha. Serie suma 1.513 ingresos/300 cierres. 1.501 conversaciones, 1.201 respondidas, 450 resueltas.
- Cinco ejecuciones secuenciales locales del cálculo sobre 1.513 leads: 50,31/32,92/26,32/26,80/27,93 ms antes de añadir la consulta booleana de aviso. No es benchmark de concurrencia ni latencia de producción.
- Navegador: vistas, métrica temporal, rango elegido en barra, selección de asesor desde gráfico, quitar filtro y ausencia de muestra. Activación de vista y filtro de intervalo con Enter comprobada. Capturas `resumen-v2.png`, `equipo-v2.png`, `atencion-v2.png`. Se conserva la versión inicial como evidencia de evolución.

## 5. Pendientes y riesgos
Revisión humana de Mauro y Ramiro antes del merge a develop. No merge, despliegue ni cambios en producción.

La calidad histórica depende de las fechas existentes. Reasignaciones modifican la comparativa; resolución no reconstruye ciclos pasados. No se verificó contra producción, concurrencia elevada ni lector de pantalla; no se afirma validación en dispositivo móvil físico. La consulta transmite solo agregados e identificadores/nombres del equipo al usuario autorizado.
