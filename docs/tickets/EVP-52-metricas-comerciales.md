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
- `everprop-api/tests/Feature/CRM/CommercialStatisticsTest.php`: cuatro pruebas MySQL, 49 aserciones.
- Capturas en `docs/tickets/evidence/EVP-52/`, con datos de demostración de la base local.

Sin nuevas dependencias, variables ni scripts de esquema. Para ejecutar develop actualizado se requieren sus forward existentes: localmente se aplicaron los pendientes EVP-50 y collection-email-kind a la base de pruebas; EVP-50 también a la base local. No hubo conexión ni migración sobre producción.

## 3. Por qué esta solución
Se reutilizan apiFetch, sesión, componentes Button, diseño corporativo y policy CRM. No se usa el widget anterior que calculaba estadísticas desde listas de leads del cliente sin filtrar correctamente por mes.

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
- `php artisan test --filter=CommercialStatisticsTest`: 4 pasan, 49 aserciones. Incluye bordes UTC/Argentina, cierres de leads anteriores al período, cierre sin fecha, medias ponderadas y envío demorado, bots/pendientes/fallidos excluidos, reapertura, creación en WON, fechas preservadas, filtros, rol gerente, roles denegados y tenant ajeno.
- `php artisan test --no-coverage`: **428 pasan, 1 omitida, 2632 aserciones**. Primer intento detectó un forward previo ausente en la base local de tests; se aplicó el script existente y se volvió a ejecutar toda la suite.
- `vendor/bin/pint --test`: 311 archivos, pasa.
- `vendor/bin/phpstan analyse --no-progress --memory-limit=1G`: sin errores. El intento con límite predeterminado 256M agotó memoria; no era un error del código.
- `npm run lint`: 0 errores, 152 advertencias preexistentes; build correcto.
- Pruebas JS existentes de conversaciones, seguimiento, cobranzas y materiales: 23/23 pasan.
- Revisión independiente `tenant-isolation-reviewer`: tres observaciones corregidas (fecha efectiva de envío, ROTATOR y usuarios dados de baja). Revisión final sin bloqueantes ni nuevos hallazgos; repitió las cuatro pruebas MySQL.
- Navegador con API y sesión local: vista mensual y filtro de asesor correctos; Hoy sin muestra devuelve tasas/tiempos “Sin datos”. Vista estrecha y tema oscuro inspeccionados; tabla conserva desplazamiento horizontal propio.
- Reconciliación SQL independiente del mes local: 13 leads (5 NEW + 2 CONTACTED + 1 QUALIFIED + 2 VISIT_SCHEDULED + 2 NEGOTIATION + 1 WON). Conversión 1/13=7,69%; cierre 1/(1+0)=100%; un WON sin fecha y cero cierres fechados. El panel expone esa diferencia y no adjudica fecha inventada.

CI remoto se registra en el PR; su estado final debe comprobarse sobre el SHA publicado.

## 5. Pendientes y riesgos
Revisión humana de Mauro y Ramiro antes del merge a develop. No merge, despliegue ni cambios en producción.

La calidad histórica depende de las fechas existentes. Reasignaciones modifican la comparativa; resolución no reconstruye ciclos pasados. No se verificó contra producción, carga de gran volumen ni lector de pantalla; no se afirma validación en dispositivo móvil físico. La consulta transmite solo agregados e identificadores/nombres del equipo al usuario autorizado.
