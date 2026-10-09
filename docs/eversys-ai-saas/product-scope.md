# Eversys Conversations — alcance propuesto

Fecha: 2026-09-29. Estado: diseño para revisión; ningún componente nuevo implementado. Nombre de trabajo, no marca registrada ni decisión comercial definitiva. Bellomo es el primer tenant; el segundo será una inmobiliaria sintética en pruebas. Responsable de decisiones de negocio: Alvaro.

## Recomendación ejecutiva

Construir un núcleo conversacional propio dentro del monolito modular EverProp, con un módulo inmobiliario conectado a servicios de dominio. Aprovechar esquema, permisos e integraciones existentes después de corregir sus riesgos. Decisión expresa de Alvaro: **web y WhatsApp en el mismo piloto, techo mensual USD 150**. Ambos son requisito de aceptación del piloto público; el alta oficial de WhatsApp sigue siendo dependencia, no se reemplaza silenciosamente por web. Instagram/Messenger después. Un coordinador IA, herramientas tipadas y RAG léxico de documentos aprobados al inicio; precio y disponibilidad siempre del dominio operativo. Recuperación híbrida se habilitará solo si la evaluación justifica su costo.

La propuesta es configurable por tenant, no un clon de Bellomo. Configuración comercial, marca, horarios y contenido pertenecen a Bellomo; lógica conversacional, medición y conectores pertenecen al producto Eversys. No se asume derecho a reutilizar contenido de Bellomo en otro cliente.

## Supuestos explícitos y preguntas

Alvaro confirmó ambos canales y USD 150 mensuales. Capacidad del equipo todavía no definida. Para calcular se trata USD 150 como operación de software; desarrollo, onboarding y trabajo humano se informan por separado y no se presumen incluidos. Si el monto debe cubrir también esos trabajos, el alcance no está financiado con la evidencia disponible. Supuestos reversibles: atención inbound, idioma español rioplatense, un coordinador por conversación, sin cobros ni reservas vinculantes. Decisiones necesarias antes de piloto público: quién aprueba documentación/precios/moneda; asesores y horario real; región y tratamiento de datos; cuentas Meta; acuerdo comercial. No bloquean esta documentación.

## Personas y capacidades

| Persona | Objetivo | Acceso |
|---|---|---|
| Visitante | Encontrar propiedad y contactar un asesor | Solo ficha/documentación aprobada pública; su conversación y solicitudes |
| Asesor Bellomo | Continuar oportunidad con contexto | Conversaciones asignadas y alcance de inventario autorizado |
| Responsable Bellomo | Distribuir atención y aprobar conocimiento | Gestión del tenant según capacidades actuales extendidas explícitamente |
| Administrador Eversys | Provisionar, medir y operar SaaS | Metadatos operativos; acceso a contenido solo temporal, autorizado y auditado |
| Revisor QA | Evaluar respuestas y errores | Datos sintéticos/anonimizados; sin credenciales o acceso universal |

No crear un sistema RBAC paralelo. Mapear nuevas capacidades en Identity y conservar users.role_code/scopes; el usuario actual pertenece a un tenant. Identidad multi-organización con SSO será una evolución, no se simula como existente.

## Recorridos y aceptación

1. **Descubrir:** visitante entra desde web/proyecto. Sesión opaca vinculada en servidor al tenant y canal; no confundir nombre con identidad verificada. Pregunta natural → filtros → propiedades públicas. Criterio: código 12A no se confunde con 12B; precio sin moneda aparece como no confirmado; propiedad retirada no aparece por caché vieja.
2. **Calificar:** solicitar solamente zona, presupuesto con moneda, tipo, plazo y datos de contacto necesarios. Criterio: campos conocidos no se preguntan repetidamente, usuario puede corregirlos, no se obliga a inventar presupuesto.
3. **Registrar interés:** confirmar contacto/datos necesarios, vincular propiedad mediante servicio autorizado. Criterio: replay o doble clic devuelve misma operación, recarga recupera el interés; fallo parcial no se anuncia como éxito.
4. **Solicitar visita:** registrar preferencias horarias y zona America/Argentina/Buenos_Aires, almacenar UTC. Criterio: resultado REQUESTED se expresa «solicitud enviada»; solo BOOKED con operación/slot confirmado puede expresarse «confirmada». No equiparar un registro en visits con disponibilidad validada de calendario.
5. **Transferir:** registrar motivo, resumen, fuentes, intereses y preguntas pendientes; pausar IA y asignar. Criterio: asesor ve quién pidió ayuda y en qué estado quedó cada operación, sin duplicar mensajes. Mostrar pendiente si nadie está disponible.
6. **Retomar:** el asesor decide reactivar IA o cerrar. Criterio: se incrementa versión de control; generación anterior descartada, memoria no incorpora notas internas como contenido público.
7. **Seguimiento:** inicialmente tarea para el asesor. Mensaje outbound automatizado queda fuera del piloto hasta verificar consentimiento, ventana y plantillas por canal.

## Bandeja operativa MVP

