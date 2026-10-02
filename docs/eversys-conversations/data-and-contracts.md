# Datos, contratos y reutilización de EverProp

Estado: diseño propuesto; inspección estática del 29/09/2026, HEAD `1d66246`. No se consultó ni modificó la base, ni se ejecutaron pruebas. Las tablas del baseline acreditan diseño declarado, no su despliegue ni funcionalidad completa. Rutas relativas siguientes parten del monorepo.

## Evidencia actual y correcciones necesarias

| Evidencia | Lectura actual | Consecuencia |
|---|---|---|
| `everprop-api/composer.lock:1213`, `composer.json:10`; `everprop-public/package.json` | Laravel fijado v13.24.0, PHP ^8.4; Next 16.2.10, React 19.2.4. `everprop-api/compose.yaml:156,191`: MySQL 8.4, Redis 8.2 | Reutilizar plataforma; no basar decisiones en README que dice Laravel 12/13. Son versiones declaradas, no runtime comprobado. |
| `app/Domain/Tenancy/Resolvers/TrustedTenantResolver.php:12,54,74` | Resuelve host confiable/usuario y rechaza candidatos contradictorios. Header de override solo local/testing con configuración habilitada | Reutilizar resolver; agregar resolución de canal firmado mediante adaptador. No aceptar tenant del prompt. |
| `app/Domain/Identity/Enums/RoleCode.php:7`; `app/Models/User.php:78` | Usuarios ligados a tenant, siete roles y capacidades. `InventoryRoleBoundary.php:15` restringe INVENTORY_MANAGER | Reutilizar `users.role_code`, policies y scopes de inventario. No instalar RBAC paralelo. |
| `AdminPropertyController.php:60,70,109,127,244` bajo Inventory/Http/Controllers | Alta individual controla precio; batch no llama setInitialPrices, usa USD por defecto y AVAILABLE; PATCH llena status sin control publish equivalente | Bloquear integración de escrituras inventario hasta corregir. No deducir moneda. |
| Mismo controlador `:113–118,139`; `UpdatePropertyRequest.php:20,39` | Batch cambia código por sufijo aleatorio; no define idempotencia; destino verifica tenant, no alcance operativo explícito | Revisar identidad compuesta, autorización destino y conflictos en MySQL aislado. No afirmar duplicado/500 reproducido. |
| `CRM/Http/Controllers/AdminLeadController.php:100,115,394,409,625` | Serializa precio directamente; attach consulta propiedad sin excluir deleted_at | Reutilizar servicio CRM solo tras incorporar acceso/visibilidad de inventario y rechazar nuevos intereses en eliminadas. |
| `routes/api.php:60`; AdminLeadController sin método destroy | apiResource sigue declarando DELETE sin implementación localizada | Resolver contrato antes del gate; no se reprodujo HTTP 500. |
| `CRM/Http/Controllers/AdminVisitController.php:94,123,128,140`; frontend `LeadDetailView.tsx:263–275` | Visitas tienen creación/cancelación por API; frontend usa API fuera de mock. Inserción guarda SCHEDULED sin integración calendario ni idempotencia; propiedad se busca sin deleted_at ni scope inventario | La descripción histórica «solo localStorage» ya no describe el modo API. Falta E2E, endurecer permisos y separar solicitud de confirmación. |
| `Integrations/Services/WebhookReceiver.php:37–155`; `Jobs/ProcessWebhookReceipt.php:105` | Firma HMAC, receipt durable, clave+hash, dispatch después de guardar; procesamiento genera domain_outbox | Reutilizar patrón. Adaptadores nativos deben validar firma propia del canal; el HMAC genérico no prueba compatibilidad Meta. Añadir recovery sweep de receipts que queden sin job. |

Prefijo de rutas abreviadas de backend: `everprop-api/app/Domain/`. Git mostraba documentos y archivos locales sin seguimiento preexistentes; se conservaron. Los resultados de pruebas históricos no se convierten en evidencia nueva.

## Ownership: extender antes que duplicar

El baseline `everprop-api/database/schema/bellomo_crm_omnichannel_mysql8.baseline.sql` ya contiene:

