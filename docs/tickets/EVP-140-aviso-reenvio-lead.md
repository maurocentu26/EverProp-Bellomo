# EVP-140: aviso de "nuevo lead" al reenviar el formulario

Rama: `ticket/EVP-140-aviso-reenvio-lead`, creada desde `develop` @ `57af421` · 2026-11-15 · Ramiro Ruggeri con Claude

## Problema

Hallazgo CAP-04 de la auditoría QA de staging del 2026-11-12. Una persona con un lead abierto vuelve a mandar el formulario con otra `Idempotency-Key`. La API reutiliza ese lead (`lead_created: false`) y le agrega un touchpoint, que es lo correcto. Pero `PublicLeadService` le avisaba al asesor «Nuevo lead web asignado», como si el lead fuera nuevo.

## Cambio

En `PublicLeadService::submit`, el aviso al asesor del lead depende de `lead_created`:

| Caso | `event_type` | Título | Mensaje |
|---|---|---|---|
| Primera alta | `LEAD_CREATED` | Nuevo lead web asignado | Ha ingresado un nuevo lead web: '{nombre}' |
| Reenvío con el lead abierto | `LEAD_RECONTACT` | Nueva consulta web de un lead | '{nombre}' volvió a escribir desde la web |

`LEAD_RECONTACT` empieza con `LEAD_`. La campana del panel (`notification-tray.ts`) lo clasifica como "Leads", en "Para mí", sin tocar el frontend.

### Otros avisos que se revisaron

- **Lead creado desde el chat** (`ConversationControl`): ya avisaba solo si el lead era nuevo (`$notify && $lead['created']`).
- **Alta manual** (`AdminLeadController::store`): siempre crea un lead.
- **Reasignaciones:** usan sus propios tipos de evento.

Ninguno necesitaba cambios.

## Verificación

Stack aislado `everprop-rag` (PHP 8.4, MySQL 8.4), contenedor `everprop-rag-php140`.

- **Test nuevo** `tests/Feature/CRM/PublicLeadRecontactNotificationTest.php`: sobre el procedimiento real con un pool de asignación, dos envíos del mismo contacto con distinta `Idempotency-Key` devuelven el mismo lead (`lead_created` true y después false). El asesor recibe un `LEAD_CREATED` y un `LEAD_RECONTACT` con el título, el mensaje y el enlace al lead esperados. Sin el cambio, el segundo aviso sería otro `LEAD_CREATED` y el test falla.
- **Tests relacionados:** `PublicLeadEndpointTest`, `DeletedLeadReentryTest` y `PublicLeadServiceMySqlTest` pasan.
- **Pint:** PASS.
- **PHPStan:** sin errores.
- **Suite completa:** **604 passed, 1 skipped** (5700 assertions).

## Revisiones

No se cambian consultas, permisos ni datos persistidos, solo el texto y el tipo del aviso al mismo destinatario. Por eso no hizo falta la revisión de aislamiento.

## Pendientes

- **Producción:** antes de pasar a `main` hay que verificar los accesos del entorno de producción. No hay forwards SQL ni variables nuevas. Este cambio no es del módulo de IA, así que puede ir a `main` con el resto de los arreglos de leads.
