# EVP-129 — Leads: deadlock en contact_identities pierde leads con altas simultáneas (HTTP 500)

Rama `ticket/EVP-129-deadlock-contact-identities` (desde `develop` `4422bc3`) · sin commits todavía · fecha 2026-11-14 · autor: Claude (agente) para Ramiro Ruggeri

## 1. Qué pedía el ticket

Con 50 envíos simultáneos de `POST /api/v1/public/leads` (personas distintas), 1 de 50 respondía 500 por
`SQLSTATE[40001]: 1213 Deadlock` al insertar en `contact_identities` y el lead se perdía. Afecta todo lo que pasa por
`ContactIdentityResolver::resolve`: formulario web (`PublicLeadService`), inicio de chat web
(`PublicChatController::start`) y mensajes entrantes de Meta (`InboundMessageService`).

Criterios de aceptación:

1. 50 y 100 altas simultáneas de personas distintas → 100 % éxito y 0 duplicados.
2. 10 altas simultáneas de la misma persona → 1 contacto y 1 identidad.
3. Test de concurrencia o de reintento en la suite.

Además: evaluar el bloqueo de `channel_accounts` en `InboundMessageService::lockOrCreateConversation`.
Fuera de alcance: cambios de esquema, otros endpoints, staging.

## 2. Qué se implementó

- `everprop-api/app/Domain/CRM/Services/ContactIdentityResolver.php:80-85` — **causa raíz.** La búsqueda de la identidad
  ya no hace `SELECT … FOR UPDATE` sobre una clave que no existe. Primero una lectura simple (`exists()`, lectura
  consistente sin bloqueos); solo si la identidad existe se la bloquea con `lockForUpdate()` (igualdad sobre la clave
  única completa de una fila existente = bloqueo de registro, sin gap). Si no existe, se insertan contacto e identidad
  directamente y la clave única `uq_contact_identities_provider (tenant_id, channel_type, provider_scope_id,
  provider_user_id)` resuelve la carrera.
- `everprop-api/app/Domain/CRM/Services/ContactIdentityResolver.php:25-58` — `resolve()` reintenta la **transacción
  completa**, como máximo 5 intentos (`MAX_ATTEMPTS`, línea 13), según el código MySQL (`errorInfo[1]`):
  - 1062 (perdió la carrera de la misma persona): la transacción se revirtió entera (también el contacto recién
    insertado); el reintento encuentra la identidad ganadora y sigue por el camino "existente". Reemplaza el fallback
    anterior que hacía una segunda transacción solo de lectura.
  - 1213 (deadlock): red de seguridad, espera aleatoria de 5–25 ms × intento. Antes `DB::transaction(..., 3)`
    reintentaba 3 veces sin espera.
  - 1205 (lock wait timeout): **un solo reintento** (`:32`, `:53`), para que un request público no quede colgado
    varios `innodb_lock_wait_timeout` seguidos.
  - **Dentro de una transacción del llamador no se reintenta nada** (`$nested`, `:31`, `:50`): con 1213 InnoDB ya
    revirtió la transacción entera y Laravel lanza `DeadlockException`; con 1062 o 1205 Laravel solo vuelve al
    savepoint y la foto REPEATABLE READ del llamador no cambia, así que todos los reintentos verían lo mismo. El error
    sube al llamador. Hoy ningún llamador anida la resolución (los tres la llaman antes de su propia transacción).
- `everprop-api/tests/Unit/CRM/ContactIdentityConcurrencyMySqlTest.php` (grupo `mysql`, nuevo; dos tenants
  sintéticos que limpia en `tearDown`):
  - `:64` N leads simultáneos de personas distintas por `PublicLeadService::submit` con procesos reales
    (`pcntl_fork`, una conexión MySQL por proceso, salida simultánea; N=50, `CONTACT_LOAD_N=100` sube la ráfaga).
    Verifica 0 errores y exactamente N contactos, identidades, leads y touchpoints.
  - `:85` 10 resoluciones simultáneas de la misma persona → 1 contacto y 1 identidad.
  - `:103` negativo cross-tenant concurrente: 10 procesos resuelven `Same@ex.test`, pares en el tenant A e impares en
    el B → 1 contacto y 1 identidad por tenant, `contact_id` distintos y `contacts.tenant_id` igual al de su identidad.
  - `:120` el mismo, secuencial, con `WEB_CHAT` y el mismo `provider_user_id` en ambos tenants (A, B, A).
  - `:134` deadlock inyectado (`beforeExecuting`) en el primer insert de identidad → se reejecuta todo (2 inserts),
    sin contacto huérfano. Comprobado que falla con `MAX_ATTEMPTS = 1`.
  - `:146` 1205 permanente → se reintenta una sola vez (2 inserts) y sube. Comprobado que falla sin el tope.
  - `:160` deadlock dentro de una transacción del llamador → `DeadlockException`, 1 insert, sin contacto.
  - `:174` 1062 dentro de una transacción del llamador → se relanza en el primer intento (1 insert). Comprobado que
    falla sin la guarda `$nested` (5 intentos).
  - `:251` si `pcntl_fork()` devuelve -1, espera a los hijos ya lanzados y falla con `fork failed`.

