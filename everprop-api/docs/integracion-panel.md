# Integración del panel: orden de revisión y puesta en marcha

Base: `eeeefcc` (martes 08/09/2026). Branch: `codex/mejoras-panel`.
Las comprobaciones de esta entrega no reemplazan una prueba en el entorno de destino.

## 1. Revisar por módulos

1. `app/Domain/CRM`, `tests/Feature/CRM`: permisos, asignación, seguimiento, visitas y avisos.
2. `database/schema/forward`, `scripts/apply-visit-extension.php`, `scripts/apply-web-push.php`: preparación aditiva de MySQL.
3. `everprop-public/src/components/admin/advisor`, `src/lib/commercial-*`: cuatro indicadores y cola comercial.
4. Frontend `src/app/admin`, `src/components/admin`, estilos: responsive, temas, tamaño de texto, formularios y agenda.
5. `app/Jobs/SendWebPush.php`, configuración y frontend de Push: entrega al dispositivo y privacidad.

No importar de nuevo el baseline sobre una base existente. No ejecutar seeders ni importar la base local de QA en producción. Los datos de prueba locales no viajan con el código de Git.

## 2. Ensayar la actualización en una copia aislada

- Crear un respaldo verificado de la base de destino y comprobar su restauración en un entorno aislado. Conservar también la versión de código y configuración anterior.
- Instalar las dependencias de los lockfiles con PHP 8.4 y Node compatibles con el proyecto.
- Ejecutar, en este orden, desde `everprop-api`:

```sh
php scripts/apply-visit-extension.php
php scripts/apply-web-push.php
```

- Repetir ambos scripts: deben terminar correctamente sin borrar ni duplicar registros. La prueba `ReleaseSchemaTest` verifica la repetición sobre MySQL de pruebas; no acredita todavía la primera instalación sobre cada copia de producción.
- El script de visitas ahora rechaza una extensión parcialmente aplicada, en lugar de informar éxito con columnas faltantes. Ante un fallo, detener la actualización y revisar el esquema: MySQL DDL puede confirmar cambios aunque el paso posterior falle.
- No usar `migrate:fresh`, `db:wipe` ni scripts de reset. Para recuperación, volver a la versión anterior sólo si se comprobó su compatibilidad con las extensiones. Una restauración de respaldo puede perder escrituras posteriores: coordinar una ventana sin escrituras y verificarla antes.

## 3. Comprobaciones reproducibles

```sh
# API, sólo en el entorno/base de pruebas configurado:
php artisan test
# Destino de producción o réplica con configuración equivalente, sólo lectura:
php artisan everprop:production-check --connections --webpush
# Frontend:
npm run build
node --test tests/*.test.mjs
```

El verificador no muestra claves y no envía avisos. Comprueba columnas de visitas, tabla de suscripciones, credenciales VAPID y cola asíncrona. Cuando Push usa cola database, comprueba también su tabla. No acredita que el supervisor del worker esté activo ni que el teléfono haya recibido un aviso. Un FAIL en localhost por HTTP o APP_ENV local es esperado: no debe ocultarse para obtener un resultado verde.

## 4. Aceptación funcional sin cambiar reglas comerciales

En una empresa de pruebas: administrador crea y asigna un lead; el asesor correcto recibe el aviso y puede abrirlo; otro asesor no accede; registrar una nota no acredita contacto; registrar un contacto actualiza seguimiento y permite la etapa correspondiente. Verificar compromiso vencido, de hoy y futuro, cierre y cancelación de cita. Comparar las tarjetas y pestañas con los mismos registros. La tarjeta verde cuenta citas, no clientes al día.

Repetir las pantallas principales con administrador, gerente y asesores, claro/oscuro, texto actual/grande, 320/390/768 px y escritorio. Registrar sólo combinaciones efectivamente probadas; no marcar toda la matriz como aprobada por pasar tests automáticos.

## 5. Datos de QA y dispositivos

Antes de una demo, revisar el registro `everprop-public/docs/qa-panel-2026-09-14.md`: contiene los identificadores de registros ficticios creados. No borrar por prefijo QA/PRUEBA ni por nombre únicamente; confirmar identificador, empresa, relaciones y respaldo. Los contactos pueden tener otros leads y las propiedades pueden estar vinculadas a clientes reales.

En el entorno local se retiraron los cinco leads documentados y la propiedad ficticia mediante el `deleted_at` ya existente; se conservan contactos e historial. No se eliminó físicamente ningún registro. El panel se verificó en navegador: 10 leads activos, cero indicadores alimentados por estos ejemplos; agenda e inventario ya no muestran los registros retirados. Esto no modifica las bases de los compañeros al actualizar Git.

Los scripts `scripts/cleanup-local-qa.php` y `scripts/cleanup-local-qa-property.php` son mantenimiento puntual, restringido a APP_ENV=local y a identificadores exactos de esta sesión. Por defecto sólo muestran el estado. No forman parte del despliegue ni deben ejecutarse sobre otros datos. Antes de aplicar, validan identidades y guardan respaldos privados bajo `storage/app` del contenedor PHP. Los respaldos no se versionan y deben conservarse si se quiere restaurar.

```sh
php scripts/cleanup-local-qa.php --check-restore
php scripts/cleanup-local-qa.php --restore
php scripts/cleanup-local-qa-property.php --restore
```

La restauración aborta si los registros cambiaron después de la limpieza. Los respaldos se conservan; una nueva aplicación no los sobrescribe automáticamente. La comprobación de restaurabilidad de los cinco leads pasó; no se reactivaron los ejemplos para una prueba visual.

Para Push, seguir `web-push.md`: claves estables en secretos, HTTPS y worker supervisado. Probar Android/iPhone con app abierta, en segundo plano, cerrada y pantalla bloqueada, apertura del aviso y cierre de sesión. El sistema operativo controla sonido y modo silencio. No hay certificación de recepción física hasta completar estas pruebas.
