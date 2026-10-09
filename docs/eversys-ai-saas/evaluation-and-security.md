# Evaluación, seguridad, canales y operación

Fecha de investigación: 2026-09-29. Estado: propuesta de diseño; no implementado ni validado en producción. Decisión de Alvaro: piloto con chat web y WhatsApp, presupuesto operativo máximo USD 150/mes; presupuesto no cubre desarrollo ni elimina gates externos. Se leyeron AGENTS raíz/API/frontend, skill everprop-senior-tech-lead, prompt maestro y LOCAL-DEVELOPMENT. No se conectaron cuentas, enviaron mensajes ni consultaron/modificaron bases. Los objetivos siguientes son criterios de aceptación propuestos, no resultados medidos.

## 1. Canales: evidencia y dependencias de lanzamiento

| Canal | Evidencia oficial consultada | Implicación de diseño | Pendiente que bloquea su activación |
|---|---|---|---|
| Chat web | Canal propio propuesto, sin dependencia Meta | Parte obligatoria del piloto junto con WhatsApp; sesión anónima opaca ligada por servidor a un widget y tenant; nunca confiar en tenant_id del navegador | Dominio/orígenes, protección antiabuso, consentimiento y prueba de aislamiento |
| WhatsApp | Página oficial de precios: cobro por mensaje entregado, mercado y categoría; servicio en ventana de 24 h reiniciada por mensaje entrante sin cargo según página; entrada por anuncio/CTA con período gratuito de 72 h [M1] | Guardar categoría, destinatario/mercado, timestamps y coste facturado; motor de elegibilidad independiente del LLM | Tarifa Argentina exacta, condiciones efectivas al lanzamiento, permisos/aprobación y elegibilidad del número; no presupuestar indefinidamente gratuidad |
| Instagram | Colección de Meta: cuenta profesional, permiso instagram_business_manage_messages, mensaje inicial del usuario; no chats grupales [M2] | Conector separado; no iniciar conversaciones arbitrariamente ni asumir identidad igual a WhatsApp | Ruta de login y permisos finales, revisión/Advanced Access, ventana/excepciones, límites y webhooks actuales |
| Messenger | Resultado indexado de colección Meta: pages_messaging y contacto dentro de 24 h o acuerdo aplicable; colección Conversations exige Advanced Access para usuarios sin rol [M3/M4] | Página y token asociados al tenant; envío condicionado por política vigente | Lectura completa actual del Send API (timeout), excepciones, App Review, límites y condiciones comerciales |

**No verificado:** Embedded Signup, propiedad efectiva de activos y número, App Review de WhatsApp, convivencia con WhatsApp Business App, cuotas/throughput, formatos de firma y reintentos actuales. Los enlaces oficiales M6–M8 devolvieron 429 y M9 no fue recuperable. No se sustituyeron por blogs ni se prometió conservar el uso actual de la app. La página comercial de precios no sustituye el contrato técnico ni su rate card. Fecha efectiva de cambio de tarifas no comprobada: revalidar antes de cotizar.

Plan de validación (responsable Integraciones, previo a cualquier conexión autorizada): inventario de titularidad de número/WABA/portfolio/Page/IG con Bellomo; elegir API oficial directa o proveedor; obtener permisos requeridos con mínimo privilegio; documentar flujo de desconexión/portabilidad; confirmar coexistencia elegible sin mover el número en esta fase; comprobar revisión, webhooks, límites, plantillas y política de mensajes. Capturar versión API, URL, fecha de consulta y fecha efectiva de cada regla. Eversys propone contractualmente que el cliente conserve sus activos y conceda acceso revocable; esto es decisión de producto, no prueba de ownership actual.

