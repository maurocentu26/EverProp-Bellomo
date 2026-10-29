# Backups y restauración (EVP-92)

## Objetivos

- **RPO 24 h:** como máximo se pierde un día de datos. Baja a lo que dé el plan de Railway cuando se active Pro.
- **RTO 2 h:** objetivo para volver a tener la base andando desde el último dump. El ensayo local restauró en 41 s; el resto del tiempo es bajar el archivo, apuntar la app y verificar.

## Capas

1. **Dump externo diario (ya en el código).** `everprop:backup:database` corre en el scheduler a las 06:00 UTC. Hace `mysqldump --single-transaction --routines --triggers --events`, lo comprime con gzip y lo sube con su `.sha256` al disco `backups`: un bucket R2 propio, fuera de Railway. Archivos: `mysql/AAAA/MM/DD/<base>-<timestamp>.sql.gz`.
2. **Backups del volumen en Railway (pendiente de pago).** Al pasar a Pro: en el servicio MySQL, pestaña Backups, activar Daily y Weekly. Restauran rápido, pero viven en el mismo proveedor: si se borra el volumen se borran con él. Por eso la capa 1 sigue.
3. **Archivos (adjuntos, fotos).** Viven en R2 con claves UUID que no se pisan. Activar Bucket Lock de 30 días en los buckets de archivos para que no se puedan borrar.

## Configuración, una sola vez

1. Crear en Cloudflare R2 el bucket `everprop-backups` (nombre libre) **separado** de los de archivos.
2. **Bucket Lock:** regla de retención de 35 días (D18) sobre todo el bucket. Nadie puede borrar ni pisar un dump antes de esa fecha, ni con las claves.
3. **Lifecycle:** borrar objetos de más de 90 días.
4. **Token:** un API token de R2 con permiso *Object Read & Write* **solo** para ese bucket.
5. **Variables** en el scheduler de Railway: `BACKUP_ACCESS_KEY_ID`, `BACKUP_SECRET_ACCESS_KEY`, `BACKUP_BUCKET`, `BACKUP_ENDPOINT` y `BACKUP_REGION=auto` (ver `docker/production/environment.example`).
6. **Permiso `SHOW_ROUTINE`:** el usuario de MySQL que usa la app necesita poder leer los stored procedures. En local y CI lo da `docker/mysql/init/10-create-users.sh`. En Railway, una vez, como root: `GRANT SHOW_ROUTINE ON *.* TO '<usuario de la app>'@'%';`. Sin esto el comando falla con `insufficient privileges to SHOW CREATE PROCEDURE`.
7. **Primer dump a mano** para confirmar: `php artisan everprop:backup:database` en el servicio scheduler. Tiene que imprimir `Backup mysql/... (N bytes, sha256 ...)`.

## Ensayo de restauración (cada 3 meses y después de cambios de esquema grandes)

1. Bajar de R2 el último `.sql.gz` y su `.sha256`.
2. Correr `scripts/restore-rehearsal.ps1 -Dump <archivo.sql.gz> -Checksum <archivo.sql.gz.sha256>`. Verifica el hash, levanta un MySQL 8.4 descartable sin volumen, restaura e imprime filas por tabla, cantidad de rutinas y tiempo.
3. Comparar con producción la cantidad de tablas y rutinas, y las filas de `tenants`, `users` y `leads`. Anotar fecha, archivo y resultado en el informe del ticket o en `docs/tickets/`.

## Restauración real (incidente)

1. **Frenar escrituras:** escalar a 0 el worker y el scheduler en Railway y poner la API en mantenimiento (`php artisan down`).
2. **Elegir el punto:** backup de Railway si el volumen sigue vivo (es más reciente); si no, el último dump de R2.
3. **Railway:** pestaña Backups, *Restore*, revisar y *Deploy*. El volumen original queda desmontado, no se borra.
4. **Dump externo:** crear un MySQL nuevo (mismo proveedor u otro), verificar el sha256 y restaurar con `gunzip -c dump.sql.gz | mysql -u root <base>`. Recrear el usuario de la app con sus grants y apuntar `DB_*` a la base nueva.
5. **Verificar** antes de abrir: `php artisan everprop:schema:verify`, conteos de `tenants`, `users` y `leads`, y login de un admin.
6. **Abrir:** `php artisan up` y volver a escalar el worker y el scheduler. Avisar a los clientes qué ventana de datos se perdió (desde el dump hasta el incidente).

## Notas

- **Por qué el binario de Oracle:** el `mysqldump` de Debian es el de MariaDB y genera dumps que MySQL 8.4 rechaza (`ERROR 3105`, columna generada `assignment_pools.default_slot`). El Dockerfile copia el `mysqldump` oficial de la imagen `mysql:8.4`.
- **La clave no queda a la vista:** viaja en `MYSQL_PWD`, nunca en los argumentos, así que no aparece en la lista de procesos ni en los logs.
- **Límite del dump:** se arma en el disco temporal del contenedor antes de subirse. Alcanza para algunos GB; más allá conviene subirlo en streaming (`ponytail:` en el código).