Lista paginada por tenant, búsqueda por contactos/conversación, filtros por asignado/estado/no leído/pendiente/canal, etiquetas, última actividad y tiempo pendiente. Detalle con mensajes y estados queued/sending/sent/delivered/read/failed/unknown cuando el canal los soporte; referencias de propiedad y notas internas claramente separadas. Composer indica quién controla la conversación; toma de control manual transaccional, no solo botón visual. Adjuntos iniciales: documentos aprobados salientes y entradas en cuarentena; formatos y tamaño limitados. No habilitar OCR o audio generativo por defecto.

Objetivos UX: teclado, foco al cambiar conversación, etiquetas accesibles, errores recuperables, vista móvil, contraste; indicador accesible de actualización. No afirmar que son recorridos ya desarrollados.

## Máquina de estados de producto

AI_ACTIVE → WAITING_TOOL mientras una ejecución opera; finaliza en AI_ACTIVE o WAITING_HUMAN. WAITING_HUMAN → HUMAN_ACTIVE al aceptar un asesor. HUMAN_ACTIVE → AI_ACTIVE solo por reanudación explícita. Cualquier estado → CLOSED por cierre autorizado. Mensaje nuevo en CLOSED puede reabrir según configuración, manteniendo historial y nuevo epoch. Los nombres finales de persistencia deben mapearse al esquema existente en data-and-contracts.md.

La interfaz distingue «pausa solicitada» de «control humano confirmado». Un envío ya entregado al proveedor no puede revocarse por cambiar un estado en la base; el protocolo de envío y las incertidumbres están en architecture.md.

## Canal inicial: decisión comparada

Puntajes 1–5; pesos de esta propuesta, no datos de mercado.

| Criterio | Peso | Web | WhatsApp |
|---|---:|---:|---:|
| Tiempo técnico hasta piloto controlado | 30% | 5 | 2 |
| Control de identidad/UX y pruebas | 25% | 5 | 3 |
| Alcance comercial supuesto Bellomo | 30% | 2 | 5 |
| Dependencias externas y costo | 15% | 5 | 2 |
| Total | 100% | 4.10 | 3.20 |

Esta comparación fue la recomendación inicial de secuencia, superada por decisión explícita del usuario: ambos en piloto. Web puede usarse como incremento interno mientras se procesa alta Meta, pero eso no acredita piloto completo. Mantener adaptadores comunes y pruebas independientes por canal; el presupuesto limita volumen y servicios auxiliares, no elimina aislamiento o autorización.

## Núcleo, módulo, configuración

| Núcleo SaaS Eversys | Módulo inmobiliario | Configuración Bellomo |
|---|---|---|
| Tenant, capacidades, canal, mensajes, turnos, handoff, conocimiento, auditoría, consumo | Buscar unidades, datos de proyecto, intereses CRM, solicitudes de visita | Marca, tono, horarios, asignación, materiales, moneda confirmada y políticas comerciales |

Onboarding administrado en MVP: crear tenant → dominio autorizado → usuarios/roles → contenido aprobado → límites y plan → canal de prueba → evals → habilitación controlada. Segundo tenant sintético debe funcionar con mismas rutas y artefacto de aplicación. Alta autoservicio y facturación automática se difieren; entitlements y medición sí se construyen desde el inicio.

## Fuera del MVP

Voz, campañas masivas, cobranzas, descuentos automáticos, contratos, reservas vinculantes, editor no-code generalista, marketplace de conectores y GraphRAG. No se declara que EverProp los tenga operativos por la existencia de tablas. Plataforma general para otros sectores: interfaces preparadas, sin desarrollar módulos ficticios antes de validar inmobiliarias.

## Resultados comerciales a medir

Conversión a oportunidad calificada = oportunidades que cumplen definición acordada / conversaciones elegibles; visitas confirmadas / solicitudes; tiempo a primera atención humana; abandono por falta de respuesta; exactitud de datos y satisfacción revisada. Separar atribución de canal, bot y asesor. La disponibilidad 24/7 del software no implica atención humana 24/7 ni ventas garantizadas. Registrar línea base antes del piloto y revisar semanalmente contra muestra humana.

## Primer incremento demostrable

Primer incremento interno: entorno aislado, Bellomo sintético + segundo tenant sintético; chat web y simulador de webhooks WhatsApp → consulta inventario de prueba → respuesta con fuente → interés idempotente → handoff. Pruebas cruzadas de tenant y mensaje duplicado incluidas. Para aceptar el piloto se exige además E2E con número oficial de prueba/autorizado WhatsApp y después habilitación limitada de Bellomo, con permisos y gasto verificados. Simulador no equivale a integración real. Ninguna de esas conexiones se ejecuta en esta fase de diseño.

## Guía de lectura

[Investigación](research.md) · [Arquitectura](architecture.md) · [Contratos](data-and-contracts.md) · [Decisiones](adr.md) · [Seguridad y evaluación](evaluation-and-security.md) · [Economía](economics.md) · [Backlog](implementation-backlog.md).