Aceptación del piloto requiere ambos canales funcionando en el alcance aprobado; una demostración web aislada es incremento técnico, no piloto completo. WhatsApp no se activa hasta superar los gates oficiales pendientes. Bajo USD 150/mes, usar recuperación léxica inicial e inventario por API; vectores y reranker quedan fuera del coste base hasta demostrar necesidad y cabida presupuestaria. Registrar consumo conjunto de web/WhatsApp; no reducir aislamiento, backups o control de envío para cumplir el presupuesto.

El dispatcher consulta `ChannelPolicy.canSend` al momento de envío: ventana, consentimiento aplicable, plantilla aprobada cuando corresponda, estado del canal, cuota y destinatario. Ante reglas no verificadas, falla cerrado y deja borrador para el asesor; un humano tampoco puede evadir reglas del canal. HUMAN_AGENT no se tratará como permiso para automatización o campañas. MVP sin campañas outbound ni seguimientos automáticos fuera de ventana.

## 2. Límites de confianza y aislamiento

Identidad autenticada -> membresía activa -> tenant de servidor -> capacidad -> recurso. Webhooks: firma verificada sobre bytes crudos según contrato del canal y asociación registrada de activo externo a tenant; un campo del mensaje nunca elige el tenant. Widget público: identificador publicable selecciona configuración pública, sesión firmada y sólo catálogo publicable; no concede derechos de asesor.

| Capa | Control obligatorio | Prueba negativa |
|---|---|---|
| SQL | tenant_id obligatorio, query explícita + policy; claves únicas/relaciones compuestas tenant_id/id donde aplique; rechazar asociaciones cruzadas | ID válido ajeno en detalle, lote, exportación y acción devuelve denegación sin revelar existencia |
| RAG | filtro tenant/ACL/vigencia generado por servidor antes de recuperar y comprobar otra vez antes del contexto; manifiesto/versiones y tombstone | Mismo texto y código en tenant A/B; ningún candidato ni cita ajenos; documento revocado bloqueado aunque siga físicamente indexado |
| Objetos | almacenamiento privado por tenant; autorización previa a URL firmada breve; prefijo no equivale a autorización | URL ajena, path traversal, URL vencida y descarga tras revocación |
| Cache | clave tenant + permisos/versión + recurso; nunca caché global de respuestas con PII | Misma pregunta en dos tenants y cambio de rol |
| Jobs | contexto tenant inmutable originado en servidor, revalidación de permisos/canal al ejecutar, cuota por tenant | Replay de job tras revocar membresía/conector |
| Herramientas | allowlist + schemas + policy fuera del modelo; sin SQL/URL arbitrarios | LLM cambia tenant, user o property_id: backend rechaza |
| Trazas | atributos correlacionables sin prompt/PII por defecto; acceso por tenant; soporte temporal auditado | Operador de A solicita traces de B |
| Identidades | external_contact_id scoped por tenant + canal + activo; unión entre canales sólo con verificación explícita | Dos nombres iguales no fusionan personas |

Soporte Eversys: rol sin acceso habitual al contenido; elevación temporal con motivo, alcance, caducidad y auditoría consultable. No impersonación silenciosa. Secretos en gestor dedicado con referencias por conector, rotación y revocación; nunca en prompts, logs ni exportaciones.

## 3. Amenazas y controles

