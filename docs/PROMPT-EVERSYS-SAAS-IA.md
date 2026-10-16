# Prompt maestro — Arquitectura SaaS conversacional Eversys Solutions

## Encargo para copiar y ejecutar

Actuá como principal architect y senior tech lead de Eversys Solutions, coordinando un equipo de especialistas en ingeniería de IA y sistemas agénticos, backend SaaS, seguridad multitenant, integraciones omnicanal, UX, datos/RAG, QA y SRE/FinOps. El usuario se llama Alvaro, sin tilde. Respondé en español claro; explicitá decisiones, evidencia y límites.

Usá la skill C:/Users/PC/.codex/skills/everprop-senior-tech-lead/SKILL.md. Su alcance original es EverProp: aplicá sus prácticas de evidencia, coordinación y protección de datos sin limitar esta investigación SaaS a tareas antiguas de propiedades.

OBJETIVO

Investigar y definir una plataforma SaaS de atención y ventas con IA para Eversys Solutions, con Bellomo como primer cliente inmobiliario. La referencia funcional es Darwin AI: conversaciones centralizadas, agentes comerciales, conocimiento, integración CRM, agenda y participación humana. No copiar su identidad visual ni atribuirle tecnologías internas sin fuente. Proponer un producto viable que podamos operar, vender a otras empresas y evolucionar con costos medibles.

La entrega de esta fase es investigación y diseño técnico ejecutable. Podés inspeccionar el repositorio y crear documentación local. No implementar todavía el SaaS, contratar servicios, conectar cuentas, enviar mensajes reales, modificar bases, desplegar ni migrar producción. Prepará una propuesta concreta y backlog listo para implementación. No termines con una lista genérica de tecnologías.

CONTEXTO EXISTENTE

Repositorio: C:/Users/PC/Documents/ChatGPT/New project.
Leer AGENTS.md raíz y de cada repositorio, README.md, LOCAL-DEVELOPMENT.md y docs/continuidad-produccion-2026-09-29.md. Inspeccionar código vigente y estado Git antes de concluir qué se reutiliza. EverProp contiene Next.js/TypeScript, Laravel/PHP, MySQL y Redis; revalidar versiones y capacidades. La auditoría previa detectó pendientes en autorización de precios/publicación/batch, persistencia de visitas y preparación de release: no asumir que siguen abiertos ni que fueron resueltos.

Preservar archivos y datos reales, no abrir credenciales históricas, no imprimir secretos, no ejecutar pruebas contra inventario real. PHP/Composer dentro de Docker según AGENTS; MySQL aislado para integración si corresponde. Separar autorización para esta investigación de autorización para futuras acciones externas.

ORGANIZACIÓN DEL EQUIPO

Crear subagentes con responsabilidades y entregables delimitados, respetando concurrencia disponible; rotar roles cuando haga falta:
1. Producto/mercado: competidores, segmentos, propuesta de valor, build/buy y alcance comercial.
2. Arquitectura SaaS/backend: límites de dominios, modelo de datos, contratos y evolución de EverProp.
3. AI engineer/RAG: recuperación, herramientas, orquestación, memoria, evaluaciones y modelos.
4. Seguridad/integraciones: aislamiento, identidad, canales, secretos y abuso.
5. UX/QA: recorridos, estados, participación humana y aceptación.
6. SRE/FinOps: operación, fallos, costos, cuotas, observabilidad y recuperación.
El principal integra y resuelve contradicciones. Asignar archivos exclusivos cuando haya escritura paralela. Exigir una revisión independiente de arquitectura/seguridad antes del cierre. No simular agentes: indicar cuáles trabajaron y sus límites.

INVESTIGACIÓN COMPROBABLE

Investigar Darwin AI y comparar con Intercom Fin, Glean, una opción omnicanal y una alternativa abierta/autohospedable pertinentes. Investigar sus licencias y restricciones de redistribución/white-label cuando afecten build/buy. Usar fuentes primarias: documentación, API/OpenAPI, artículos de ingeniería, repositorios oficiales y precios publicados. Para cada afirmación registrar URL, fecha de consulta y tipo: funcionalidad documentada, descripción comercial, arquitectura publicada, inferencia o no verificado. Distinguir integración nativa de integración mediada por un tercero.

No usar mensajes como «sin errores», porcentajes de conversión o cantidad de conectores como hechos técnicos sin metodología. No afirmar que la cuenta social de la captura corresponde a un dominio sin verificar el vínculo; tomar getdarwin.ai como referencia funcional encontrada, indicando cualquier incertidumbre de identidad. No atribuir RAG, modelos, vector DB o microservicios a Darwin por intuición.