Sin cambios de esquema, configuración ni variables.

Flujo: llamador → `resolve()` → transacción: lectura simple de identidad → (existe) bloquea identidad y contacto por
fila y actualiza `last_seen_at`/campos vacíos · (no existe) inserta contacto + identidad → commit. Ante 1062 o
deadlock (o un primer 1205), nueva transacción desde cero, salvo que la resolución corra dentro de una transacción
del llamador. Los efectos del llamador (lead, touchpoint, outbox, notificaciones,
conversación) ocurren después de `resolve()` y en su propia transacción, así que el reintento no los duplica.

## 3. Por qué esta solución

- **Causa:** con dos altas de personas distintas, ambas transacciones hacían `FOR UPDATE` sobre una clave inexistente
  en el mismo hueco del índice único y obtenían gap locks compatibles entre sí; después, el `INSERT` de cada una
  pedía un insert intention lock bloqueado por el gap lock de la otra → deadlock. Se elimina el gap lock en el lugar
  compartido (el resolver), que arregla a los tres llamadores a la vez.
- **Evidencia de que el fix de raíz alcanza solo:** con únicamente el cambio de la lectura (sin el bucle de
  reintento), 6 corridas de 50/100 dieron 0 errores. El reintento con jitter queda como red de seguridad para el caso
  residual conocido de InnoDB (3+ inserciones de la misma clave cuando la primera se revierte) y para cargas mayores.
- **Reutilizado:** el manejo de anidamiento de `ManagesTransactions` de Laravel y la clave única existente del
  baseline. Los errores se distinguen por código MySQL (1062/1213/1205) porque cada uno tiene una política distinta.
- **Alternativas descartadas:**
  - `insertOrIgnore` de la identidad: necesita el `contact_id` (FK) antes de insertar, así que obligaba a insertar un
    contacto especulativo y borrarlo si la identidad ya existía. Insertar directo y dejar que el 1062 revierta toda la
    transacción logra lo mismo sin borrados.
  - Solo reintentar: esconde el problema y suma latencia bajo carga.
  - `READ COMMITTED` por sesión: cambia el aislamiento de todo lo que corra en esa transacción; más riesgo que
    beneficio.
- **`channel_accounts` en `lockOrCreateConversation`: no se cambió.** Bloquea una fila **existente** por clave primaria
  (bloqueo de registro, sin gap): serializa la creación de conversaciones nuevas del mismo canal, pero no genera el
  patrón de deadlock del ticket. Prueba de carga temporal (eliminada después) con procesos reales sobre un mismo canal
  de WhatsApp, mezclando conversaciones nuevas, conversaciones existentes y altas de chat web
  (inserción de conversación sin ese bloqueo):

  | Ráfaga | Corridas | Errores | Duración ráfaga | Conversaciones / mensajes |
  |---|---|---|---|---|
  | 50 | 3 | 0 | 1,76–1,99 s | 50 / 63 (esperado) |
  | 100 | 3 | 0 | 1,99–2,73 s | 100 / 125 (esperado) |

  El costo es serialización por canal (latencia, no errores); si en el futuro molesta, se puede revisar en otro ticket.

## 4. Cómo se verificó

Entorno: contenedor `everprop-rag-php129` (PHP 8.4) sobre `C:\w129\everprop-api`, MySQL 8.4 `bellomo_crm_test`,
procesos concurrentes reales con `pcntl_fork` (4 CPU). Se llama al servicio, no al endpoint HTTP: la capa HTTP no
toca estas tablas.

Carga (`CONTACT_LOAD_N=<n> php artisan test --filter=ContactIdentityConcurrencyMySqlTest`):

