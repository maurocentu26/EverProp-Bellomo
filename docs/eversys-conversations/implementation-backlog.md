# Backlog ejecutable — Eversys Conversations

Fecha 2026-09-29. Todos los ítems están **pendientes**, ninguno implementado por esta investigación. Piloto requerido por Alvaro: web+WhatsApp, techo operativo USD 150/mes. Cuota 500 conversaciones es propuesta económica inicial, no demanda observada ni aprobación comercial. No ejecutar producción bajo este documento sin autorización de la fase correspondiente.

## Estimación y capacidad

Rangos en jornadas-persona de 6h efectivas, incluyendo desarrollo y revisión de la tarea, no esperas de proveedores. Suma aritmética: **57–106 jornadas-persona (342–636h)** para el alcance técnico listado. No es una fecha de entrega. Supone experiencia en Laravel/Next/MySQL, acceso futuro a entornos autorizados, scope acotado, sin reescritura ni contratos/calendarios complejos. Fallos adicionales en EverProp y cambios Meta pueden ampliar rango. Capacidad del equipo y presupuesto de construcción no informados. Un desarrollador no puede realizar tres tracks simultáneos; dos desarrolladores y QA parcial tampoco eliminan dependencias.

Costo de construcción = horas efectivas × tarifa acordada; USD 150 mensuales es operación, no este esfuerzo. Rangos comerciales/onboarding8–16h por cliente van aparte; no sumar días de calendario de aprobación Meta como trabajo efectivo. Estimaciones requieren refinamiento después del primer incremento.

## A. Correcciones y base EverProp — 10–19 jornadas

| ID | Responsable | Depende | Trabajo y criterio de aceptación | Prueba / evidencia | Jornadas |
|---|---|---|---|---|---:|
| E01 | Backend + seguridad | — | Uniformar permisos de precio/publicación/proyecto en store/update/batch; no USD implícito sin decisión de fuente | Negativos por capacidad/tenant/proyecto; price0/null/corner_price; asesor editor sin publish no publica | 2–4 |
| E02 | Backend CRM | E01 | Evitar precio oculto en CRM y nuevas relaciones con activos retirados/eliminados; public DTO explícito | Lista/ficha/interés por rol; PDF y API no filtran campos | 2–4 |
| E03 | Backend + datos | E01 | Identidad de batch: idempotencia o conflicto controlado, no sufijo aleatorio que oculte duplicado | Legacy nulo/no nulo, mismo lote concurrente, rollback sin500 | 2–4 |
| E04 | Backend/QA | E02 | Endurecer visitas existentes; separar solicitud de confirmación; códigos exactos y moneda desconocida | API E2E actual y replay; 12/12A/12B; REQUESTED no se presenta confirmado | 2–4 |
| E05 | DevOps/QA | — | CI monorepo en raíz y perfil de ejecución único; fijar gates actuales sin reutilizar cifras históricas | Lint/TS/build y PHP8.4+MySQL aislado; workflow descubierto tras autorización remota; revisar deuda PHPStan | 2–3 |

E01–E04 se basan en inspección estática actual, no explotación sobre datos reales. E05 no presupone que todos los warnings/lint históricos sigan iguales; medir y corregir bloqueantes del cambio. Backlog de propiedades de Alvaro aún no aportado íntegro: incorporarlo como alcance separado, sin afirmar que estos cinco ítems lo completan.

## B. Capacidades SaaS nuevas — 39–73 jornadas

