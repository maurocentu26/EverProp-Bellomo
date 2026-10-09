# Checklist Meta / staging (2026-10-07)

Alcance: rama `develop`, desde la que despliega staging (antes `chore/agentic-setup`). **El módulo de IA y conversaciones vive solo en `develop`: no va a `main` ni a producción** (decisión del dueño; `main` lo retiró en `debb84f`). Sin secretos en este archivo.

Estados: **Impl** implementado · **Sim** probado con Meta simulado · **Real** probado con Meta real · **Pub** publicado · **Pres** presentado a Meta · **Apr** aprobado.

## 1. CI

| Ítem | Estado | Evidencia | Responsable |
|---|---|---|---|
| CI del PR #7 | No corre | El PR tiene conflictos con `main` (`debb84f` retiró el módulo de IA de `main`); GitHub no ejecuta `pull_request` con conflictos. Última corrida verde: `d708c8e` | — |
| CI en la rama de staging | Impl | Los cuatro workflows (API, web, evals, guard) corren en `push` a `main` y `develop` | — |
| No resolver el conflicto del PR | Decisión | Mezclar `main` borraría el módulo. El PR queda como referencia, sin merge | Dueño + Mauro |
| Verificación local al cierre (`b179f39`) | Impl | Backend 319 tests, PHPStan y Pint limpios, panel 69/69, tsc y lint | Claude |

## 2. Páginas legales

| Página | Estado | Qué falta | Aprobación legal |
|---|---|---|---|
| `eversyssolutions.com.ar/privacidad` | No existe (404) | Publicarla: Meta la pide en los ajustes de la app | Sí |
| `eversyssolutions.com.ar/terminos` | No existe (404) | Publicarla | Sí |
| `eversyssolutions.com.ar/eliminacion-de-datos` | No existe (404) | Publicarla (instrucciones de borrado para Meta) | Sí |
| Panel staging `/privacidad`, `/eliminacion-de-datos` | Pub (200) | Nombran al proveedor como "EverProp" y a "Bellomo Desarrollos" como ejemplo; el título hereda "· Bellomo"; no figura el responsable legal (RUGGERI RAMIRO FABIO) ni un email de contacto verificado | Sí |
| Panel staging `/terminos` | No existe (404) | — | Sí |

**Afirmaciones que necesitan aprobación antes de publicarse** (no publicar sin confirmar): identidad y domicilio del responsable; email de contacto; plazos de la Ley 25.326 citados (supresión 5 días hábiles, acceso 10 días corridos); que se usa un proveedor de IA y en qué país procesa (transferencia internacional); retención de mensajes y adjuntos; subencargados (Meta, Railway, almacenamiento). El texto base está en `everprop-public/src/app/(legal)/` y la propuesta de identidad EverSys en `meta-app-review.md` §4.

## 3. Número de prueba dentro de Embedded Signup

