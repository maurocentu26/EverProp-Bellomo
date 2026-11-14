# EVP-135 — Leads: el alta manual reusa el contacto y normaliza el teléfono

Rama `ticket/EVP-135-alta-manual-contacto` (desde `develop` @ `4422bc3`) · fecha 2026-11-14 · autor Claude y Mauro Centurión · sin commit todavía

## 1. Qué pedía el ticket

Hallazgo P2-5 de la auditoría `QA_STAGING_BELLOMO.md` (CAP-13 y CAP-14). `AdminLeadController::store` insertaba el contacto y el lead directo en la base:

- **Duplicados:** dos envíos iguales (doble clic o reintento) creaban 2 contactos y 2 leads.
- **Teléfono:** se guardaba como se escribía (`11 5555-0000`) en `contacts.phone_e164`.
- **Identidad:** no creaba `contact_identities`, así que el formulario web o WhatsApp no reconocían a la persona.
- **Origen y reintentos:** no aceptaba `Idempotency-Key` y el origen por defecto era `WEB_FORM`.
- **`update`:** tampoco normalizaba el teléfono.

## 2. Qué se implementó

**API**

- **`App\Domain\CRM\Support\PhoneNumber::e164()`** (nuevo). Por defecto toma Argentina (+54):

  | Se escribe | Se guarda |
  |---|---|
  | `11 5555-0000` | `+541155550000` |
  | `0351 422-1234` | `+543514221234` |
  | `+54 9 11 5555-0000` y `5491155550000` | `+5491155550000` |
  | `0054 …` | `+54…` |
  | otros países con `+` | `+` y los dígitos |

  Si el número es ambiguo o inválido, devuelve `null` y la API responde **422** con un ejemplo de cómo escribirlo:
  - un celular local con «15» (`0388 15 412-3456`), porque no se sabe dónde termina el código de área;
  - un número sin código de área.
- **`store`:**
  - **Normalización:** el teléfono pasa por `PhoneNumber` y el email se guarda en minúsculas.
  - **Contacto:** con teléfono o email, se resuelve con `ContactIdentityResolver` (identidad `PHONE`, o `EMAIL` si no hay teléfono), igual que el formulario web y WhatsApp. Sin teléfono ni email se crea un contacto nuevo, como antes, porque no hay con qué compararlo.
  - **Lead ya abierto:** si el contacto ya tiene uno, se devuelve ese con **200** y `duplicate: true` («Este contacto ya tiene un lead abierto»), y no se crea otro. Si dos envíos llegan a la vez, el segundo choca con `uq_leads_single_open_contact` y recibe el lead del primero.
  - **Lead de otro asesor:** si el lead abierto lo sigue otro asesor y quien da el alta es un asesor, responde **409 `LEAD_OF_ANOTHER_ADVISOR`**. Es la misma regla que al tomar un lead desde una conversación.
  - **`Idempotency-Key`:** se acepta. La clave se guarda en la caché, por usuario y por 10 minutos, después del commit. Un reintento con la misma clave devuelve el lead que se creó, aunque no tenga teléfono ni email.
  - **Origen:** sin `source_channel`, ahora es `MANUAL` (antes `WEB_FORM`). `update` también acepta `MANUAL`.
- **`update`:** normaliza el teléfono con la misma regla (422 si no es válido).

**Panel** (`everprop-public`)

- **`createEverpropLead`:** manda `Idempotency-Key` y devuelve `duplicate`.
- **Formulario de alta** (`NewLeadForm`):
  - genera una clave por formulario y la reusa en los reintentos;
  - si la API devuelve `duplicate`, avisa «Este contacto ya tiene un lead abierto. No se creó otro lead» y abre la ficha de ese lead.
- **Origen `MANUAL`:** se muestra como «Carga manual» y está entre las opciones del formulario. Al editar no se convierte en `WEB_FORM`.

## 3. Por qué esta solución

