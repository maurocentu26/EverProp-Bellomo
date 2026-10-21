# EVP-53: pulido de cobranzas (importe, logo, avisos al asesor) y guía de prueba en el teléfono

Rama `ticket/EVP-53-cobranzas-pulido` desde `develop` · 2026-10-21 · Claude con Ramiro.

## Pedido
Ramiro quiere chequear que el motor de avisos de cobranza tipo Ecogas y los avisos de la app estén listos de verdad, y pidió el logo de Bellomo en el correo.

## Cambios

### 1. Correo al comprador
- **Importe en formato argentino:** `$ 450.000,00` (y `US$ 1.250,50` para dólares). Antes salía como `ARS 450000.00`.
- **Logo de Bellomo arriba del correo:**
  - Sale de `COLLECTIONS_MAIL_LOGO_URL`. El panel ya lo publica en `https://ever-prop-bellomo.vercel.app/brand/bellomo/logo.png`, y verifiqué que responde 200 `image/png`.
  - Solo se aceptan URLs https y se escapa el valor.
  - Si no hay URL, se muestra el nombre de la empresa.
  - Los clientes de correo solo muestran imágenes remotas: no se adjunta el archivo.

### 2. Avisos de cobranzas al asesor (campanita y teléfono)
- **Antes:**
  - El mismo aviso se creaba **todos los días** mientras la cuota siguiera impaga, así que la campanita se llenaba de repetidos.
  - **Nunca llegaba al teléfono:** el aviso se guardaba directo en la base y no pasaba por el listener que manda el push.
  - La fecha salía como `2026-02-10`.
- **Ahora:**
  - Un aviso «Cuota vence hoy» y uno «Cuota en mora» por cuota y asesor, y nada más. La lista viva sigue en Cobranzas.
  - La fecha sale como `10/02/2026`.
  - **Push al teléfono:** «Hoy vence una cuota. Revisala en Cobranzas.» o «Una cuota quedó en mora. Revisala en Cobranzas.».
    - No muestra datos del cliente en la pantalla bloqueada.
    - Abre Cobranzas con el filtro que corresponde.
    - Se respeta el horario de atención y la preferencia de cada dispositivo (EVP-L02).
  - El push solo sale para cuotas que vencieron en los últimos 10 días. La deuda vieja aparece en la campanita, pero el primer día no le llegan al teléfono meses de atraso de golpe.
- **Al desplegar:** cambia la clave de deduplicación, así que cada cuota ya vencida genera **un** aviso nuevo en la campanita, una única vez y sin push.

## Cómo se verificó
- `php -l` y Pint pasan.
- Generé muestras del correo con el código real y datos de ejemplo, y las revisé en el navegador: logo, importe, resumen de cuenta.
- **Tests nuevos:**
  - el aviso al asesor sale una vez por etapa, con push solo si la cuota es reciente;
  - el payload del push de cobranzas;
  - el logo solo desde https y el formato del importe.
- **Tests actualizados:** el importe en los tests de correo.
- **Pendiente:** los tests de PHP y PHPStan corren en el CI (en esta PC no hay Docker).

## Guía: probarlo en tu teléfono sobre staging
Staging (`bellomito-staging`) se despliega desde `develop`.

**1. Configuración del servidor de staging (una vez)**
- Correr los forward `2026-10-20.001` (EVP-50) y `2026-10-21.001` (EVP-53).
- **Push:** `WEBPUSH_PUBLIC_KEY`, `WEBPUSH_PRIVATE_KEY` y `WEBPUSH_SUBJECT` cargados (el panel toma la clave pública del servidor), y el worker de colas corriendo.
- **Correo:**
  - `COLLECTIONS_MAIL_ENABLED=true`;
  - `COLLECTIONS_MAIL_TENANT=<slug del tenant de staging>`;
  - `COLLECTIONS_MAIL_FROM_ADDRESS` y `COLLECTIONS_MAIL_REPLY_TO`;
  - el SMTP del mailer `collections` (por ejemplo, Brevo gratuito);
  - `COLLECTIONS_MAIL_PAYMENT_INSTRUCTIONS` con un texto de prueba;
  - `COLLECTIONS_MAIL_LOGO_URL`.
- El scheduler (`schedule:run`) activo.

**2. En el teléfono**
- Abrí el panel de staging.
  - En iPhone, instalalo: Compartir → «Agregar a inicio». Abrilo desde ese ícono, porque iOS solo manda push a la app instalada.
- Iniciá sesión con un usuario asesor o gerente.
- Aceptá la invitación «Recibí avisos con el panel cerrado», o activalos desde Configuración.

**3. Cuota de prueba**
- Creá un lead con **tu propio correo**, asignado a tu usuario.
- En Cobranzas, cargale un plan de 1 cuota que **venza hoy**.

**4. Qué tenés que ver**

| Cuándo | Correo a tu casilla | Teléfono y campanita |
|---|---|---|
| Hoy, desde las 9 (corrida horaria) | «Hoy vence tu cuota 1 de 1», con logo e importe | Push «Hoy vence una cuota» y «Cuota vence hoy» en la campanita |
| Mañana | — | Push «Una cuota quedó en mora» |
| En 3 días, si no la pagaste | «Tu cuota 1 quedó pendiente» | — |
| Si registrás el pago | No sale nada más | — |

**Para no esperar a la corrida horaria**, con acceso al servidor:
- `php artisan everprop:collections:notify-upcoming --dry-run` lista qué se mandaría, sin enviar.
- `php artisan everprop:collections:notify-upcoming` lo manda.
- `php artisan everprop:collections:notify` genera los avisos al asesor.

**5. Reenganche (EVP-50)**
- Si un asesor con leads abiertos no entra al panel durante 1 día, recibe entre las 10 y las 19 un push del estilo «Te espera 1 lead».
- Al día 2 recibe «Tu seguimiento se está enfriando» y al día 3 «Tus clientes siguen ahí».
- Para probarlo sin esperar, en staging se puede mover `users.last_active_at` de tu usuario a hace 2 días y correr `php artisan everprop:leads:follow-up-alerts` en horario diurno.

## Falta (fase 2 de la propuesta)
- Saber si el correo llegó o rebotó, por webhook del proveedor.
- Historial de avisos por cuota en el panel.
- Textos y días configurables desde el panel.
- Aviso de deuda formal a los 15 días.

## Revisión `tenant-isolation-reviewer`
- **Resultado:** sin bloqueantes ni altos, y sin fugas entre tenants.
  - El push va al asesor del mismo tenant (los joins filtran por tenant en ambos lados).
  - `SendWebPush` vuelve a validar el usuario, el tenant, el permiso y la notificación.
  - La pantalla bloqueada no muestra datos del cliente.
  - El logo solo se acepta por https, se escapa y sale de la configuración.
- **Aplicado:**
  - El día del deploy no se repite el aviso si hoy ya salió con la clave vieja. Hay un puente marcado con `ponytail:` que se puede borrar después del primer día. Tiene test.
  - La ventana del push quedó fija en 10 días, separada de la configuración del correo, así ampliar los días del correo nunca dispara una ráfaga de push. Tiene un test del borde: a los 11 días no hay push.
  - El recordatorio manual también muestra las fechas en formato `d/m/Y`.
- **Aceptado como límite conocido:** se manda un push por cuota, no un resumen por asesor. El tag agrupa los avisos en el dispositivo; si un asesor llega a tener decenas de cuotas por día, conviene un resumen.
