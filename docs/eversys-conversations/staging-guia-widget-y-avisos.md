# Staging: ver el proyecto y probar avisos con un widget

Guía práctica para recorrer `bellomito-staging` y comprobar que un mensaje del chat web genera un aviso push en el celular del asesor. Para la prueba formal de entrega y reinicio del worker, usar `staging-s6.md`. La evidencia se registra en `staging-evidence.md`.

## Límites

- Solo staging. Producción de Bellomo, `main` y Vercel quedan fuera.
- IA y WhatsApp siguen apagados. No tocar `CONVERSATIONS_AI_ENABLED`, `AGENT_LLM_PROVIDER`, `META_SEND_ENABLED` ni `META_ONBOARDING_ENABLED`.
- Solo datos inventados: ningún nombre, teléfono ni email de una persona real.
- Las contraseñas no se escriben en el repo, la evidencia ni el chat.

## Direcciones

| Qué | URL |
|---|---|
| Panel | https://panel-staging-staging-62ec.up.railway.app |
| API (salud) | https://api-staging-30f3d.up.railway.app/readyz |
| Widget de staging ya creado | https://panel-staging-staging-62ec.up.railway.app/widget/8f32042b-a9b8-4a74-91c0-40837d962910 |
| Railway | proyecto `bellomito-staging`, entorno `staging`, servicios `api`, `worker`, `scheduler`, `panel-staging` |

Tenant: `bellomito-staging` (datos ficticios). Cuenta administradora: `staging@eversyssolutions.com.ar`, rol `TENANT_ADMIN`. La contraseña la tiene quien la activó el 2026-10-05.

## 1. Ver el proyecto

1. Abrir el panel e iniciar sesión.
2. Recorrer **Conversaciones** (`/admin/conversaciones`): filtros, "Esperan asesor", búsqueda, tomar control, responder, notas internas.
3. Otras pantallas del módulo: **Solicitudes de visita** (`/admin/solicitudes-visita`), **Conocimiento** (`/admin/conocimiento`), **Configuración** (`/admin/settings`, incluye avisos y el botón "Conectar WhatsApp", que en staging está apagado).
4. Si algo no carga: `/readyz` de la API tiene que dar 200, y en Railway los cuatro servicios tienen que estar en el mismo commit con "Deployment successful".

## 2. Activar los avisos en el celular del asesor

Los avisos llegan aunque el panel esté cerrado, pero solo si el dispositivo quedó registrado en el servidor. Que el navegador tenga permiso no alcanza.

**iPhone o iPad** (iOS 16.4 o posterior):

1. Abrir el panel en **Safari**.
2. Compartir → **Agregar a inicio**.
3. Abrir el panel desde ese ícono e iniciar sesión.
4. Configuración → **Avisos con el panel cerrado** → **Activar avisos en este dispositivo** → Permitir.
5. El estado tiene que decir **"Activados: este dispositivo recibe avisos con el panel cerrado."**

**Android o escritorio** (Chrome o Edge): mismos pasos 4 y 5; instalar la app es opcional.

Si dice "bloqueadas": habilitar las notificaciones de la app en los ajustes del dispositivo y volver a la pantalla. Si dice "todavía no están configurados en el servidor": faltan las claves VAPID en staging (paso S8 de `go-live.md`).

## 3. Conseguir un widget para probar

### Opción A: usar el widget que ya existe (recomendada)

Abrir la URL del widget de staging (tabla de arriba) en un navegador **sin la sesión del asesor**: ventana de incógnito, otro navegador u otro celular. Dos pestañas del mismo navegador y perfil no sirven, porque comparten almacenamiento.

### Opción B: crear o actualizar el widget para un sitio de prueba

Sirve para ver el botón flotante incrustado en una página, como lo vería un cliente.

1. En Railway, servicio `api` → consola, correr:

   ```bash
   php artisan everprop:channels:web-chat --tenant=bellomito-staging --panel-origin=https://panel-staging-staging-62ec.up.railway.app --site=https://SITIO-DE-PRUEBA
   ```

   - `--site` es el origen exacto de la página que va a incrustar el widget: esquema y host, sin barra final ni ruta.
   - Hay **un solo widget web por tenant**. Si ya existe, el comando conserva el mismo `widget_id` y **reemplaza** la lista de sitios y orígenes: pasar todos los sitios en cada corrida (`--site=https://a --site=https://b`).
   - Imprime `widget_id`, la etiqueta `<script>` y el valor de `EVERSYS_WIDGET_FRAME_ANCESTORS`.

2. En Railway, servicio `panel-staging` → Variables: cargar `EVERSYS_WIDGET_FRAME_ANCESTORS` con el valor impreso y **redeployar** el panel. La variable se lee al construir; sin redeploy, el sitio no puede mostrar el iframe.

3. En la página de prueba, pegar la etiqueta impresa antes de `</body>`:

   ```html
   <script src="https://panel-staging-staging-62ec.up.railway.app/eversys-widget.js"
           data-widget-id="WIDGET_ID"
           data-title="Chateá con Bellomito"
           data-color="#1f2937"
           defer></script>
   ```

   La página tiene que estar publicada en ese origen (por ejemplo, un preview de la rama `feat/eversys-chat-widget` del sitio, paso S7). Un archivo abierto con `file://` no funciona.

4. Comprobar: `curl -I https://panel-staging-staging-62ec.up.railway.app/widget/WIDGET_ID` muestra `frame-ancestors` con el sitio de prueba.

## 4. Probar el aviso

1. Celular del asesor con avisos activados (paso 2), app cerrada y pantalla bloqueada.
2. Visitante (opción A u opción B): escribir "Hola, busco un lote [prueba aviso]".
3. Resultado esperado, en menos de un minuto:
   - el celular muestra "Un cliente espera respuesta", **sin nombre ni texto del cliente**;
   - al tocarlo se abre esa conversación en el panel;
   - en el panel, la conversación aparece en "Esperan asesor".

### Para repetir la prueba

Hay **un aviso por espera**: los mensajes siguientes del mismo visitante no vuelven a avisar hasta que el asesor abre la conversación. Para otro aviso:

- abrir la conversación en el panel (queda leída), bloquear el celular y escribir de nuevo desde el widget; o
- empezar otra conversación desde una ventana de incógnito nueva.

### Quién recibe el aviso

- Si la conversación tiene responsable activo, solo esa persona.
- Si no tiene responsable, todos los asesores, gerentes comerciales y administradores activos del tenant.
- Si el responsable ya no está activo, gerentes y administradores.

## 5. Si el aviso no llega

| Síntoma | Qué mirar |
|---|---|
| El mensaje no aparece en la bandeja | Logs del `api`; que la página del visitante sea la URL del widget de staging |
| Aparece en la bandeja, pero no en la campana del panel (`/admin/notifications`) | La conversación ya tenía mensajes sin leer (ver "Para repetir la prueba") |
| Aparece en la campana, pero no en el celular | Configuración debe decir "Activados" en **ese** dispositivo; worker corriendo; cola sin fallidos (`everprop:production-check --connections --webpush` en `api` y `worker`) |
| Llega solo al abrir la app | Modo concentración o ajustes de notificaciones del iPhone; repetir con la app cerrada |
| Error 409 al activar | El dispositivo estaba registrado con otra cuenta: seguir el mensaje de recuperación de la pantalla |

## 6. Qué registrar

En `staging-evidence.md`: fecha y hora, commit desplegado, dispositivo y sistema, estado de Configuración, si el aviso llegó con la pantalla bloqueada y si abrió la conversación correcta. Capturas sin contraseñas, cookies ni tokens. Con eso se cierra S8.
