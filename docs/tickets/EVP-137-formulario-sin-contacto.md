# EVP-137 — Leads: el formulario público exige email o teléfono

Rama `ticket/EVP-137-formulario-sin-contacto` (desde `develop` @ `6f412ca`) · fecha 2026-11-14 · autor Claude y Mauro Centurión · sin commit todavía

## 1. Qué pedía el ticket

Hallazgo P2-7 de la auditoría `QA_STAGING_BELLOMO.md` (CAP-06). `POST /api/v1/public/leads` con `contact.display_name`, `email` y `phone_e164` en null, e identidad `WEB_VISITOR`, devolvía **201**. Se creaba el lead «Nuevo contacto comercial», se asignaba por la rueda y se avisaba al asesor, sin ningún dato para contactar a la persona.

## 2. Qué se implementó

- **`PublicLeadRequest`:** si `contact.email` y `contact.phone_e164` faltan o están vacíos, la API responde **422** con un error en `contact` («An email or a phone number is required to contact the lead.»). Los otros mensajes de este request también están en inglés.
- **`openapi.yaml`:** el esquema de `contact` declara la regla con un `anyOf` y la describe.

## 3. Por qué esta solución

- **Va en el request, antes de llegar a `PublicLeadService`.** No se crea contacto, lead, asignación ni aviso, y la clave de idempotencia queda libre para reintentar con los datos correctos.
- **La regla vale para los tres orígenes, `WEB_FORM`, `WEB_CHAT` y `WEB_TRACKING`,** no solo para los dos que nombraba el ticket. El ticket pedía que una visita anónima (`WEB_TRACKING`) no creara un lead asignable. Este endpoint siempre crea un lead asignable, así que rechazarla es la forma de cumplirlo. Hoy nadie manda `WEB_TRACKING`: lo busqué en este repo y en la landing.
- **Revisé la landing (`Bellomo landing/Landing-bellomo`):**
  - **`api/leads`:** ya exige teléfono o email.
  - **`api/chat`, herramienta `createLead` de Bellomito:**
    - su descripción le pide al modelo llamarla solo con teléfono o email;
    - si el email no es válido o el teléfono tiene menos de 8 dígitos, los manda en null con identidad `WEB_CHAT`, y ese era el caso de la auditoría;
    - ahora la API responde 422, la herramienta devuelve `success: false` («El CRM no aceptó la solicitud») y el bot vuelve a pedir el dato.

## 4. Cómo se verificó

**API**, en el contenedor `everprop-api-php` (PHP 8.4, MySQL 8.4, Redis; Laravel 13.40), con una copia aislada en `/tmp/evp137`:

- **`PublicLeadEndpointTest`:** 2 tests y 20 assertions, PASS. El test nuevo cubre:
  - todo en null con `WEB_VISITOR` → 422 en `contact`;
  - nombre con un email en blanco → 422;
  - en esos casos no se crea ningún lead;
  - solo teléfono → 201.

  El caso de solo email ya lo cubría el test existente.
- **Suite completa:** 576 tests. Las 14 fallas son las mismas que en `develop` sin este cambio (`CollectionEmailTest` ×11, `WebChatAndUsageTest`, `PrepareMetaReviewTest`, `ProductionEnvironmentTest`). Vienen del `.env.testing` local.
- **Calidad:** Pint PASS (345 archivos), PHPStan sin errores y `openapi.yaml` válido.

## 5. Pendientes y riesgos

- **Landing (EVP-139):** cuando la API rechaza el lead, Bellomito solo lo registra en consola. Conviene que el bot le diga a la persona que revise el teléfono o el email. Se puede sumar a EVP-139, que ya toca ese archivo.
- **Un lead viejo sin datos de contacto sigue en la base.** Este cambio no limpia nada; por la regla de no borrar datos existentes, queda para el equipo.
