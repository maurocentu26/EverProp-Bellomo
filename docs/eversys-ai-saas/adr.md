# Registro de decisiones de arquitectura

Fecha 2026-09-29. Estado de todas: propuestas técnicas para implementación posterior. D02 incorpora ambos canales y D03 incorpora el techo USD 150, restricciones expresas de Alvaro; la cuota 500 de D03 es propuesta del equipo, no aprobación del usuario ni consumo garantizado. No son cambios ejecutados. Fuentes/evidencia en research.md y data-and-contracts.md.

| ID | Decisión | Alternativa y tradeoff | Revisar cuando |
|---|---|---|---|
| D01 | Extender monolito modular EverProp; interfaces entre núcleo y vertical | Servicio separado añade identidad distribuida y operación; Chatwoot acelera bandeja pero integra otra plataforma/licencias | Equipo independiente, otra vertical real, contrato dedicado o profiling justifica extracción |
| D02 | Piloto exige web **y** WhatsApp | Web primero reduce dependencias pero no cumple prioridad del usuario; simulador es incremento, no aceptación | Solo si Alvaro cambia alcance; WhatsApp no oficial no es alternativa |
| D03 | Techo operativo USD 150, cuota piloto 500 conversaciones combinadas | Volumen ilimitado/voz/vector/reranker pago no respaldados por presupuesto | Volumen/benchmarks o presupuesto aprobado cambian |
| D04 | Núcleo horizontal + módulo inmobiliario + config Bellomo | Fork por cliente duplica mantenimiento y dispersa controles | Nuevo dominio requiere interfaz, no condicional por nombre |
| D05 | DB compartida tenant_id, FK compuestas, policies; modelo users.role_code/scopes existente | Base por tenant mejora aislamiento operacional pero multiplica migraciones/backups; RBAC paralelo prohibido por AGENTS | Requisito contractual de dedicación o escala demostrada |
| D06 | RAG léxico FULLTEXT/alias/ACL en piloto; API para datos vivos | Híbrido vectorial puede mejorar recall pero suma costo/operación; GraphRAG sin necesidad probada | Evaluación falla en grupos respondibles y opción cabe en costo; mantener abstención hasta resolver |
| D07 | Un coordinador y tools cerradas; sin framework obligatorio | Multiagentes runtime añaden pasos/latencia; agentes especialistas sí se usan en desarrollo | Evidencia de mejora en evaluación costo-calidad de tarea separable |
| D08 | Historial, resumen y preferencias separados/versionados | Memoria libre puede perpetuar errores e instrucciones hostiles | Cambian políticas de retención o aparecen casos de negocio claros |
| D09 | Actor visitante limitado, nunca endpoint admin delegado al LLM | Token admin simplifica demo pero expone inventario/PII y operaciones | No se relaja; cada herramienta nueva debe acreditar permiso mínimo |
| D10 | Receipt/outbox durables, dedupe y reconciliación | Exactly-once externo no garantizable; retry automático de UNKNOWN puede duplicar | Proveedor ofrece idempotencia verificable; aun así probar crash/replay |
| D11 | Epoch y serializador de envío/handoff con transición pendiente | Botón pause o cancelar streaming no cancelan bytes externos | Cambia transporte; probar pausa de worker y UNKNOWN_FINAL |
| D12 | Solicitar visita devuelve REQUESTED | Endpoint actual guarda SCHEDULED pero eso no confirma disponibilidad de agenda externa | Integración calendario y confirmación por asesor con conflictos/idempotencia verificadas |
| D13 | Modelo por calidad medida y contrato/región; Haiku 4.5 solo ancla económica inicial | Elegir modelo de moda o failover a proveedor no aprobado arriesga costo/datos | Evals ciegas, precio/disponibilidad/condiciones cambian |
| D14 | Cuota/ledger con reserva atómica global y tenant antes del gasto | Alertas por sí solas no impiden exceso por concurrencia | Nuevas unidades de precio/canal; conciliación detecta desvíos |
| D15 | Onboarding administrado, billing manual con entitlements | Autoservicio/pasarela acelera crecimiento pero no valida valor inicial | Segundo tenant y operación recurrente funcionan; volumen comercial justifica |
| D16 | Contenido público aprobado; revocación canónica inmediata e índices derivados | Copiar todo CRM al vector store cruza privacidad y actualidad | Cambia corpus/ACL; mantener borrado y fuente trazables |
| D17 | API oficial de canales, conexión propietaria del cliente y acceso revocable | Automatizar WhatsApp Web no satisface requisitos del producto | Meta/API/BSP verificado cambia condiciones; no presumir coexistencia |
| D18 | Retención propuesta 90d mensajes,30d logs,365d audit,35d backups | Guardar indefinidamente sube exposición y costo; borrar backups instantáneo no realista | Validación contractual/jurisdiccional por responsable; no es política legal aprobada |

## Revisión y consistencia

Decisiones D06 y D03 reemplazan la hipótesis anterior de híbrido desde inicio al recibirse el límite USD 150. D02 reemplaza la recomendación web-first; ambos se mantienen en los gates. Los agentes revisaron riesgos de carreras, licencias y datos. Detalles finales y correcciones se registran en architecture.md, evaluation-and-security.md y backlog.

No tomar una referencia comercial a varias «IA» como obligación de varias instancias de agentes. No confundir tablas chatbot existentes con un sistema operativo. No repetir diagnóstico histórico de visitas locales: el modo API está en código, su corrección funcional aún requiere pruebas.

## Decisiones que requieren Alvaro antes de operar

Capacidad/presupuesto de desarrollo separado; responsable de activos Meta y aprobación de canal; responsable humano Bellomo/horarios; datos/materiales/precios publicables; región/proveedor/tratamiento de datos; aceptación del piloto limitado y política de facturación/excedentes. La investigación y propuesta quedan completas con estos gates explícitos; su resolución no se inventa ni se reemplaza por autorización de deploy.
