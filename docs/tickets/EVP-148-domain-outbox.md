# EVP-148: `domain_outbox` acumula eventos que nada consume

Rama `ticket/EVP-148-domain-outbox`, creada desde `develop` @ `57af421` · 2026-11-16 · Ramiro Ruggeri con Claude

## Problema

La auditoría QA de staging del 2026-11-12 encontró que `domain_outbox` acumula eventos en `PENDING` que ningún proceso consume. Antes de la auditoría había 140; la auditoría agregó 78 más. La tabla crecía sin límite. El ticket pedía decidir si el outbox se usa o no.

## Decisión

**Se sigue escribiendo y se purga.** La documentación responde la pregunta:
- **D10:** el outbox transaccional es parte del diseño, durable antes del ACK.
- **D20:** su consumidor previsto son los eventos firmados para n8n o webhooks salientes. Para eso ya existe la tabla de deduplicación `outbox_consumptions`.
- **Idempotencia:** hoy la tabla ya cumple esa función. `ConversationControl::reopen` guarda y lee ahí sus claves, y el índice único deduplica los eventos de webhook (`ProcessWebhookReceipt` con `insertOrIgnore`).

Dejar de escribirla rompería esas idempotencias y obligaría a reconstruir el historial cuando llegue el consumidor. Lo que faltaba era ponerle un límite.

## Cambios

- **`everprop:outbox:prune`** (`app/Console/Commands/PruneDomainOutbox.php`):
  - Borra eventos `PENDING`, `PUBLISHED` y `DEAD_LETTER` más viejos que la retención. Nunca toca `PROCESSING` ni `RETRY`.
  - **Borrado eficiente:** `created_at` no tiene índice, así que busca el límite de id una sola vez y después borra en lotes de 1.000 dentro de ese rango de la clave primaria.
  - **Fecha verificada por fila:** dentro del rango, la fecha se vuelve a comprobar en cada fila, así que un evento reciente con id bajo nunca se borra.
  - Rechaza retenciones menores a 7 días, porque reabrirían las ventanas de idempotencia (reintentos de reapertura y reenvíos de Meta).
- **Configuración:** `conversations.outbox_retention_days` (`OUTBOX_RETENTION_DAYS`, por defecto 30). Documentada y comentada en `environment.example`.
- **Programación:** todos los días a las 04:30, con `withoutOverlapping` y `onOneServer`.
- **Documentación:** `docs/eversys-conversations/data-and-contracts.md` explica el estado del outbox, la purga y lo que tiene que cambiar cuando exista un consumidor.

No hay forwards SQL ni cambios de esquema.

## Verificación

Stack aislado `everprop-rag` (PHP 8.4, MySQL 8.4), contenedor `everprop-rag-php148`. Test nuevo `tests/Feature/PruneDomainOutboxTest.php`:
- **Se borran:** eventos de dos tenants con 40 días en `PENDING`, 31 días en `PUBLISHED` y 90 días en `DEAD_LETTER`.
- **Quedan:** eventos de 29 días, de 1 día, en `PROCESSING` y en `RETRY`, más uno reciente con id mayor que los viejos.
- **Sin efecto la segunda vez:** una segunda corrida no borra nada.
- **Retención mínima:** se rechazan `--days=3` y una configuración de 6.
- **Programación:** el comando figura en el scheduler.

**Error encontrado y corregido por el test:** la primera versión borraba todo lo que tuviera id menor o igual al límite. Eso se llevaba eventos recientes con id menor que algún evento viejo. Ahora la fecha se verifica en cada borrado.

**Tiempo:** el comando tardó 22 ms y la búsqueda del límite 368 ms. Las demoras de los tests (unos 30 s) son del arranque del contenedor sobre un montaje de Windows, no de la purga.

- Pint PASS.
- PHPStan y suite completa: ver más abajo.

## Pendientes

- **Producción y staging:** la purga corre con el scheduler que ya está activo. La primera ejecución va a borrar lo acumulado de más de 30 días (en staging, los eventos de antes de la auditoría que superen esa edad).
- **Cuando exista un consumidor** (D20): la purga tiene que excluir lo que todavía no consumió. Está anotado en `data-and-contracts.md`.
- No es del módulo de IA.