| ID | Responsable | Depende | Trabajo y aceptación | Prueba / evidencia | Jornadas |
|---|---|---|---|---|---:|
| S01 | Arquitectura/backend | E05 | Reconciliar esquema existente y definir forwards; dominios/contracts sin duplicar conversaciones ni RBAC | Preflight schema en copia aislada, ADR y compatibilidad migración/app anterior | 2–4 |
| S02 | Backend/seguridad | S01 | Tenant/config/entitlements, soporte temporal; quitar dependencia Bellomo hardcodeada | Segundo tenant por mismas rutas, revocación de soporte y host mismatch | 2–4 |
| S03 | Backend | S02 | Runtime durable inbox/turnos/outbox/recovery sobre tablas existentes | Crash después de receipt antes queue; 20 replays/estados fuera de orden | 3–5 |
| S04 | Frontend/UX | S03 | Bandeja común: asignación/no leídos/filtros/notas/composer/errores/móvil | Dos asesores, roles negativos, teclado/foco, recarga sin pérdida | 3–6 |
| S05 | Frontend/backend | S03 | Widget web y sesión visitante limitada, antiabuso y eventos durables | ID ajeno, replay, reconexión, orígenes y mensajes rápidos | 2–4 |
| S06 | Integraciones | S03, X01 | Conector WhatsApp oficial, normalización, firma nativa, envío/estado, revocación | Sandbox autorizado; cuentas/tenant separadas, política ventana/plantilla y callback repetido | 3–5 |
| S07 | Backend/seguridad | S03,S04 | Handoff serializado, epoch, envío en vuelo, UNKNOWN_FINAL manual | Barreras instrumentadas: pausa worker antes POST, takeover/retry simultáneos, sin bloqueo infinito | 2–4 |
| S08 | Backend/FinOps | S02,S03 | Ledger reserve/commit/release, tarifas/versiones, cuota global y tenant | Web+WA agotan saldo concurrentemente; UNKNOWN retiene reserva; inbox sigue operativo | 2–4 |
| S09 | Datos/AI engineer | S02 | Ingestión aprobada y FULLTEXT+alias/citas; cuarentena, vigencia y borrado | Chunk ACL, documento revocado y SQL exacto códigos; recall@10 | 3–5 |
| S10 | AI engineer | S07,S08,S09 | Coordinador acotado, adapter proveedor, schema outputs, versiones y circuit breaker | Dos llamadas normales+retry, límites20s/8k/600, abstención, gasto e inyección | 3–5 |
| S11 | Backend/AI engineer | E01,E02,S10 | buscar/consultar propiedades para actor visitante y asesor | Campos API/código/precio/scopes; no endpoint admin ni SQL LLM | 2–4 |
| S12 | Backend CRM | E02,S11 | registrar_interes y derivar_a_asesor con efectos persistidos/idempotentes | Timeout tras commit, doble herramienta, contacto no verificado y asignación fallida | 2–4 |
| S13 | Backend/producto | E04,S12 | solicitar_visita REQUESTED y workflow de confirmación humana | Persistencia, TZ, duplicados, no confirmar sin asesor; calendario externo fuera MVP | 2–4 |
| S14 | Backend/datos | S02,S09 | Onboarding/offboarding/export/borrado, branding configurable | Segundo tenant sin fork, manifiesto eliminación y restore con tombstones | 2–4 |
| S15 | SRE | S03,S08 | Hosting dimensionado, backups/logs, restore, métricas/costos/alertas | Carga piloto, fallo Redis y restore completo medido; caber USD 150 con reservas | 2–4 |
| S16 | Producto/QA | S04,S12 | Definiciones KPI, tablero mínimo, revisión humana, atribución | Cohorte con outcomes comerciales y exclusiones; no sumar solicitud como visita confirmada | 2–3 |
| S17 | Integraciones/QA | S05,S06,S07,S12,S13 | Paridad web/WhatsApp con contacto/estado/adjuntos permitidos | Ambos canales reales autorizados; ningún simulador cuenta como cumplimiento de WhatsApp | 2–4 |

## C. Validación de salida — 8–14 jornadas