| Dominio dueño | Entidades existentes y línea | Extensión propuesta |
|---|---|---|
| Tenancy/Identity | tenants:32, users:50, user_inventory_settings:1732, user_inventory_scopes:1757 | Configuración versionada, branding, soporte temporal auditado; nuevas capacidades en modelo existente |
| Integrations | integration_connections:81, channel_accounts:110, webhook_receipts:176, webhook_events:215 | Adaptadores por canal, rotación/revocación de referencias a secretos, recovery y replay controlado |
| Contacts | contacts:256, contact_identities:289, contact_consents:324 | Prueba explícita para vincular identidades; revocación y retención |
| Conversations | conversations:352, messages:393 | control_state, control_epoch, state_version, next_sequence; lectores por usuario, etiquetas/notas, archivos privados |
| AI | chatbot_agents:818, chatbot_sessions:882, chatbot_runs:920 | Config inmutable/versionada; epoch y secuencia de entrada en cada run; tool executions, presupuesto, citas |
| Delivery | outbound_jobs:998, domain_outbox:1048 | epoch y nonce de despacho, reconciliación UNKNOWN, consumidor outbox y recibos deduplicados |
| Audit | audit_logs:1074, data_subject_requests:1100 | Eventos de soporte, exportación, revocación y eliminación verificable |
| Inmobiliario | projects:1577, properties:1612, lead_properties:1812, visits:1852 | Adapter RealEstateTools; solicitud de visita separada de cita confirmada |

El núcleo conversacional no lee tablas inmobiliarias directamente: invoca interfaces `InventoryQuery`, `InterestWriter`, `VisitRequester`. Implementaciones iniciales llaman servicios Laravel compartidos y sus policies; futura extracción puede conservar contratos sin exigir HTTP interno hoy. Bellomo aporta configuración, catálogo y documentos; no condicionales `if tenant == bellomo`.

Evolución futura exclusivamente mediante scripts forward versionados, con preflight de esquema y ensayo aislado; nunca editar ni reimportar baseline. Runtime faltante/no acreditado: inbox conversacional operativo, consumidor/dispatcher de outbound completo, toma humana concurrente, ejecución LLM y herramientas, ingestión RAG, metering/suscripción y conectores de canales reales. La existencia de domain_outbox y chatbot_runs no acredita ninguno de esos recorridos. Inventario/CRM sí tienen controllers y policies reutilizables, con los bloqueantes arriba indicados. La API pública de tools debe tener actor de visitante con capacidades propias; no pasar credenciales ni llamar endpoints admin como atajo.

Nuevas entidades justificadas (no se implementan ahora): `knowledge_documents/versions/chunks`, `tool_executions`, `conversation_read_cursors`, `conversation_tags` y relación, `support_access_grants`, `tenant_config_versions`, `usage_ledger`, `subscriptions` y `entitlements`, `visit_requests`. Antes de crear cada tabla contrastar forward SQL y schema efectivo en entorno aislado. Documentos y vectores son proyecciones revocables; MySQL mantiene autoridad de ACL y versión.

## Tenancy e identidad

Elegir DB compartida con `tenant_id`: reutiliza FKs compuestas existentes y reduce operación inicial. Cada tabla operativa nueva incluye UNIQUE(tenant_id,id), FKs compuestas, consultas explícitas y policy. Global scopes son una defensa adicional; DB::table y jobs necesitan contexto explícito. Rechazar contexto ausente y limpiar contexto en finally al terminar cada job.

Una fila users es hoy cuenta/membresía de una sola organización; uq_users_tenant_email ya es compuesto (baseline:70). Segundo tenant puede tener cuenta distinta con el mismo email. No introducir otra tabla de roles o membresías competidora. SSO multi-organización queda fuera de MVP; una futura identidad global podría enlazar cuentas tenant sin trasladar `role_code` ni scopes a otra fuente de verdad. No unir contactos entre tenants, ni por nombre, email o teléfono automáticamente.

