# EVP-48 — Recuperación de contraseña por correo

## Implementación

Solicitud desde login y cambio de contraseña confirmado mediante un enlace de 60 minutos y uso único. Las rutas mantienen tenant confiable, CSRF y límite de 5 solicitudes/minuto por tenant/IP. La identidad de los tokens combina tenant, cuenta y contraseña actual; los cambios de contraseña invalidan enlaces previos. Sanctum rechaza sesiones con hash anterior y sesiones históricas sin snapshot.

La entrega usa la API HTTPS de Resend mediante el cliente HTTP existente de Laravel, sin dependencia nueva ni cambios en los correos de cobranzas. El destino es fijo: `https://api.resend.com/emails`, sin redirecciones, con conexión máxima de 5 segundos y petición de 10 segundos, dentro del lock de 30 segundos. No se usa SMTP: Railway Hobby bloquea su salida.

El trabajo se ejecuta después de responder HTTP. La respuesta es uniforme para cuentas existentes e inexistentes; fallos de red, rechazo del proveedor, cuota agotada o respuesta sin ID se registran únicamente como `password_recovery_delivery_failed` y tenant ID. No se registran excepciones, direcciones, claves ni enlaces. Sin clave, remitente válido u origen HTTPS autorizado se devuelve 503 para todos los correos.

## Configuración de staging

Crear una cuenta Free de Resend con `maurocenturion26@gmail.com` y una API key `EverProp staging` con permiso `Sending access`. Guardar la clave sólo en Railway → bellomito-staging → staging → api → Variables:

```dotenv
RESEND_API_KEY=<clave guardada como secreto>
MAIL_FROM_ADDRESS=onboarding@resend.dev
MAIL_FROM_NAME=EverProp
PASSWORD_RESET_FRONTENDS_JSON={"bellomito-staging":"https://panel-staging-staging-62ec.up.railway.app"}
```

`MAIL_MAILER` no necesita cambiar: la recuperación usa HTTPS explícitamente. `PASSWORD_RESET_MAILER` deja de utilizarse. No copiar secretos al frontend, al chat ni a Git.

El remitente `onboarding@resend.dev` permite probar únicamente con el correo de registro de Resend. Para enviar a usuarios en producción hay que verificar un dominio propio y configurar un remitente de ese dominio. Desactivar seguimiento de aperturas/clics para estos enlaces de autenticación. Conservar cache y sesiones persistentes, la APP_KEY y las variables de tenancy existentes.

## Validación

Las 8 pruebas originales de recuperación pasaron dentro de la suite de 129 pruebas del commit `3acc7b9` en GitHub Actions. La adaptación HTTPS añade comprobaciones de destino, autenticación, destinatario, cuerpo, cuota/rechazo del proveedor y confirmación de recepción, manteniendo los casos de replay, expiración, contraseña modificada, tenant equivocado, validación, cuentas pausadas, límites y revocación de sesiones. Las peticiones HTTP están simuladas y se bloquea cualquier salida inesperada en las pruebas.

La validación del cambio HTTPS y su CI se informa en el chat de entrega. Una suite simulada no acredita entrega real en Gmail.

## Prueba completa pendiente en staging

Desplegar la integración de recuperación en staging (sin merge a main), configurar Resend y usar una cuenta de prueba autorizada. Comprobar solicitud desde login, recepción en Gmail, origen correcto, cambio confirmado, login con nueva contraseña, rechazo de la anterior, rechazo del enlace reutilizado y de una sesión previa. No declarar listo para producción hasta completar la prueba y configurar el dominio remitente productivo.

Referencias: [Railway y SMTP](https://docs.railway.com/networking/outbound-networking), [claves de Resend](https://resend.com/docs/dashboard/api-keys/introduction), [restricción del remitente de prueba](https://resend.com/docs/knowledge-base/403-error-resend-dev-domain).
