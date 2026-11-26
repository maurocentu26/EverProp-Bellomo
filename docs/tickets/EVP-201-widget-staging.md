# EVP-201: activar el widget de Bellomito en staging para que lo pruebe el cliente

Fecha: 2026-11-26. Rama: `ticket/EVP-201-widget-staging`, desde `develop` (97f03a1). Redeploy de staging autorizado por el usuario.

## 1. Problema

El widget oficial de staging cargaba, pero desde el 4/11 respondía con el aviso fijo "no puedo responder automáticamente". El 25/11 la causa fue `PROVIDER_ERROR`: 503 de Gemini. Además:
- la API de staging no tenía las reglas de EVP-200;
- staging no tenía todavía el catálogo real de Bellomo.

## 2. Qué se hizo

- **Despliegue.** La API estaba en `9d46f63` (22/11) y no se había vuelto a desplegar. Worker, worker-fast, scheduler y panel ya estaban en `97f03a1`, el último develop.
  - Se desplegó la API en `97f03a1` con `railway deployment redeploy -s api --commit 97f03a1`. Los cinco servicios quedaron en el mismo commit.
  - Ese commit incluye EVP-193, EVP-197 (reintentos de Gemini), EVP-200 (precio, disponibilidad y cuotas) y EVP-L200.
- **SQL:** no se aplicó; staging ya tenía todos los forwards de develop.
- **Sin cambios de código** de la app ni de variables. En el repo solo se agregaron este informe y la evidencia en `docs/eversys-conversations/staging-evidence.md`.

## 3. Verificación

| Comprobación | Resultado |
|---|---|
| `everprop:production-check --connections` (API) | todo OK (LLM configurado, hosts de tenant, orígenes explícitos, esquema al día) |
| `/readyz` | 200 |
| Widget en el dominio de Railway | 200, `frame-ancestors 'self' https://panel-staging-staging-62ec.up.railway.app` |
| CORS del chat público | solo `https://panel-staging-staging-62ec.up.railway.app`; un origen ajeno no se refleja |
| Dominio propio `everprop-review-staging.eversyssolutions.com.ar` | **no resuelve en DNS** |
| Saludo y búsqueda de lotes | nombra lotes reales de La Arbolada 2, sin precio |
| Precio y disponibilidad de una unidad | "un asesor te brinda el precio y la situación de esa propiedad" + ofrece registrar el contacto |
| Cuotas y anticipo | "condiciones comerciales que un asesor te detallará" + ofrece registrar el contacto |
| Bandeja (consulta de solo lectura) | conversación 43 `AI_ACTIVE`, 6 mensajes, 3 runs `SUCCEEDED`, sin `error_code` |

**Enlace para el cliente:** https://panel-staging-staging-62ec.up.railway.app/widget/8f32042b-a9b8-4a74-91c0-40837d962910

**Vuelta atrás:**
- Panel → Configuración → IA del tenant → "IA apagada".
- O volver a desplegar la API en `9d46f63`, aunque así se pierden EVP-200 y EVP-197.

## 4. Pendientes y riesgos

- **Acceso con login (EVP-207):** el enlace de hoy es público para quien lo tenga. Si el cliente tiene que entrar con credenciales, falta EVP-207.
- **Dominio propio:** no tiene registro DNS, así que el panel y el widget no funcionan ahí. Además, el CORS del chat solo admite el origen de Railway: si se activa el dominio propio, hay que agregarlo a los orígenes del widget y a CORS.
- **Gemini 503:** no apareció en esta prueba. EVP-197 agrega reintentos, pero si vuelve con carga real, hay que decidir modelo o plan (variables, a cargo de una persona).
- **Bandeja en la UI:** no se revisó en el panel por falta de sesión en el dominio de Railway. La conversación sí está en la base.
- **Catálogo:** son los datos reales copiados a staging (36 proyectos, 3578 unidades). El asistente solo ve las 255 unidades disponibles y nunca dice su estado.
- **EVP-202:** staging ya tiene el catálogo real; el ticket se puede cerrar.
- **Producción:** antes de ir a producción hay que verificar sus accesos: forwards pendientes en `schema_versions`, dominios definitivos, CORS/R2, `tenant_domains`, Sanctum y cookies, credenciales y cuota de Gemini, base y storage. Esta prueba en staging no valida producción.