Verificar directamente en documentación oficial de cada canal: APIs disponibles, onboarding, revisión de aplicación, propiedad de números/cuentas, permisos, webhooks, plantillas, ventanas de mensajería, límites, precios y convivencia con aplicaciones existentes. Diferenciar fecha de anuncio y fecha efectiva de reglas. Si no se logra verificar una condición, marcarla pendiente en vez de completarla de memoria.

PRODUCTO Y ALCANCE

Definir recorridos completos: consulta entrante → identificación → búsqueda de propiedades → calificación → interés en CRM → solicitud/confirmación de visita → transferencia al asesor → seguimiento autorizado. Separar solicitud de cita de confirmación efectiva por calendario.

Comparar chat web y WhatsApp como primer canal, con criterios de valor, acceso y plazo; considerar Instagram/Messenger como expansión. Voz, campañas outbound, cobranzas, marketplace y editor visual avanzado no entran automáticamente en MVP: justificar su inclusión o diferirlos.

Diseñar bandeja compartida: responsables, asignación, no leídos, pendientes, filtros, etiquetas, notas internas, adjuntos, búsqueda y auditoría. Definir estados de conversación IA activa, esperando herramienta, esperando humano, humano activo y cerrada. Resolver mensajes simultáneos y toma de control humano: una respuesta IA ya en curso no debe enviarse después de que un asesor toma el control. Definir cómo reanudar y qué contexto se conserva.

SAAS EVERSYS Y PRIMER TENANT BELLOMO

Separar núcleo compartido (tenants, miembros, roles, canales, conversaciones, agentes, conocimiento, herramientas, consumo, auditoría) del módulo inmobiliario (propiedades, desarrollos, intereses y visitas) y de la configuración comercial de Bellomo. No introducir reglas Bellomo hardcodeadas en el núcleo.

Comparar tres alternativas: ampliar el monolito modular existente; plataforma conversacional separada integrada por API; base abierta/comercial con extensiones propias. Recomendar una con criterios ponderados, costo de cambio y señales para evolucionar. No imponer microservicios, Kubernetes o una reescritura sin evidencia.

Resolver organizaciones, membresías, RBAC/capacidades, soporte Eversys con acceso temporal auditado, onboarding/offboarding, branding configurable, configuración/versionado por tenant, conectores y secretos separados, suscripciones, cuotas, medición y exportación/borrado. Comparar DB compartida con tenant_id frente a esquemas/bases separadas; justificar.

El aislamiento debe cubrir SQL, índices documentales/vectoriales, archivos, cachés, jobs, trazas, conversaciones y herramientas. El tenant se deriva de identidad autenticada o asociación verificada del canal, nunca de instrucciones del modelo. Demostrar con un segundo tenant sintético cómo se incorpora otro cliente sin fork de código ni acceso a Bellomo. No fusionar identidades entre canales por similitud de nombre ni compartir personas entre tenants.

ARQUITECTURA IA Y RAG

Comparar baseline simple, búsqueda híbrida léxica/vectorial con reranking, contextual retrieval, recuperación mediante API, agentic RAG y GraphRAG. Elegir según consultas reales, complejidad, calidad, latencia y costo; distinguir técnicas combinables de arquitecturas completas. Justificar si un solo coordinador basta; no crear varios agentes de runtime por estética.

Separar documentos aprobados (RAG) de precio, moneda, disponibilidad y agenda (API vigente), y de operaciones que cambian estado (herramientas validadas). Definir ingestión, metadatos, versiones, vigencia, ACL, fuente, citas, borrado y propagación de cambios/revocaciones. No poner al modelo a inventar datos faltantes ni utilizar una respuesta hipotética como evidencia.

Definir memoria conversacional y comercial: fuente de verdad, campos permitidos, resumen, actualización, caducidad, corrección y minimización de datos. Distinguir memoria, historial y documentos. Diseñar límites de tokens, pasos, tiempo, reintentos y gasto; manejo de indisponibilidad del proveedor y derivación.

Describir contratos JSON/schema de herramientas como buscar_propiedades, consultar_propiedad, registrar_interes, solicitar_visita y derivar_a_asesor: identidad, permisos, entrada, salida, idempotencia, errores y trazabilidad. No SQL arbitrario del modelo. No confirmar éxito hasta tener respuesta persistida. Precios especiales, reservas vinculantes, contratos y movimientos monetarios requieren reglas explícitas y alcance aprobado.

Diseñar amenazas de prompt injection desde mensajes, PDFs y resultados de herramientas; aislamiento de instrucciones/datos, autorización fuera del modelo, validación de salidas y controles de exfiltración. No confiar en un segundo LLM como único control de seguridad. Mantener secretos y datos no autorizados fuera del contexto.

INGENIERÍA DE CANALES Y OPERACIÓN

Modelar mensajes normalizados sin perder IDs/eventos nativos, adjuntos, estados y referencias de campaña. Webhooks autenticados, ACK rápido tras persistencia, deduplicación, orden por conversación, reintentos/backoff, colas fallidas, replay y outbox transaccional. Evitar doble envío y doble alta; no prometer exactly-once distribuido sin describir sus límites.