| Riesgo | Control preventivo/detectivo | Evidencia exigida |
|---|---|---|
| Inyección en chat, PDF o resultado de herramienta | Datos delimitados y no confiables; capacidades y autorización fuera del LLM; ninguna herramienta genérica shell/SQL/HTTP | Corpus adversarial con órdenes de ignorar política/exfiltrar/cambiar tenant; cero acciones no autorizadas |
| Exfiltración mediante links o adjuntos | Egress allowlist del backend; URLs generadas/permitidas; no descargar URL elegida libremente por el modelo; saneamiento de salida | Ataques SSRF a loopback, metadata y red privada bloqueados |
| PDF/archivo malicioso | Límite tamaño/tipo real, cuarentena, scanner y parser aislado con CPU/tiempo/memoria limitados; objetos privados | Archivo poliglota, zip bomb, HTML/script y archivo corrupto sin ejecución |
| Precio/moneda inventados | Sólo campos de API vigente; null de moneda bloquea presentar cotización; documentos no prevalecen sobre inventario | 12A/12B exactos, moneda desconocida y propiedad retirada |
| Replay/duplicación | Inbox persistida y clave única de evento; herramientas idempotentes; outbox transaccional | 20 repeticiones y entrega fuera de orden producen un interés y una intención de envío |
| Presupuesto/denegación de servicio | Límites tenant/sesión/IP, adjuntos/tokens, concurrencia y circuit breaker | Tenant ruidoso no agota trabajadores de otros; cuota devuelve degradación definida |
| Revocación durante ejecución | Epoch de permisos/conversación, comprobar en dispatch y antes de mutación | Revocación entre retrieval y envío no filtra contexto |

Un segundo LLM puede ayudar a puntuar calidad, pero no es barrera única de seguridad. Cifrado en tránsito/en reposo no reemplaza autorización. Proveedor de IA: validar contrato de procesamiento, región, retención, entrenamiento y subprocesadores antes de enviar PII; no presumir condiciones por el nombre comercial.

## 4. Handoff y semántica de entrega

Estados: IA_ACTIVA, ESPERANDO_HERRAMIENTA, ESPERANDO_HUMANO, HUMANO_ACTIVO, CERRADA. Cada conversación tiene `control_epoch`, `state_version` y responsable. Worker recibe epoch E; todo resultado es borrador. Tomar control humano incrementa epoch y cancela ejecuciones/outbox pendientes; reanudar exige acción explícita auditada que incrementa epoch, registra motivo y conserva historial más un resumen con fuentes.

**Carrera crítica:** una validación antes del HTTP externo sola no basta. El actor/dispatcher serializa toma de control y comienzo de envío por conversación, mediante lease/fencing y estado durable. UI de toma de control sólo confirma cuando la barrera de dispatch quedó aplicada. Envíos que todavía no comenzaron quedan cancelados; respuestas de LLM antiguas se descartan. Si proveedor ya aceptó el mensaje, no puede retirarse ni garantizar que no llegue después: mostrar “envío anterior en curso” hasta resolverlo. No prometer retractación ni exactly-once distribuido.

Timeout de POST al canal con resultado ambiguo: marcar UNKNOWN, reconciliar por ID/estado cuando API lo permita; no retry ciego. Si proveedor no ofrece idempotencia o consulta verificable, revisión humana. Para evitar toma pendiente infinita, una resolución manual auditada puede cerrar el intento como UNKNOWN_FINAL sin reenviarlo, cuando ya no exista llamada local en curso; habilita control humano con aviso de posible entrega tardía. No convierte el estado desconocido en entregado ni garantiza ausencia de duplicado si una persona decide un nuevo envío. Inbound: verificar autenticidad, persistir inbox, ACK rápido, procesar después. Dedup por tenant/conector/event_id/tipo; eventos sin ID requieren regla documentada. Ordenar mutaciones por conversación, conservar timestamp de origen/recepción; no degradar un estado delivered a sent ante eventos tardíos. Reintentos transitorios con jitter y tope; 401/403 revocan circuito, 429 respeta espera del proveedor, inválidos a cola fallida. Replay auditado conserva idempotencia.

## 5. Datos, privacidad y retención propuesta

No es asesoría jurídica ni política ya aprobada. Propuesta configurable: mensajes/adjuntos 90 días, trazas técnicas sin contenido 30 días, auditoría de acciones/configuración 365 días, backups cifrados 35 días; datos CRM siguen política acordada con cada cliente. No recolectar documentos de identidad, datos bancarios o sensibles en MVP. Teléfono/contacto sólo si necesario para el recorrido y con aviso aplicable. Pseudonimizar datasets; nunca copiar chats completos a tickets.