Soporte Eversys: grant con tenant, soporte_user, motivo, capacidades acotadas, aprobador, vencimiento y revocación; activar sesión de soporte explícita y auditar lecturas/escrituras. SUPER_ADMIN no debe equivaler a navegación silenciosa por todas las conversaciones. El modelo nunca recibe credenciales ni grant ni puede generarlo.

Piloto ajustado al límite operativo de USD 150 y a web + WhatsApp: recuperación documental léxica en MySQL, sin vector store ni reranker pago inicial. Si una evaluación posterior justifica índice vectorial, exigir namespace por tenant y filtro obligatorio de tenant+visibilidad+document_version. En ambos casos revalidar ACL y vigencia en MySQL antes de entregar fragmentos. Archivos bajo tenant/public-id en bucket privado; caché incluye tenant, actor/ACL-version y versión de fuente; trazas redactadas con acceso por tenant; jobs contienen referencias y no credenciales. Revocación incrementa ACL version, invalida cachés y bloquea lectura antes del borrado asíncrono del índice.

### Recuperación mínima y presupuesto verificables

Separar tres rutas: código exacto/proyecto → InventoryQuery; precio/disponibilidad/moneda → API vigente; pregunta documental → FULLTEXT de chunks aprobados. Los códigos son strings y se resuelven en índice estructurado compuesto por tenant/proyecto/código, nunca parseInt ni solo FULLTEXT. Código ambiguo entre proyectos pide aclaración. Conservar 12, 12A y 12B como entidades distintas. Buscar alias comerciales aprobados en tabla/config por tenant (por ejemplo terreno/lote), sin expansión generativa obligatoria. Fragmentos conservan título, proyecto, versión y cita para aportar contexto sin una llamada extra al modelo.