- **Mismo resolvedor que el formulario web y WhatsApp:** por eso un alta manual y un formulario de la misma persona comparten contacto (identidad `PHONE` en E.164).
- **No se usa `sp_create_or_get_open_lead` en el alta manual,** a diferencia de lo que proponía el ticket. El procedimiento hace la asignación automática (rueda) y elige la etapa. El alta manual tiene asesor, etapa, presupuesto y propiedad elegidos por quien la carga, y pasarla por el procedimiento habría generado una asignación automática seguida de una manual. La regla de un lead abierto por contacto la garantiza el mismo índice único que usa el procedimiento.
- **Un 422 en vez de adivinar:** un teléfono mal normalizado vincula a la persona equivocada. Es la misma postura que `ContactDetails::e164` en el asistente.
- **Idempotencia en la caché:** alcanza para dobles clics y reintentos, que es el caso del ticket, sin tabla nueva. Está marcado con `ponytail:`.

## 4. Cómo se verificó

**API**, en el contenedor `everprop-api-php` (PHP 8.4, MySQL 8.4, Redis; Laravel 13.40), con una copia aislada en `/tmp/evp135`:

- `tests/Feature/CRM/ManualLeadContactTest.php` (nuevo, con datos commiteados y limpieza en `tearDown`): **13 tests y 35 assertions, PASS**.
  - **9 formatos de teléfono:** los válidos van a E.164 y los ambiguos o inválidos dan `null`.
  - **Mismo envío dos veces:** 1 contacto y 1 lead. El segundo devuelve `duplicate: true` con el mismo id. El teléfono queda `+541155550000`, el email en minúsculas, la identidad `PHONE` creada y el origen `MANUAL`. Un teléfono ambiguo da 422.
  - **Alta manual + formulario web** (`/public/leads` con identidad `PHONE`): mismo contacto, y el formulario reusa el lead abierto.
  - **Reintento con `Idempotency-Key`** sin teléfono ni email: un solo lead. Una clave inválida da 422.
  - **Un asesor no recibe el lead abierto de otro asesor:** 409.
- **Suites `tests/Feature/CRM`, `ConversationLeadTest` y `tests/Unit/CRM`:** 62 tests, PASS.
- **Suite completa:** las 14 fallas son las mismas que en `develop` sin este cambio (`CollectionEmailTest` ×11, `WebChatAndUsageTest`, `PrepareMetaReviewTest`, `ProductionEnvironmentTest`). Vienen del `.env.testing` local.
- **Calidad:** Pint PASS (346 archivos) y PHPStan sin errores.

**Panel**:

- `node --test tests/leads-api.test.mjs`: 4/4. El test nuevo comprueba que la clave va como cabecera, que se lee `duplicate` y que se muestra «Carga manual».
- `tsc --noEmit`: OK.
- ESLint en los archivos tocados: 0 errores.

## 5. Pendientes y riesgos

- **Leads borrados (EVP-124, P0, de Ramiro):** un lead borrado sigue con `is_open = 1`. Si el contacto tiene solo ese lead, el alta choca con el índice único y no encuentra un lead abierto para devolver, así que termina en 500. Se corrige con EVP-124.
- **El 9 de los celulares argentinos:** `+54 11…` y `+54 9 11…` son identidades `PHONE` distintas. El alta guarda lo que se escribió (normalizado), sin agregar ni quitar el 9. Si la landing (`bellomo-landing`) manda los celulares con 9, conviene que el formulario manual los cargue igual, o unificar la regla en el resolvedor en otro ticket. WhatsApp usa su propia identidad (`WHATSAPP` con el `wa_id`) y no se mezcla.
- **Editar el teléfono no actualiza la identidad:** `update` normaliza `phone_e164` pero no crea ni mueve la identidad `PHONE`.
- **La idempotencia vive en la caché:** si se vacía la caché dentro de los 10 minutos, un reintento de un lead sin teléfono ni email puede crear otro.
- **Un duplicado no vincula la propiedad elegida:** el aviso lleva a la ficha, donde se puede vincular.
- **Sin probar en el navegador:** el modo mock no pasa por la API.
- **Choques con otros PRs:** este cambio y el PR #123 (EVP-134) tocan `AdminLeadController`, este en `store` y aquel en `update`. Además, Pint reindentó el cuerpo de `store` porque quedó dentro de un `try`, y por eso el diff es grande aunque el cambio real es chico.