Borrado: tombstone y revocación de acceso inmediata; eliminación de SQL/objeto/índice/cache/derivados propuesta <=24 h, verificación posterior con reporte; backups expiran según política y restauración reaplica registro de borrados antes de abrir tráfico. Aclarar excepciones de conservación contractual antes de prometer eliminación total. Exportación requiere permiso, alcance tenant, cifrado y URL breve; auditar descarga. No “recordar” PII mediante embeddings cuando basten campos CRM. Responsabilidades contractuales y requisitos jurisdiccionales quedan pendientes de validación profesional. Región de procesamiento/almacenamiento y acuerdo de procesamiento de datos (DPA), incluyendo subprocesadores y política de retención del proveedor IA, son decisiones bloqueantes del piloto público con datos reales; no de la demostración sintética.

## 6. Dataset y gates verificables

Diseñar 200 casos versionados inicialmente: 60 búsqueda exacta/semántica, 30 datos actuales y contradicciones, 30 flujos CRM/visitas, 40 seguridad/aislamiento, 20 fallos/eventos/carreras, 20 español rioplatense/errores. Dataset sintético hasta autorizar anonimización de consultas reales. Separar desarrollo/test ciego; cada caso incluye rol, tenant, fuente/versión, respuesta o abstención esperada y estado persistido esperado. Añadir pruebas generativas concurrentes (no cuentan como 200 ejemplos estáticos).

Casos obligatorios: “tenés el 12a?” frente a 12B; mismo código en otro desarrollo; “cuánto sale en dólares” con currency=null; inventario retirado después del retrieval; PDF viejo contradice API; ninguna evidencia; orden oculta en PDF; ID de B desde A; revocación tras retrieval; evento repetido; proveedor IA caído; timeout de herramienta después del commit; dos asesores tomando control y handoff durante generación/envío; visita solicitada nunca presentada como confirmada.

| Métrica | Gate propuesto inicial | Medición |
|---|---|---|
| Fugas tenant / escrituras no autorizadas | 0 en suite; cualquier caso bloquea release | Tests deterministas backend y ataques de extremo a extremo |
| Campos críticos (código, precio, moneda, estado) | 100% exactitud o abstención correcta en conjunto crítico | Comparación contra snapshot/API fixture |
| Duplicados de negocio | 0 en replay, crash y timeout ambiguo | Conteo persistido + clave idempotente |
| Recall@10 documental | >=90% en casos con evidencia recuperable | Relevancia anotada manualmente, por segmento |
| Citas sustentadas | >=95%; 100% en condiciones comerciales críticas | Revisores humanos, verificación automática auxiliar |
| Abstención correcta sin evidencia | >=95%; 100% si dato comercial crítico | Casos negativos independientes |
| Herramientas | >=98% éxitos en escenarios válidos sin fallo inducido | Estado real persistido; no texto del LLM |
| Handoff | 0 nuevos envíos IA iniciados después de barrera confirmada | Prueba concurrente instrumentada y IDs externos |
| UX | Asesor completa asignación, control, solicitud y cierre sin pérdida | Navegador; teclado, estados accesibles y errores claros |

Dos revisores (Bellomo/producto + QA) calibran rúbrica, resuelven discrepancias y registran muestras. Umbrales son hipótesis de salida, no benchmarks universales. Medir p50/p95 y coste por tarea completa; oportunidades calificadas y visitas efectivamente confirmadas como resultados comerciales, con línea base y definición estable. Resolución automática no equivale a satisfacción.

Release: contrato/aislamiento + unitarios -> integración MySQL aislada -> sandbox de conectores -> eval ciega -> revisión humana -> piloto en sombra sin enviar -> piloto limitado autorizado con kill switch -> ampliación. Todo externo requiere autorización de una fase posterior. Cambios de modelo/prompt/embeddings/parser ejecutan regresión; versionar configuración y rollback. Fallo de aislamiento deshabilita automatización afectada y preserva auditoría; no se compensa con promedio alto de calidad.

