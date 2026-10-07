# Handoff para Codex: pendientes de EverSys (2026-10-07)

Rama `chore/agentic-setup` (PR #7, borrador). Último commit de Claude: `b179f39`. **Nada en `main` ni en producción de Bellomo.**

## Decisión del dueño (vale para todo lo que sigue)

- **Todo WhatsApp entra por Embedded Signup de Facebook.** El atajo por consola `everprop:whatsapp:connect-own` queda solo como herramienta de soporte; no se usa en el flujo normal ni en las demos.
- **Las pruebas se hacen con el número de prueba que da Meta for Developers** (App Dashboard → WhatsApp → API Setup), con destinatarios verificados (hasta 5). Ningún número real de Bellomo hasta X04.

## Reglas que no se negocian

- Leer `CLAUDE.md` y `AGENTS.md` (raíz y de cada app) antes de tocar código. Invariantes 1–11 de `CLAUDE.md`.
- Sin commit a `main`, sin deploy a producción, sin migraciones sobre datos reales, sin activar `CONVERSATIONS_AI_ENABLED`, `CONVERSATIONS_COPILOT_ENABLED` ni `META_SEND_ENABLED` en producción sin autorización expresa.
- Sin secretos en el repo, logs, evidencia ni chat. Tokens solo en el gestor de secretos o en el formulario de Meta.
- Docker: un solo stack local a la vez, detenerlo al terminar sin borrar volúmenes. Hay otro proyecto en el puerto 3000 (`everprop-bellomo`): no tocarlo.
- `evals/cases/{failures,rioplatense,security}.jsonl` tienen cambios sin commitear **de otra sesión**: revisarlos, validarlos (`node evals/validate.mjs`) y commitearlos aparte o descartarlos con el dueño.
- Toda revisión: `tenant-isolation-reviewer` si toca datos, `llm-security-reviewer` si toca IA (ver `CLAUDE.md`).

## Qué quedó hecho (commits, más nuevo arriba)

| Commit | Qué |
|---|---|
| `b179f39` | Hallazgos de revisión: admin activo en connect-own, tamaño/tipo antes de bajar archivos de Meta, throttle de media, XMP y fail-closed en JPEG |
| `f7ae3c4` | Fotos sin EXIF/GPS |
| `cd19d4a` | Plantillas aprobadas para escribir después de 24 h (sync desde Meta + envío) |
| `ed77a41` | Fotos y PDF por WhatsApp, enviar y recibir |
| `86eb81b` | `connect-own` (solo soporte, ver decisión) |
| `adba22a` | Guardia: links y datos de pago solo si están en fuentes aprobadas |
| `2beba28` | Fotos y PDF en bandeja y chat web |
| `98d4a7c` | "Lead y visita" desde la conversación |
| `4679c9b`, `43dec11` | Doc de Meta; copiloto (la IA sugiere, el asesor envía) |
| `471e0e7` | Chat a pantalla completa en la PWA |
| `33acd8a`, `9608633`, `0c02d65` | Interés/visita por código de unidad; 80 casos de evaluación; runner Q01 |
| `c0b477a`, `d708c8e`, `76236ee` | Guía de staging; canal firmado multi-cliente; handoff Tech Provider |

Verificación al cierre: backend 319 tests verdes (1 omitido: eval con modelo real), PHPStan y Pint limpios, panel 69/69, `tsc` y lint sin errores. **Todo lo de WhatsApp está probado con Meta simulado (`Http::fake`): no hay evidencia de un envío real.**

## Paso 0: verificar el estado (15 min)

```bash
git fetch origin && git status && git log --oneline origin/chore/agentic-setup..HEAD
```
Si hay commits sin pushear, pedirle al dueño el push (el guard local lo bloquea para agentes). Después, con el stack local (`everprop-api/compose.yaml`):

```bash
cd everprop-api
docker compose --project-name everprop-api exec everprop-api-php vendor/bin/pint --test
docker compose --project-name everprop-api exec everprop-api-php vendor/bin/phpstan analyse
docker compose --project-name everprop-api exec everprop-api-php php artisan test
cd ../everprop-public && npm run lint && npx tsc --noEmit && node --test tests/*.test.mjs
cd .. && node evals/validate.mjs
```
CI de GitHub tiene que quedar verde en las cuatro: API, web, evals, guard.

## Paso 1: Embedded Signup con el número de prueba de Meta (prueba real, en staging)

Requiere autorización X04 del dueño para **staging** (no producción). Referencias: `docs/eversys-conversations/meta-app-review.md` (secciones 2, 3, 4b, 5) y `staging-s6.md`.

1. **App de Meta** (la crea el dueño, no el agente): caso de uso WhatsApp, portfolio conectado. En API Setup, anotar el número de prueba y verificar 1–2 destinatarios propios.
2. **Embedded Signup**: en el App Dashboard crear la configuración de Embedded Signup y copiar el `config_id`. El dominio del panel de staging va en "Allowed domains" y "Valid OAuth redirect URIs" (Facebook Login for Business).
3. **Variables de staging** (servicios `api`, `worker`, `scheduler` y `panel-staging` según corresponda; las cargan el dueño o quien él autorice, nunca en el repo): `META_APP_ID`, `META_APP_SECRET`, `META_EMBEDDED_SIGNUP_CONFIG_ID`, `META_GRAPH_VERSION`, `META_WEBHOOK_VERIFY_TOKEN`, `META_ONBOARDING_ENABLED=true`, y **recién en el paso 5** `META_SEND_ENABLED=true`. Nombres exactos en `everprop-api/config/services.php` y `.env.example`.
4. **Webhook**: en la app, `https://api-staging-30f3d.up.railway.app/api/v1/webhooks/meta/whatsapp` con el verify token; suscribir el campo `messages`. Verificar que Meta reciba el challenge.
5. **Conectar desde la app**: panel de staging → Configuración → "Conectar WhatsApp" → completar Embedded Signup eligiendo la WABA/número de prueba. Esperado: tarjeta "Conectado", fila `channel_accounts` ACTIVE. **Validar contra la documentación vigente de Meta si un número de prueba de API Setup se puede elegir dentro de Embedded Signup**; si no se puede, Embedded Signup se prueba con la WABA del propio negocio del dueño y el número de prueba se usa para los envíos de los videos. Registrar lo que pase en `staging-evidence.md`.
6. **Recorrido** (con `META_SEND_ENABLED=true` solo en staging):
   - Escribir desde el celular verificado al número de prueba → aparece en "Esperan asesor" y llega el push.
   - Tomar control, responder texto → llega al celular. Mandar una foto y un PDF desde el clip → llegan.
   - Mandar una foto desde el celular → se ve en la bandeja (se baja de Meta al abrirla).
   - Crear una plantilla en WhatsApp Manager (Utilidad, `confirmacion_visita`), esperar aprobación, y con una conversación de más de 24 h usar "Escribir con plantilla".
7. **Evidencia** en `staging-evidence.md`: fecha, commit desplegado, `messages[0].id` devueltos, capturas sin tokens. Esto también es el material de los **dos videos de App Review**.
8. Al terminar: `META_SEND_ENABLED=false` y documentar el apagado (sección 5 de `meta-app-review.md`).

## Paso 2: pendientes de código (en este orden)

1. **Clientes que ya usan la app WhatsApp Business** ("Onboard WhatsApp Business app users"): leer la doc oficial vigente, configurar Embedded Signup para ese caso si corresponde, y decidir cómo se muestran en la bandeja los mensajes que el asesor manda desde el celular (eventos de Meta para mensajes "echo"). Tests con `Http::fake` y revisión `tenant-isolation-reviewer`.
2. **Tiempo real**: hoy la bandeja consulta cada 3–8 s. Proponer al dueño Laravel Reverb (dependencia + servicio Railway nuevo); **no instalar sin su OK**.
3. **Dataset de evaluación**: 80/200 (`evals/README.md`). Priorizar `current-data` (6/30) y `security` (19/40). Skill `eval-case`.
4. **Marca por cliente** (nombre/logo/textos de mensajes): está en `git stash` ("S02 parte 2 (estacionado)"); retomar solo con un segundo cliente y con textos de WhatsApp configurables (no cambiar los de Bellomo).
5. **Auditoría de asignaciones manuales de leads** (`lead_assignments`), pendiente señalado en revisión (ya faltaba en Leads).

## Paso 3: lo que es del dueño (no lo hace un agente)

- Verificación del negocio de EverSys en Meta (nombre legal, dirección, teléfono, email, sitio) y páginas de privacidad/términos en `eversyssolutions.com.ar`.
- App Review (subir los dos videos y los textos de `meta-app-review.md`, sección 3).
- X03: proveedor de IA, tarjeta y API key con límite → después prender **copiloto** en staging 2 semanas (`go-live.md` paso 5b) y correr el runner con el modelo real (`evals/README.md`).
- Pruebas en iPhone en staging: pantalla completa, "Lead y visita", fotos/PDF, plantillas.
- Push de la rama.

## Cómo reportar

Cada ítem: commit, entorno, fecha, tests corridos y resultado. Separar **preparado / publicado / presentado a Meta / aprobado**. Nunca marcar "verificado" algo probado solo con Meta simulado.