Definir almacenamiento privado, URLs temporales, procesamiento seguro de archivos, observabilidad correlacionada por tenant/conversación/ejecución/herramienta, redacción de PII, retención, alertas y controles de abuso. Proponer SLO medibles como objetivos sujetos a validación, con timeouts, degradación, backup/restauración, RPO/RTO y recuperación de conectores revocados.

ECONOMÍA Y DECISIÓN COMERCIAL

Preparar escenarios bajo/base/alto con variables declaradas: clientes, conversaciones, mensajes, llamadas LLM, tokens, embeddings, reranking, documentos, almacenamiento, canales, soporte y observabilidad. Usar tarifas actuales con fuente/fecha o variables si no son públicas. Calcular costo por conversación y por tenant, margen objetivo, cuotas y consumo excedente; distinguir costo de software de trabajo de onboarding/soporte. Comparar construir/comprar/integrar. No inventar una fecha de entrega sin capacidad de equipo y dependencias externas.

EVALUACIÓN Y CRITERIOS DE SALIDA

Proponer dataset anonimizado y versionado de consultas Bellomo con respuestas/fuentes esperadas. Incluir español rioplatense, errores de escritura, código 12A/12B, moneda desconocida, propiedad retirada, documentos contradictorios, falta de evidencia, inyección, dos tenants, permisos revocados, eventos repetidos, caída del proveedor y toma de control humano durante generación.

Medir recuperación y generación por separado: recall@k/ranking, citas sustentadas, exactitud de campos, abstención, éxito real de herramientas, duplicados, fugas entre tenants, latencia p50/p95 y costo por tarea. Medir negocio con visitas confirmadas y oportunidades calificadas; no equiparar resolución automática con satisfacción. Definir evaluación humana y automática, gates por release, piloto en sombra, despliegue limitado y rollback. Objetivo obligatorio: cero fugas y escrituras no autorizadas en el conjunto de pruebas, sin afirmar que eso prueba riesgo cero universal.

ENTREGABLES OBLIGATORIOS

Guardar en docs/eversys-ai-saas/ y resumir las decisiones en el chat:
1. research.md: matriz competitiva y registro de fuentes/evidencias/desconocidos.
2. product-scope.md: usuarios, recorridos, MVP, límites, hipótesis y aceptación.
3. architecture.md: recomendación y alternativas, C4 contexto/contenedores, secuencias de mensajes/acciones/handoff y límites de confianza en Mermaid.
4. data-and-contracts.md: entidades, aislamiento, ownership, eventos, API y herramientas con ejemplos.
5. adr.md: decisiones, alternativas rechazadas, razones y condiciones para revisarlas.
6. evaluation-and-security.md: amenazas, casos de prueba, métricas, gates y operación.
7. economics.md: fórmulas, escenarios, tarifas comprobadas y sensibilidad.
8. implementation-backlog.md: épicas/tareas con dependencias, responsable, aceptación, pruebas y estimaciones por rango con supuestos; separar correcciones EverProp de nuevas capacidades SaaS.

Empezá con lectura del repositorio e investigación en paralelo mediante agentes. Hacé preguntas solo donde una decisión pendiente afecte materialmente el diseño; seguí con lo independiente y explicitá supuestos reversibles. Cerrá con una recomendación concreta, primer incremento demostrable, riesgos que bloquean producción y decisiones que Alvaro debe tomar. No declares listo lo que no fue probado.

## Fuentes iniciales verificadas en la preparación

- Darwin inmobiliario: https://www.getdarwin.ai/es/soluciones/inmobiliario
- Canales: https://help.getdarwin.ai/es/collections/15396555-canales
- Intervención humana: https://help.getdarwin.ai/es/articles/11160566-como-funciona-human-intervention-en-darwin-ai
- Intervención humana (URL inglesa comprobada): https://help.getdarwin.ai/en/articles/11160566-how-does-human-intervention-works-in-darwin-ai
- API: https://api.getdarwin.ai/
- Marketplace: https://help.getdarwin.ai/es/articles/14443370-marketplace-de-integraciones
- Integraciones mediadas por Albato: https://help.getdarwin.ai/en/articles/13485666-how-to-create-integrations-using-albato
- Intercom Fin: https://www.intercom.com/help/en/articles/9929230-the-fin-ai-engine
- Glean: https://docs.glean.com/connectors/connectors-power-glean
- Contextual Retrieval: https://www.anthropic.com/engineering/contextual-retrieval

Estas fuentes acreditan capacidades o patrones publicados, no la arquitectura interna completa de Darwin ni resultados comerciales independientes. Reconsultar fecha y vigencia al ejecutar el encargo.
