# EVP-L06 — Un ConversationConflict no se registra como error

Rama `ticket/EVP-L06-conflicto-no-es-error` (desde `develop`) · fecha 2026-10-12 · Claude Code con Ramiro Ruggeri
ID local provisorio (serie EVP-L autorizada por el PM).

## 1. Qué pedía el ticket

Problema: `ConversationConflict` es un rechazo de negocio esperado, por ejemplo:
- "otro asesor ya tiene el control";
- "pasaron 24 h en WhatsApp";
- la misma clave de idempotencia con otro contenido.

`render()` ya responde con un 409/404 en JSON, pero el handler de Laravel igual la registraba en el log con nivel `error`. Eso llena el log y dispara alertas falsas.

El WIP `3c2861e` (del 3/10, sin revisar) tenía el arreglo y un test a medio terminar.

**Criterio de aceptación:** un `ConversationConflict` no genera ninguna entrada de log, y la respuesta JSON no cambia.

## 2. Qué se implementó

- `ConversationConflict::report(): void {}`: con esto Laravel la considera reportada y no la escribe en el log ([ConversationConflict.php](../../everprop-api/app/Domain/Conversations/Exceptions/ConversationConflict.php)).
- Test `test_conversation_conflict_is_not_reported_as_an_error` en [HandoffAndDispatchTest.php](../../everprop-api/tests/Feature/Conversations/HandoffAndDispatchTest.php): reporta la excepción con el handler real y verifica que no se emita ningún `MessageLogged`.

## 3. Por qué esta solución

- Es una línea en la clase compartida, así que cubre a todos los que lanzan la excepción (`ConversationControl` y `InboundMessageService`). No hace falta tocar cada caller ni `bootstrap/app.php`.
- Los callers que la atrapan (coordinador, job y reconciliador) no cambian.
- Las fallas reales (`UNKNOWN`, errores de proveedor) usan otras excepciones y se siguen registrando.

## 4. Cómo se verificó

Entorno: stack Docker aislado `everprop-lote3` (PHP 8.4, MySQL 8.4, base sintética), 2026-10-12.

| Comprobación | Resultado |
|---|---|
| Test nuevo sin el arreglo | Falla, como se esperaba: el test detecta el bug |
| Test nuevo con el arreglo | Pasa |
| Suite backend completa | 331 tests, 0 fallos. Las "warnings" son el aviso conocido del runner sin `.env` |
| Pint y PHPStan | OK |

No se pidió revisión de aislamiento: el cambio no toca queries, datos ni permisos.

## 5. Pendientes y riesgos

- Ninguno. Si alguna vez se necesita contar estos rechazos, se agregan como métrica y no como error.
