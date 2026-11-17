# EVP-146: el rol de solo lectura y las conversaciones

Rama `ticket/EVP-146-solo-lectura-conversaciones`, creada desde `develop` @ `57af421` · 2026-11-16 · Ramiro Ruggeri con Claude

## Situación

Hallazgo SEC-10 de la auditoría QA de staging del 2026-11-12. Un usuario `READ_ONLY` ve todas las conversaciones del tenant, con nombre, teléfono y mensajes, pero no puede responder (403). El ticket pedía decidir si eso es intencional.

## Qué se encontró

- **Matriz de `docs/rbac.md`:** `READ_ONLY` tiene `viewAny` y `view` sin restricción de alcance, en todo el CRM.
- **Leads:** el rol ya veía todos los leads del tenant, con nombre, teléfono y email (`LeadAccessPolicy`).
- **Bandeja:** `AdminConversationController` ya decía que `READ_ONLY` ve todas las conversaciones. No era un error de código, sino el comportamiento diseñado y sin documentar.

## Decisión

El usuario lo decidió el 2026-11-16: **se mantiene y se documenta**. `READ_ONLY` es un supervisor de todo el tenant que lee todo y no puede cambiar nada.

## Cambios

- **`everprop-api/docs/rbac.md`:** sección nueva "Conversaciones (bandeja)", con:
  - la tabla de acceso por rol;
  - que la lectura de `READ_ONLY` no marca la conversación como leída;
  - la nota de que este acceso debe figurar en la política de privacidad del tenant.
- **`HandoffAndDispatchTest::test_conversation_access_per_role`:** fija el contrato con un caso por rol.
  - `TENANT_ADMIN`, `SALES_MANAGER` y `READ_ONLY` ven la conversación en la lista y sus mensajes.
  - El asesor dueño la ve; otro asesor recibe 404.
  - `ROTATOR` y `BOT_OPERATOR` reciben 403.
  - `READ_ONLY` recibe 403 al responder, dejar una nota, tomar la conversación, devolverla, cerrarla y crear el lead. No se crea ningún mensaje, no cambia el epoch y el contador de no leídos queda igual.

No cambia el código de la aplicación.

## Verificación

Stack aislado `everprop-rag` (PHP 8.4, MySQL 8.4), contenedor `everprop-rag-php146`.

- `HandoffAndDispatchTest`: 12 passed (112 assertions).
- Pint PASS y PHPStan sin errores.
- Suite completa: **604 passed, 1 skipped** (5717 assertions). Una corrida anterior tuvo 1 falla intermitente que no se repitió; por la duración y la cantidad de asserts, coincide con la carrera conocida de `WhatsAppParallelQueueTest` (también apareció en el CI de #133 y #137). No tiene relación con este cambio.

## Pendientes

- **Política de privacidad del tenant:** tiene que mencionar que el rol de solo lectura accede a las conversaciones con los clientes. Le corresponde a quien lleva la parte legal o comercial, no a este ticket.
- **Si más adelante se quiere restringir:** la opción evaluada fue una bandeja sin mensajes (lista y metadatos, con 403 en mensajes, adjuntos y traza). Requiere un ticket nuevo, porque cambia este contrato.