| Escenario | Antes del fix (código de `develop`) | Después del fix |
|---|---|---|
| 50 personas distintas | 7 corridas: 0, 3, 3, 2, 3, 2, 3 fallos (1213 en `insert into contact_identities`) | 6 corridas (3 solo con la lectura, 3 con todo): 0 fallos, 50/50 contactos, identidades, leads y touchpoints |
| 100 personas distintas | 7 corridas: 1, 3, 4, 3, 4, 3, 4 fallos (1213 en el mismo insert) | 6 corridas: 0 fallos, 100/100 |
| 10 de la misma persona | 1 contacto, 1 identidad | 1 contacto, 1 identidad (en cada una de las corridas anteriores) |

### Revisión `tenant-isolation-reviewer` (independiente, 2026-11-14)

Sin hallazgos bloqueantes ni altos: aislamiento por tenant y causa raíz correctos. Hallazgos y qué los cerró:

| Hallazgo | Severidad | Cambio |
|---|---|---|
| Falta prueba negativa con dos tenants | Medio | Tests `:103` (ráfaga concurrente A/B con `Same@ex.test`) y `:120` (secuencial `WEB_CHAT`); `tearDown` limpia ambos tenants |
| El 1062 dentro de una transacción del llamador se reintentaba 5 veces con la misma foto REPEATABLE READ (inútil) | Medio | Guarda `$nested` en `ContactIdentityResolver.php:31,50`; comentario `:25-30` corregido (con 1205 InnoDB no revierte la transacción del llamador, Laravel vuelve al savepoint); test `:174` |
| 1205 reintentado hasta 5 veces podía colgar un request público varios minutos | Menor | 1213 hasta 5 intentos, 1205 una sola vez (`:32,49,53`); test `:146` |
| Fork fallido no se detectaba | Menor | `:251` falla con `fork failed` |

La versión anterior de este informe decía que, dentro de una transacción del llamador, no había reintento porque
Laravel lanza `DeadlockException`: era cierto solo para 1213/1205, no para 1062. Quedó corregido arriba.

Tests nuevos tras la revisión: `ContactIdentityConcurrencyMySqlTest` **8 passed (37 assertions)**.

**Staging:** el script `.qa/qa-staging-bellomo-2026-11-12/scripts/weblead.mjs` **no existe en el repo**, no se pudo
documentar su uso. Para repetir en staging hace falta ese script (o equivalente: N `POST /api/v1/public/leads`
simultáneos con personas e `Idempotency-Key` distintos) y comprobar 100 % 201 y conteos de `contacts`,
`contact_identities` y `leads` iguales a N para el tenant de prueba. No se tocó staging.

Resultados finales (mismo contenedor, 2026-11-14):

- Carga tras la revisión (`CONTACT_LOAD_N=<n> --filter=simultaneous`, incluye la ráfaga de dos tenants y la de
  la misma persona): 3 corridas de 50 y 3 de 100, las 6 con `3 passed (17 assertions)`, 0 fallos.
- `php artisan test` (suite completa, tras la revisión): **581 passed, 1 skipped (5549 assertions), 191,29 s.**
  Antes de la revisión: 577 passed, 1 skipped (5524 assertions).
- `vendor/bin/pint --test` sobre los dos archivos tocados: PASS.
- `vendor/bin/phpstan analyse --memory-limit=1G`: `[OK] No errors`.

## 5. Pendientes y riesgos

- Prueba en staging con el script de QA (no está en el repo) después del despliegue.
- Fuera de alcance (ticket aparte, señalado también por la revisión):
  - `InboundMessageService::accept` (`:41-46`) relee el id de la identidad con `trim($senderProviderId)` sin la
    canonicalización del resolver (minúsculas para `EMAIL`); hoy no afecta a WhatsApp/Meta/chat web, pero son dos
    fuentes de verdad. Propuesta: que `resolve()` devuelva también el id de la identidad.
  - `contacts.email` se guarda tal como llega (sin pasar a minúsculas), aunque la identidad `EMAIL` sí se normaliza.
  - Los teléfonos no se normalizan a E.164 antes de guardarse en `contacts.phone_e164` ni de usarse como identidad.
- `channel_accounts` serializa la creación de conversaciones por canal (ver sección 3): sin errores en la prueba,
  revisar solo si aparece latencia en ráfagas de WhatsApp.
- El test de carga necesita `pcntl` y MySQL; sin `pcntl` los dos tests de ráfaga se saltean (los de reintento corren
  igual).
