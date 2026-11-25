# EVP-L200 — Derivación persistida después de consultar inventario

Rama `ticket/EVP-L200-derivacion-persistida`, desde `develop` `9b7259e`. Fecha: 2026-11-25.

## Autorización y alcance

Ramiro autorizó expresamente el ID provisional EVP-L200 en el chat para corregir la derivación, en una rama independiente y sin producción. Aplica la excepción de TICKETS.md; no se creó un ticket en Jira (el conector no tiene sesión). No se autoriza cerrar EVP-193/197 ni aprobar release.

## Problema

Después de consultar inventario, el coordinador deshabilitaba las herramientas en su segunda llamada. El modelo podía prometer una derivación, pero no ejecutarla; el estado persistido seguía AI_ACTIVE. Cambiar solamente el texto del prompt no habilita la acción.

## Cambio

- Después de herramientas exclusivamente de consulta, la segunda llamada puede responder o ejecutar una sola `derivar_a_asesor`.
- Conserva el máximo de dos llamadas normales al modelo y el presupuesto acumulado de herramientas. No hay tercera llamada para despedirse.
- Reutiliza ToolGateway, ToolContext y ConversationControl: validación cerrada, tenant/epoch del servidor, entrega y transición bajo el control existente. Una llamada terminal inválida termina en el fallback de error, sin ejecutar otra mutación.
- Copilot, visitas, altas de contacto/interés y presupuesto agotado no reciben herramientas terminales. Se conserva el acuse de visita pendiente.
- Gemini recibe los resultados de herramientas que ya no están ofrecidas como texto saneado, manteniendo JSON_HEX_TAG y la protección de EVP-108. El mensaje de continuación reconoce la herramienta terminal; no dice falsamente que no hay herramientas.
- Se adapta la comprobación de payload de WhatsApp para exigir únicamente la derivación, sin reintroducir functionCall/functionResponse históricos de búsqueda.

Archivos: AgentCoordinator.php, GeminiChatClient.php, AgentTurnTest.php, GeminiChatClientTest.php y WhatsAppGeminiFlowTest.php. Sin cambios SQL, variables, dependencias ni configuración remota.

## Verificación

- Reproducción inicial: dos regresiones fallaron antes del cambio. Tras corregir, 5 pruebas/46 aserciones pasan: derivación persistida, consulta ordinaria, mutación terminal prohibida, argumento tenant inyectado, presupuesto y acuse de visita.
- El revisor detectó que habilitar la herramienta tras una visita rompería su acuse. Caso reproducido y corregido restringiendo el flujo a consultas.
- El revisor detectó una instrucción contradictoria en Gemini; se corrigió y se añadió comprobación del payload.
- Revisión independiente de aislamiento: sin hallazgos accionables. Revisión de seguridad IA: los hallazgos anteriores se corrigen antes de entregar.
- Resultados integrados finales: pendientes de la corrida en curso; no interpretar pruebas parciales como certificación del sistema completo.

## Pendientes y riesgos

El cambio habilita una acción real, pero no garantiza que el modelo la elija siempre. Persisten otros problemas de producto/evaluador: filtros inventados de búsqueda, requisitos de visitas incompletos, datos sensibles y expectativas incompatibles con reglas de producto. No se ocultan modificando umbrales.

No se desplegó ni se enviaron mensajes reales. Antes de producción siguen pendientes forwards SQL/schema_versions, dominios, CORS/R2, tenant_domains/Sanctum/cookies, credenciales/permisos, base y storage. Las pruebas locales no validan esos accesos.
