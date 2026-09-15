# Avisos Web Push de Bellomo

El panel registra suscripciones por empresa y usuario, cifradas en la base. La notificación persistida en Laravel despacha un trabajo después del commit. El contenido de la pantalla bloqueada no incluye nombres ni datos de clientes. Los dispositivos expirados (404/410) se eliminan y los errores temporales se reintentan hasta tres veces.

## Preparación de entrega

- Aplicar `php scripts/apply-web-push.php` en la base de destino; la extensión es aditiva.
- Configurar `WEBPUSH_PUBLIC_KEY`, `WEBPUSH_PRIVATE_KEY` y `WEBPUSH_SUBJECT` en el gestor de secretos del servidor. Generar el par con `Minishlink\WebPush\VAPID::createVapidKeys()`; no versionar ni imprimir la clave privada en registros compartidos. Mantener el par estable para no invalidar dispositivos.
- Usar un subject HTTPS o mailto real de la organización. Configurar `WEBPUSH_QUEUE_CONNECTION=database` y un worker supervisado: `php artisan queue:work database --tries=3 --timeout=30`. La conexión no debe ser sync en producción.
- Publicar el frontend mediante HTTPS. Autorizar avisos desde Configuración o Notificaciones en cada dispositivo. En iPhone se debe abrir desde la pantalla de inicio.
- Probar una asignación con una cuenta de prueba: aplicación abierta, segundo plano y cerrada; tocar el aviso; cerrar sesión y comprobar que no recibe avisos posteriores. La prueba física y el dominio HTTPS siguen pendientes.

El sonido depende de permisos, configuración del sistema y modo silencio/no molestar. La aplicación no puede forzar el volumen ni eludir esos ajustes. La campana conserva las notificaciones aunque el envío push falle.

## Pruebas locales

Antes de entregar, ejecutar `php artisan everprop:production-check --connections --webpush` en el entorno de destino. Detecta configuración faltante/inválida y verifica la tabla de la cola database cuando corresponde; no reemplaza comprobar el worker y el teléfono. Ver `integracion-panel.md` para el orden de preparación y recuperación.

`php artisan test --filter=WebPushTest` comprueba permisos, cifrado, destinos permitidos, selección del destinatario, cola y expiración mediante un emisor simulado, sin enviar mensajes reales. Estas pruebas no acreditan recepción en un teléfono.