## 7. Operación: objetivos sujetos a prueba

Disponibilidad interna bandeja/ingestión 99,5% mensual en piloto y objetivo comercial 99,9% sujeto a capacidad y validación; medir dependencia de canal/LLM por separado y disponibilidad extremo a extremo sin ocultarla. ACK webhook p95 <1 s tras persistencia; respuesta IA p95 <12 s con carga piloto declarada, timeout total 20 s, máximo 2 llamadas normales al modelo/turno y 3 incluyendo un reintento, hasta 8k tokens de entrada y 600 de salida por llamada, 2 herramientas de lectura y 1 mutación por acción confirmada; límites iniciales revisables. Timeout de lectura 3 s; no reintentar mutaciones salvo idempotencia garantizada. Fallo -> borrador/mensaje neutro autorizado y ESPERANDO_HUMANO, no éxito inventado.

Alertas: cola más antigua >30 s, errores sostenidos >2%, conector revocado inmediato, gasto 70%/85% cuota con corte preventivo antes de autorizar sobre 100%, fallos de aislamiento inmediato. Dashboard tenant/conversación/run/tool correlacionados mediante IDs, sin contenido por defecto. Kill switch por tenant/canal/proveedor; circuit breaker ante fallos repetidos; reanudar controladamente después de reautorización y prueba.

RPO propuesto <=15 min y RTO <=4 h para piloto con backups + logs; restauración mensual a entorno aislado, prueba de objetos/índices y registro de borrados. SQL es verdad; índices se reconstruyen desde documentos/versiones autorizadas. No afirmar estos objetivos cumplidos sin medir restauración completa y compra de capacidad apropiada. Documentar que pérdida de región y mensajes en tránsito pueden ampliar recuperación. Mantener snapshots/versiones previas; rollback aplicativo nunca revierte silenciosamente acciones comerciales ya persistidas.

## Registro de fuentes

Todas consultadas 2026-09-29. No se utilizó el contenido de terceros como confirmación de reglas Meta.

- M1: [WhatsApp Business Platform Pricing](https://whatsappbusiness.com/products/platform-pricing/) — descripción oficial de precios/ventanas; accesible; tarifas por mercado dinámicas no extraídas; fecha efectiva no expuesta en lectura.
- M2: [Meta Instagram Send API](https://www.postman.com/meta/instagram/folder/uxudqu0/send-api) — documentación API publicada por Meta, accesible; permisos e inbound previo comprobados.
- M3: [Meta Messenger Send API](https://www.postman.com/meta/messenger-platform-api/folder/vilwbh4/send-api) — resultado indexado oficial; apertura timeout; evidencia parcial, revalidar.
- M4: [Meta Conversations API](https://www.postman.com/meta/messenger-platform-api/folder/22794852-255610cd-47f5-4f4d-b3fa-71aec360be9a) — resultado indexado oficial con permisos/Advanced Access; distinguir ruta Facebook Login de Instagram Login.
- M5: [Meta WhatsApp Webhook Subscriptions](https://www.postman.com/meta/whatsapp-business-platform/folder/ozgs3jn/webhook-subscriptions) — resultado indexado oficial: suscripción WABA y permiso whatsapp_business_management; apertura timeout; formatos completos pendientes.
- M6: [Meta Embedded Signup](https://developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/overview) — 429; onboarding/ownership/App Review no verificados directamente.
- M7: [Meta Coexistence](https://developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/onboarding-business-app-users) — 429; elegibilidad y limitaciones pendientes.
- M8: [Meta Instagram Messaging](https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login/messaging-api/) — 429; política detallada no verificada.
- M9: [Meta non-template pricing](https://developers.facebook.com/documentation/business-messaging/whatsapp/pricing/non-template-messages/) — no recuperable; no atribuir cambios futuros sin fuente accesible.