| ID | Responsable | Depende | Trabajo y aceptación | Evidencia | Jornadas |
|---|---|---|---|---|---:|
| Q01 | QA + Bellomo | S09,S11,S13 | Dataset200 casos, eval ciega y rúbrica dual | Reporte por segmento y casos críticos; no ocultar errores en promedio | 3–5 |
| Q02 | Seguridad/QA independiente | S07,S08,S14,S17 | Aislamiento extremo a extremo, race entrega, pruebas costo/roles/abuso | Cero fugas/escrituras indebidas/efectos duplicados en suite; gaps documentados | 3–5 |
| Q03 | SRE/Tech Lead | E05,S15,S16,Q01,Q02,X02,X03,X04 | Ensayo sombra, rollback y piloto limitado ambos canales | Smoke real autorizado, gastos comprobados, runbook, responsables y aprobación | 2–4 |

## Dependencias externas y decisiones sin fecha inventada

| ID | Dueño | Condición de cierre | Efecto si falta |
|---|---|---|---|
| X01 | Alvaro + Integraciones | Titularidad/acceso Meta, onboarding/API version/permisos/review, tarifas y coexistencia si necesaria; documentación oficial recuperada | Bloquea activar WhatsApp; solo se construye adaptador/simulador, piloto ambos no aceptado |
| X02 | Alvaro + responsable de datos | Fuentes públicas aprobadas, moneda/campos divulgables, agenda/asesor/horarios, aviso y tratamiento de datos | Demostración sintética únicamente |
| X03 | Alvaro + responsable técnico | Equipo y financiación de construcción; región/proveedor/condiciones de datos; facturación canal dentro sobre | No se contrata ni publica; USD 150 no financia por sí mismo el backlog |
| X04 | Alvaro | Autorización concreta para conectar, enviar pruebas reales y desplegar cuando paquete esté listo | Preparar todo local; no enviar/contratar/migrar por inferencia |

## Secuencia de trabajo

G0: E05 + S01/S02 y verificación X01 paralela a correcciones E01–E04. G1: S03/S05 y S06 simulado → S07/S08. G2: S09/S10/S11/S12, con S04 en paralelo sobre contratos estables. G3: S13/S14/S15/S16/S17 → Q01/Q02 → Q03. Respetar dependencias de tabla si hay ambigüedad; este orden no implica que S06 real se ejecute antes de X01.

Primer corte demostrable: dos tenants sintéticos, receipt y mensajes durables, web y webhook WhatsApp simulado, lectura exacta por API y handoff con registro de gasto. Después E2E WhatsApp oficial bajo autorización. La primera demo no acredita piloto, RAG completo, ni SaaS comercial.

## Definition of Done por tarea

Código revisado por otro especialista para cambios de permisos/estado; pruebas proporcionadas al riesgo; documentación actualizada; migraciones probadas en copia aislada; decisiones conocidas versionadas; métricas y errores sin secretos. Ejecución de pruebas registra commit, entorno, datos y fecha. No marcar verificada por generar código, por tener tabla o por healthcheck. Gates globales en evaluation-and-security.md prevalecen; cualquier fuga impide release aunque cupo/costo sean buenos.

## Después del piloto, fuera de estimación

Vectores/reranking contextual si mejora medida; segundo cliente real con onboarding administrado; autoservicio y pasarela; Instagram/Messenger; calendario externo; voz; campañas consentidas; otras verticales; despliegue dedicado contractual. Cada ampliación requiere fuentes/costos/amenazas/aceptación propios. No vender estas capacidades como existentes.

## Registro de esta fase de diseño

Principal: inspección stack y runtime Integrations/visitas, AI/RAG, arquitectura, producto, ADR, economía y backlog. Agente market_design: benchmark/licencias y revisión aritmética económica. Agente backend_design: inspección actual de esquema/policies, contratos y revisión AI/QA. Agente security_design: canales/amenazas/SRE/gates y revisión independiente handoff/aislamiento. Se ejecutó investigación web y lectura estática, no suite nueva ni conexiones, migraciones, mensajes, contratación o deploy. Las revisiones detectaron y corrigieron contradicciones de canal inicial, retención, límites, costos y garantía de entrega externa.