Documentación oficial revisada el 2026-10-07:
- [Embedded Signup, implementación](https://developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/implementation/): pide dominios permitidos, redirect URIs de OAuth, configuración de Facebook Login for Business y `config_id`; **no menciona** el número de prueba de API Setup.
- [Embedded Signup, overview](https://developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/overview/): el flujo se prueba con la propia cuenta de Facebook o con una **cuenta sandbox** reclamable (dura 30 días); **"el número de la cuenta sandbox no puede enviar ni recibir mensajes"**. El flujo ofrece **números 555** verificados automáticamente a clientes elegibles.

**Conclusión:** no hay respaldo oficial para elegir el número de prueba de API Setup dentro de Embedded Signup. **Recorrido compatible, sin números de Bellomo:**
1. **Alta (Embedded Signup):** cuenta sandbox de Meta simulando al cliente → prueba que "Conectar WhatsApp" guarda integración y canal. No envía mensajes.
2. **Mensajes reales:** probar en el navegador si el flujo ofrece un **número 555** al negocio de prueba; si lo ofrece, conectarlo por Embedded Signup y usarlo para el recorrido completo (texto, foto, PDF, plantilla).
3. **Si no hay 555:** los **videos de App Review** usan las alternativas oficiales (cURL de API Setup con el número de prueba y WhatsApp Manager para la plantilla), y el recorrido completo de la app queda para después de la aprobación, con un número propio de EverSys (no de Bellomo).

| Ítem | Estado | Responsable |
|---|---|---|
| Verificar sandbox y 555 en el navegador | Pendiente | Codex (navegador) |

## 4. Configuración no secreta de staging

| Dónde | Campo | Valor |
|---|---|---|
| App Dashboard → Facebook Login for Business → Configuración | Allowed domains (SDK de JavaScript) | `panel-staging-staging-62ec.up.railway.app` |
| Ídem | Valid OAuth redirect URIs | `https://panel-staging-staging-62ec.up.railway.app/` |
| Ídem | Configuración de Embedded Signup | Crear la configuración (WhatsApp Embedded Signup) y copiar su `config_id` |
| WhatsApp → Configuración → Webhooks | Callback URL | `https://api-staging-30f3d.up.railway.app/api/v1/webhooks/meta/whatsapp` |
| Ídem | Campos | `messages` (también trae los estados de entrega) |
| Ajustes básicos de la app | Privacy Policy URL | `https://eversyssolutions.com.ar/privacidad` (cuando esté publicada) |
| Ídem | User data deletion | `https://eversyssolutions.com.ar/eliminacion-de-datos` (instrucciones) |
| Railway `api`, `worker`, `scheduler` (staging) | Variables | `META_APP_ID`, `META_EMBEDDED_SIGNUP_CONFIG_ID`, `META_GRAPH_VERSION=v24.0`, `META_ONBOARDING_ENABLED` (apagado hasta X04), `META_SEND_ENABLED` (apagado hasta X04). Secretos (no van acá): `META_APP_SECRET`, `META_WEBHOOK_VERIFY_TOKEN` |
| Panel | — | No necesita variables de Meta: lee `app_id` y `config_id` de `GET /api/v1/admin/integrations/whatsapp/config` |

Notas: el intercambio del código no envía `redirect_uri` (`WhatsAppOnboarding::exchange`); si Meta lo exige al probar, se corrige en código. El SDK carga `connect.facebook.net/es_LA/sdk.js` (`WhatsAppConnect.tsx`).

## 5. Videos y justificación de App Review

| Pedido de Meta | Qué tenemos | Estado |
|---|---|---|
| Video 1: mensaje creado y enviado desde la app y recibido en WhatsApp | Respuesta del asesor desde la bandeja por Cloud API; también foto/PDF y plantilla | Impl + Sim. Real solo con un número que pueda enviar (ver §3). Alternativa oficial: cURL de API Setup |
| Video 2: crear una plantilla | La app **no crea** plantillas (las sincroniza y envía) | Se usa la alternativa oficial: WhatsApp Manager (guion en `meta-app-review.md` §3) |
| Texto `whatsapp_business_messaging` | Bandeja, ventana de 24 h, envío de texto/foto/PDF/plantilla | Redactado; **sumar** fotos/PDF y plantillas aprobadas |
| Texto `whatsapp_business_management` | Suscribir webhooks, registrar número, leer números, **leer plantillas aprobadas** | Redactado; **sumar** la lectura de plantillas (`message_templates`) |

## 6. Casos de evaluación sin commitear (otra sesión)

`evals/cases/failures.jsonl` (+7), `rioplatense.jsonl` (+8), `security.jsonl` (+15): 30 casos, **validan** (`node evals/validate.mjs`: 80 válidos). Hoy en git hay 50. Propuesta: commitearlos tal cual en un commit aparte que diga que vienen de otra sesión, después de que el dueño confirme que no siguen en edición. No se descartan.

## 7. Resumen por estado

| Ítem | Impl | Sim | Real | Pub | Pres | Apr | Responsable siguiente |
|---|---|---|---|---|---|---|---|
| Bandeja, widget, avisos, copiloto, lead y visita, fotos/PDF | ✓ | — | — | staging | — | — | Dueño: probar en iPhone |
| WhatsApp: alta Embedded Signup | ✓ | ✓ | ✗ | — | ✗ | ✗ | Codex: config + sandbox |
| WhatsApp: texto, fotos/PDF, plantillas | ✓ | ✓ | ✗ | — | ✗ | ✗ | Tras §3 |
| Verificación del negocio | — | — | — | — | ✓ enviada | ✗ | Meta |
| Dominio `eversyssolutions.com.ar` | — | — | — | ✓ verificado | — | — | — |
| Páginas legales EverSys | ✗ | — | — | ✗ | — | — | Dueño + legal |
| App Review (2 permisos) | guiones ✓ | — | — | — | ✗ | ✗ | Tras verificación y videos |
| IA autónoma / copiloto | ✓ | ✓ | ✗ | — | — | — | X03 (dueño) |
