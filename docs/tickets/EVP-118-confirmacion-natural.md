# EVP-118 — Confirmación de datos con lenguaje natural

Rama `ticket/EVP-118-confirmacion-natural` · Base `eb3951a` · Responsable en Jira Mauro

## 1. Qué pedía el ticket

Hacer más naturales el pedido de confirmación y el mensaje de cierre del asistente. El resumen debía mostrar los datos disponibles y conservar el consentimiento explícito antes de registrar la consulta.

## 2. Qué se implementó

- [ContactConfirmation](../../everprop-api/app/Domain/AgentRuntime/Tools/ContactConfirmation.php) adapta la pregunta al teléfono, correo o ambos. Omite campos vacíos y explica que responder «sí» o «Confirmo mis datos» autoriza guardar la consulta.
- [AgentCoordinator](../../everprop-api/app/Domain/AgentRuntime/Coordinator/AgentCoordinator.php) usa un mensaje de cierre más cercano después de que la herramienta registra la consulta.

## 3. Por qué esta solución

La aplicación construye el resumen de forma determinista y conserva el escape de los campos. La misma lógica verifica que se haya enviado el resumen, valida la respuesta y registra los datos que se mostraron. Si el cliente corrige un dato, debe confirmar el resumen actualizado.

## 4. Cómo se verificó

En Docker con PHP 8.4, MySQL 8.4 sintético y el modelo simulado, los tres casos de confirmación reprodujeron el texto anterior antes del cambio. La revisión independiente de seguridad verificó el escape, el consentimiento y el orden de guardado. Su observación sobre explicar el efecto de responder «sí» se corrigió y se verificó de nuevo.

PHPUnit ejecutó `tests/Feature/AgentRuntime`, `tests/Unit/AgentRuntime` y `tests/Feature/Conversations/WhatsAppGeminiFlowTest.php` sobre la versión final. Pasaron 123 pruebas y 1065 aserciones.

## 5. Pendientes y riesgos

Validar el texto en una conversación de Instagram de prueba en staging después de integrar el cambio. La implementación no requiere cambios de esquema ni credenciales.
