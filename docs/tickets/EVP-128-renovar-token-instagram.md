# EVP-128 — Instagram: el token se renueva solo y se avisa antes de que venza

Rama `ticket/EVP-128-renovar-token-instagram` (desde `develop` @ `ca44b7e`) · fecha 2026-11-16 · autor Claude y Mauro Centurión · sin commit todavía

## 1. Qué pedía el ticket

Hallazgo P1-4 de la auditoría `QA_STAGING_BELLOMO.md` (RES-13):
- **Renovación manual:** el token de Instagram Login dura 60 días y solo se renovaba a mano, con el botón de Configuración.
- **Corte sin aviso:** al vencer, `IntegrationTokens::forSending` devuelve null y las respuestas por Instagram fallan con `CHANNEL_NOT_CONFIGURED`. Los mensajes siguen entrando, pero nadie puede contestarlos y nadie recibe aviso.
- **WhatsApp:** revisar si su token también vence. En staging, la integración de WhatsApp figura con `token_expires_at` 2026-12-26.

## 2. Qué se implementó

- **Comando `everprop:integrations:refresh-tokens`** (`app/Console/Commands/RefreshIntegrationTokens.php`). Corre todos los días a las 09:00 UTC (06:00 en Argentina), con `withoutOverlapping()->onOneServer()`. Toma las integraciones de Meta activas, de tenants activos, cuyo token vence entre hace 7 días y dentro de 15:
  - **Instagram Login aún vigente:** lo renueva.
  - **Si la renovación falla, o si faltan 7 días o menos:** avisa a los usuarios con `manageIntegrations`. Esto incluye WhatsApp, que solo se avisa porque no se puede renovar así.
  - **Vencido:** sigue avisando hasta 7 días después del vencimiento, porque Meta no renueva un token vencido. Después deja de avisar, para no repetir el aviso para siempre.
  - **Una vez por día por integración:** el aviso deja una fila `INTEGRATION_TOKEN_EXPIRY_ALERTED` en `audit_logs`, tomada con lock sobre la integración. Correr el comando dos veces el mismo día no duplica avisos.
  - **Renovaciones no repetidas:** después de renovar, el vencimiento queda a 60 días y la integración ya no entra en el rango.
  - **Log:** un fallo deja `integrations.token_refresh_failed`, solo con el id público de la integración y el código del error. Nunca incluye el token.
- **`InstagramOnboarding`:**
  - La renovación pasa a `renew()`, que comparten el botón de Configuración (`refresh`, con usuario) y el comando (`refreshScheduled`, sin usuario).
  - Mantiene el lock por cuenta, la regla de 24 horas desde la emisión y la protección ante un token revocado o reemplazado durante la llamada a Meta.
  - Sin usuario, exige que el tenant esté activo y audita con `actor_type = SYSTEM`.
  - `connections()` devuelve el estado nuevo `EXPIRING` cuando faltan 7 días o menos.
- **Aviso `IntegrationTokenExpiring`** (`event_type` `INTEGRATION_TOKEN_EXPIRING`):
  - Título: «El acceso de Instagram vence en 6 días», o «vence hoy», «vence mañana», «venció». Si la renovación falló, el mensaje empieza con «No pudimos renovarlo automáticamente».
  - El enlace lleva a `/admin/settings#instagram` o `#whatsapp`.
  - El push del celular tiene un texto genérico y solo abre Configuración.
- **Panel:**
  - La tarjeta de Instagram muestra el estado «por vencer» y deja el botón «Renovar acceso» también en ese estado.
  - La bandeja de avisos lo marca «Requiere acción».

**WhatsApp:** `WhatsAppOnboarding` guarda el token sin vencimiento, porque el de Embedded Signup no vence. El vencimiento de staging no lo puso el código. Aun así, si una fila tiene vencimiento, `forSending` deja de enviar al pasar esa fecha, así que el comando también avisa en ese caso.

Sin cambios de esquema ni de variables.

## 3. Por qué esta solución

- **Reuso:** la renovación ya existía y era correcta (lock, regla de 24 horas, protección ante carreras). Solo se separó del usuario que la dispara, en lugar de duplicarla.
- **Plazos:** 15 días para renovar dan unos 8 intentos diarios antes del umbral de aviso de 7 días. Un fallo transitorio de Meta no avisa hasta que realmente hace falta, salvo que la renovación falle, que avisa en el momento.
- **Control de duplicados en la base y no en el cache:** sobrevive a reinicios y despliegues, y queda como rastro auditable de cuándo se avisó.

## 4. Cómo se verificó

- **`tests/Feature/Integrations/RefreshIntegrationTokensTest.php`** (nuevo, 5 tests), con `Http::fake`:
  - un token a 10 días se renueva una sola vez en dos corridas, guarda el vencimiento nuevo, audita como `SYSTEM` y no avisa;
  - si la renovación falla: 1 aviso al administrador y ninguno al asesor, el token queda intacto, la segunda corrida del día no avisa y al día siguiente avisa otra vez;
  - con 6 días: aviso para Instagram (renovación fallida) y para WhatsApp (sin intento de renovación), y la tarjeta muestra `EXPIRING`;
  - no se tocan los tokens lejanos, revocados, de tenants suspendidos ni los vencidos hace más de 7 días; uno vencido hace 2 días avisa «venció»;
  - el push no lleva datos del cliente y solo abre Configuración, aunque llegue otra URL.
- **`tests/Feature/Integrations` completo:** 70/70, incluido `InstagramOnboardingTest`, que cubre el botón «Renovar acceso».
- **API:** Pint y PHPStan OK en los archivos tocados. La suite completa da 643 tests: 14 fallos, todos de entorno y los mismos que en `develop` (`CollectionEmailTest`, `WebChatAndUsageTest`, `PrepareMetaReviewTest` y `ProductionEnvironmentTest`).
- **Panel:**
  - `tsc --noEmit` y ESLint sin errores;
  - `node --test tests/*.test.mjs`: 224 de 225. Falla `assistant trace is plain text…`, que también falla en `develop`.
- **No se probó contra Meta real.** No se puede renovar un token de prueba sin usar el de staging.

## 5. Pendientes y riesgos

- **Scheduler:** este comando necesita el servicio `scheduler` corriendo. En producción no existe todavía; está en la lista de liberación (`docs/release/2026-11-develop-a-main.md`, 3.6).
- **Token de WhatsApp de staging:** vence el 2026-12-26. A partir del 2026-12-19 el comando va a avisar. Hay que reconectarlo o limpiar ese vencimiento si no corresponde.
- **Avisos:** solo llegan a la campana y al push, no por email.