FULLTEXT MySQL usa MATCH/AGAINST y posee configuración de stopwords/tamaño de tokens; no asumir que cubre identificadores cortos o todas las variantes del español. Verificar configuración efectiva en pruebas aisladas. Se documenta como recuperación léxica MySQL, no como una implementación BM25 garantizada. [Manual MySQL 8.4](https://dev.mysql.com/doc/refman/8.4/en/fulltext-search.html), [ajuste de índices](https://dev.mysql.com/doc/refman/8.4/en/fulltext-fine-tuning.html), consultados 29/09/2026.

Baseline experimental sugerido: recuperar hasta 10 candidatos documentales autorizados, seleccionar hasta 4 chunks sin repetir sección y tope conjunto de 3.000 tokens; comparar recall@10 y citas contra gold antes de fijar umbral. Falta de evidencia produce aclaración/derivación; score léxico no es probabilidad de veracidad. Priorizar routing determinista de consultas exactas; para conversación natural, máximo dos llamadas LLM normales por turno (selección de herramienta y composición), hasta tres incluyendo un único reintento transitorio; dos lecturas y una mutación confirmada, dentro de 20s y presupuesto original. Reservar tokens de entrada/salida reales máximos, no suponer consumos medios para el corte.

Ledger de presupuesto: antes de cualquier llamada facturable reservar importe máximo estimado por operación dentro de transacción con bloqueo del saldo tenant y global; al terminar conciliar costo real y liberar diferencia. Misma operación no reserva dos veces. Cuota gastada+reservada impide nuevas llamadas; cobros externos inciertos conservan reserva hasta reconciliación. Separar costo fijo comprometido, variable IA, canal y colchón de facturación/impuestos; USD 150 es techo de planificación, no garantía sobre facturas aún no contratadas. Si costo fijo+reservas deja cero saldo variable, deshabilitar IA antes del consumo, mantener recepción/bandeja y permitir atención humana conforme reglas del canal. Concurrencia web/WhatsApp comparte el mismo saldo: probar ambos agotándolo a la vez.

Gates particulares: 100% identificación exacta en casos 12/12A/12B y monedas desconocidas; ninguna respuesta documental transforma precio PDF en precio vigente; cero fugas en ambos canales y ningún consumo autorizado que exceda saldo reservado en pruebas concurrentes. Para calidad documental, fijar meta previa (propuesta recall@10 ≥90% de consultas respondibles y ≥95% citas sustentadas), inspeccionar cada fallo crítico y derivar los grupos que fallen. Aumentar corpus o añadir vectores solo después de medir errores concretos y recalcular presupuesto; no reducir aislamiento ni controles para ahorrar.

## Conversación y entrega

Conservar `conversations.status` para OPEN/PENDING/RESOLVED y `bot_mode` para política. Añadir estado operacional explícito: AI_ACTIVE, WAITING_TOOL, WAITING_HUMAN, HUMAN_ACTIVE, CLOSED. Evitar dos campos autoritativos contradictorios: un servicio de transición actualiza los campos en una transacción y valida invariantes.

Ingreso: verificar firma con cuerpo original → resolver canal/tenant activo → persistir receipt con ID nativo/dedupe → ACK rápido → worker normaliza cada evento → transacción crea mensaje/secuencia y evento outbox. Una entrega HTTP puede contener varios eventos: dedupe de receipt no sustituye dedupe de evento/mensaje. UNIQUE tenant+channel+provider_message_id a nivel de ingreso evita reasignar un mensaje a otra conversación; preservar constraint por conversación existente pero extender protección. `occurred_at` nativo y `received_at` se guardan; secuencia local es orden de aceptación, no prueba de orden global del proveedor. Los callbacks de estados pueden llegar desordenados: no degradar READ a SENT.

Evento normalizado de ejemplo (valores sintéticos):

```json
{"schema_version":1,"event_id":"evt-123","type":"message.inbound.v1","tenant_ref":"server-only","channel_account_id":"chan-1","conversation_id":"conv-1","sequence":18,"provider":{"name":"web","event_id":"native-1","message_id":"msg-native-1"},"occurred_at":"2026-09-29T14:00:00Z","received_at":"2026-09-29T14:00:01Z","payload":{"message_id":"msg-1","kind":"text"},"trace_id":"trace-1"}
```

Outbox transaccional: cambio de negocio y evento se guardan juntos; worker con lease reclama, publica, confirma. Consumidor mantiene UNIQUE(tenant,event_id,consumer). Reintentos exponenciales con jitter y límite; DLQ visible, replay conserva ID original. Transporte interno puede repetir y consumidores son idempotentes. Entrega externa es best-effort con estados explícitos y reintentos seguros según proveedor; UNKNOWN se concilia y nunca se reenvía a ciegas. No garantizar exactly-once ni at-least-once externo universal.

### Toma humana y carrera con IA

1. Generación captura control_epoch y última secuencia, sin bloquear MySQL durante la llamada LLM.
2. Solicitud de toma obtiene permiso y pasa por el mismo serializador durable por conversación que el despachador. Incrementa epoch y cancela runs/outbound pendientes del epoch previo. Si hay un envío con resultado externo incierto, muestra toma pendiente y detiene nuevos envíos hasta resolverlo.
3. Al confirmar HUMAN_ACTIVE, no puede existir despacho IA autorizado pendiente anterior. Worker valida estado/epoch/secuencia dentro de la transacción que autoriza un despacho y otra vez en el serializador inmediatamente antes del transporte. Un lock Redis con TTL por sí solo no alcanza: worker pausado puede revivir; debe tener fencing durable y no enviar al perder el lease.
4. Llamada ya aceptada por proveedor antes de la toma puede entregarse después; no se puede retirar universalmente. UI informa esa posibilidad como «mensaje ya enviado/en tránsito», no promete revocarlo. Aceptación de toma queda después de resolver el límite de despacho anterior; no basta comprobar epoch antes de encolar.
5. Sin reconciliación posible, resolución manual auditada UNKNOWN_FINAL puede liberar la toma cuando no exista llamada local en curso; advertir posible entrega tardía y prohibir replay automático. Reanudar requiere acción autorizada y nuevo epoch; resumen versionado incorpora mensajes humanos, excluye notas internas. IA no se reanuda por timeout silencioso. Cierre cancela pendientes; nuevo inbound se reabre según política, sin reactivar IA si intervención sigue vigente.

## API propuesta y herramientas

Rutas propuestas bajo `/api/v1`: `GET /admin/conversations`, `GET /admin/conversations/{id}/messages`, `POST /admin/conversations/{id}/takeover`, `/resume`, `/messages`, `PATCH /admin/conversations/{id}` con If-Match/version; `POST /public/chat/sessions` emite sesión limitada a canal web configurado y `POST /public/chat/messages` verifica esa sesión. No reutilizar cookie admin para visitante. UUID no es autorización. Acceso cross-tenant devuelve NOT_FOUND sin revelar existencia.

Bandeja (2026-10-02): `GET /admin/conversations` incluye `last_message` (`{text, sender}` del último INBOUND/OUTBOUND, 140 caracteres; nunca INTERNAL) o `null`. `GET .../messages?after=<sequence>` devuelve hasta 200 mensajes posteriores; el panel lee incremental y vuelve a pedir desde el envío más viejo cuyo estado puede cambiar. Aviso al asesor (`ConversationNeedsAttention`, notificación database → web push): al pasar a `WAITING_HUMAN` por handoff, o con el primer mensaje no leído de una conversación en `WAITING_HUMAN`/`HUMAN_ACTIVE`; destinatarios según la visibilidad de la bandeja (dueño activo; si el asignado no está activo, gerentes/admins; si no hay asignado, asesores/gerentes/admins del tenant). El push no lleva nombre ni texto del cliente: abre `/admin/conversaciones?c=<uuid>` con un tag por conversación.

Gateway interno recibe contexto confiable {tenant, actor, conversation, run, epoch, allowed_tools, trace}; el modelo solo genera `arguments`. Esquemas JSON Schema con additionalProperties:false, campos acotados, enum y UUID; validar también semántica/policy/vigencia. Contexto e idempotency_key los genera servidor, no el LLM.

| Herramienta | Arguments requeridos y opcionales | Salida y autorización |
|---|---|---|
| buscar_propiedades | filtros objeto cerrado: operation enum SALE/RENT, category enum del catálogo permitido, city string≤160, project_id UUID, unit_code string≤80, budget {amount decimal-string,currency enum ARS/USD}; limit 1..10 | items {id,code,title,price:null o {amount,currency},availability,as_of,version,url}, next_cursor. Solo publicación pública para visitante; scopes reales para asesor. No búsqueda presupuestaria sin moneda. |
| consultar_propiedad | property_id UUID | mismos campos más atributos públicos/fuentes, as_of. Eliminada/retirada/inaccesible devuelve NOT_FOUND. Leer vigente, no copia vectorial. |
| registrar_interes | property_id UUID; interest_level enum LOW/MEDIUM/HIGH; notes string≤1000 opcional | {interest_id,lead_id,status:PERSISTED,replayed}. Contacto y lead se resuelven desde conversación; nunca acepta tenant ni lead arbitrario ni precio cotizado. CRM policy y visibilidad de propiedad; transacción con outbox. |
| solicitar_visita | property_id UUID; preferred_slots array 1..3 de {start date-time,end date-time,timezone IANA}; note≤1000 opcional | {request_id,status:REQUESTED,confirmed:false}. Verifica futuro, zona y disponibilidad de propiedad. No invoca store actual que fija SCHEDULED como si calendario hubiera confirmado. |
| derivar_a_asesor | reason enum USER_REQUEST/NO_EVIDENCE/TOOL_FAILURE/COMMERCIAL_EXCEPTION; summary string≤1500 | {handoff_id,state:WAITING_HUMAN,assigned_user_id:null o UUID}. Backend elige responsable/pool, incrementa epoch y cancela pendientes; no garantiza asesor online. |

Ejemplo de schema de escritura:

```json
{"name":"registrar_interes","parameters":{"type":"object","additionalProperties":false,"required":["property_id","interest_level"],"properties":{"property_id":{"type":"string","format":"uuid"},"interest_level":{"type":"string","enum":["LOW","MEDIUM","HIGH"]},"notes":{"type":"string","maxLength":1000}}}}
```

Respuesta validada (ejemplos sintéticos):

```json
{"ok":true,"data":{"request_id":"req-123","status":"REQUESTED","confirmed":false},"meta":{"schema_version":1,"persisted":true,"replayed":false,"trace_id":"trace-1"}}
```

```json
{"ok":false,"error":{"code":"STALE_CONTROL","message":"La conversación cambió de responsable.","retryable":false},"meta":{"trace_id":"trace-1"}}
```

Errores comunes: VALIDATION_ERROR 422; NOT_FOUND 404; FORBIDDEN 403 dentro de tenant conocido; VERSION_CONFLICT/IDEMPOTENCY_CONFLICT/STALE_CONTROL 409; QUOTA_EXCEEDED 429; DEPENDENCY_UNAVAILABLE 503; TIMEOUT/DELIVERY_UNKNOWN (no afirmar fracaso definitivo). Respuesta a modelo no incluye stack, SQL, secretos ni IDs internos de otro tenant. Reintentar lecturas transitorias dentro de presupuesto; escrituras con misma clave y mismo hash, nunca a ciegas.

Idempotencia: UNIQUE(tenant_id,tool_name,idempotency_key), hash de argumentos canónicos y objeto resultado persistido; misma clave/argumentos devuelve resultado, distinto hash 409. Crear ejecución y mutación+outbox en misma transacción local; la reserva de ejecución en curso tiene estado/lease. Unique de intención de negocio (tenant,contact,property,active-interest) evita duplicar interés por una nueva llamada LLM. Solicitudes de visita deduplican por comando explícito, no por todas las visitas del contacto: la persona puede solicitar otra fecha. Reintentos de proveedor con resultado desconocido usan reconciliación por ID nativo antes de reenvío.

## Segundo tenant y ciclo de vida

Prueba propuesta en MySQL aislado con Bellomo sintético y `inmobiliaria-demo-2`, sin datos reales: mismo email de usuario, mismo código 12A y misma identidad nativa ficticia en cuentas de canal distintas; documentos contradictorios. Onboarding crea tenant/config/cuenta/rol/canal web/conocimiento por las mismas APIs, sin fork. Todas las respuestas de tenant 2 deben citar y consultar solo sus fuentes, incluso manipulando IDs, caché, archivos, jobs, herramientas y prompt. Fixtures de Bellomo no incluyen inventario real.

Onboarding: tenant DRAFT → configurar branding/horarios/catalogo/capacidades → cargar/aprobar fuentes → pruebas de aislamiento → habilitar canal. Suscripción/entitlements se evalúan en backend antes de consumir; ledger agrega costo por run/herramienta/canal con IDs deduplicables. No bloquear inbox humano por agotar cuota IA.

Offboarding: suspender ingestión/envío, cancelar pendientes/leases, revocar conectores y sesiones, exportar bajo autorización, ejecutar retención/borrado por manifest de SQL/archivos/índices/cachés/proveedor, verificar ausencia de recuperabilidad operacional. Backups expiran conforme política documentada; restaurar debe reaplicar tombstones antes de habilitar acceso. Billing/auditoría conservan solo mínimos necesarios según política a aprobar, sin prometer borrado instantáneo de backups.

## Criterios de aceptación del contrato

- Diez entregas concurrentes del mismo evento producen un mensaje y un efecto CRM; clave repetida con cuerpo distinto da conflicto.
- Revocar permiso entre recuperación y respuesta impide exponer fragmento; entre propuesta y ejecución impide escritura.
- Toma humana durante generación, espera de herramienta y despacho cancela lo no enviado; timeout externo queda UNKNOWN hasta reconciliar, sin reintento ciego.
- Precio nulo/moneda desconocida permanece desconocido; 12A y 12B conservan identidad; propiedad retirada no se ofrece ni admite nuevo interés.
- Solicitud de visita retorna REQUESTED, nunca CONFIRMED sin confirmación externa persistida/asesor autorizado.
- Toda FK, cache key, documento, job y herramienta falla cerrado en prueba cruzada de dos tenants; usuario READ_ONLY no escribe.
- Cero fugas/escrituras no autorizadas en el conjunto de pruebas es gate, no prueba de riesgo cero universal.
