# EVP-92 · Backups y restore probado de MySQL y R2/S3

Rama `ticket/EVP-92-backups` desde `origin/develop` (`33d9fd4`). Fecha: 2026-10-29. Origen: auditoría 2026-10-29 (AUD-001, crítico).

## Qué hace

- **`everprop:backup:database`** (`app/Console/Commands/BackupDatabase.php`): dump diario con `mysqldump --single-transaction --routines --triggers --events`, comprimido con gzip, con `.sha256`, al disco `backups`. Ese disco es un bucket R2 propio, fuera de Railway. Lo corre el scheduler a las 06:00 UTC, con `withoutOverlapping` y `onOneServer`. Sin bucket configurado falla sin hacer nada.
- **Disco `backups`** en `config/filesystems.php`, con variables `BACKUP_*` propias (nunca las claves de la app). Agregadas a `docker/production/environment.example`.
- **Imagen:** copia el `mysqldump` 8.4 oficial desde `mysql:8.4`.
- **`docker/mysql/init/10-create-users.sh`:** `GRANT SHOW_ROUTINE` para los usuarios de la app y de test, porque sin él no se pueden dumpear los stored procedures.
- **`scripts/restore-rehearsal.ps1`:** verifica el sha256, restaura en un MySQL 8.4 descartable sin volumen y muestra filas por tabla, rutinas y tiempo.
- **`docs/backup-restore.md`:** RPO 24 h y RTO 2 h, configuración de R2 (Bucket Lock de 35 días, token solo para ese bucket), ensayo trimestral y restauración ante un incidente.

## Hallazgos en el camino

1. **El usuario de la app no podía leer los stored procedures** (`insufficient privileges to SHOW CREATE PROCEDURE`). En Railway hay que hacer el `GRANT SHOW_ROUTINE` una vez, a mano (está en el runbook).
2. **El dump de MariaDB no se puede restaurar en MySQL 8.4** (`ERROR 3105`, columna generada `assignment_pools.default_slot`). Lo encontró el ensayo de restauración; por eso se usa el binario de Oracle.

## Evidencia (local, stack `everprop-evp70`, imagen construida desde esta rama)

- `BackupDatabaseTest`: 2 de 2. Dump real contra el MySQL de test, con sha256 coincidente, tablas y procedimientos incluidos y sin la clave en el contenido; y rechazo cuando no hay bucket. `ProductionEnvironmentTest`: 3 de 3.
- **Ensayo de restauración:** dump de `bellomo_crm` (21,8 KB) restaurado en MySQL 8.4 descartable en 41 s. 66 tablas y 2 rutinas, igual que el origen.
- pint OK en los 4 archivos PHP; phpstan sin errores en el comando.
- **Suite completa: no corrida** con esta rama (la suite de develop dio 529/1 skipped el mismo día).

## Pendiente fuera del código

- **Railway Pro:** decidido, se contrata cuando pague el cliente. Ahí se activan los backups Daily y Weekly del volumen MySQL.
- **Cloudflare:**
  - crear el bucket de backups con Bucket Lock y su token;
  - aplicar Bucket Lock de 30 días a los buckets de archivos.
- **Railway:** cargar las variables `BACKUP_*` en el scheduler y hacer el `GRANT SHOW_ROUTINE` una vez.
- **Primer ensayo de restauración con un dump real de staging** y su registro.

## Límites

- El dump pasa por el disco temporal antes de subirse (`ponytail:` en el código): alcanza para algunos GB.
- Sin point-in-time: se puede perder hasta 24 h (o lo que dé Railway Pro).
