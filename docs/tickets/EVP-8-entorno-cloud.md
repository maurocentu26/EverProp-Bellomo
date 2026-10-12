# EVP-8 — Scripts del entorno cloud de Claude: probar o descartar

Rama `ticket/EVP-8-entorno-cloud` (desde `develop`) · fecha 2026-10-12 · Claude Code con Ramiro Ruggeri
Ticket Jira [EVP-8](https://eversys.atlassian.net/browse/EVP-8) (desarrollado en local como EVP-L08).

## 1. Qué pedía el ticket

El WIP `4c6ba7e` (del 7/10, sin revisar) dejó dos scripts para correr el backend en un entorno cloud de Claude Code (Ubuntu con Docker):
- `.claude/cloud/setup.sh`: setup cacheable que construye imágenes e instala `vendor/` y `node_modules/`;
- `.claude/cloud/up.sh`: levanta el stack y genera secretos locales aleatorios. Importa el baseline (verificando su hash) y los forward, y verifica el esquema.

El ticket pide revisarlos y decidir si se quedan o se descartan.

## 2. Qué se hizo

- Se trajeron los dos scripts desde el WIP.
- `setup.sh` citaba un `.claude/cloud/NETWORK.md` que nunca existió. Se reemplazó la referencia por la lista de dominios necesarios, escrita en el mismo comentario.

## 3. Decisión: se quedan, pendientes de una corrida real

- **Repiten el mismo camino que el CI** (`api.yml`): PHP 8.4, MySQL 8.4, baseline más forward y `schema:verify`. No usan SQLite ni se conectan a staging o producción.
- **Los secretos:**
  - se generan con `openssl rand` solo para la VM y nunca se imprimen;
  - los archivos quedan con `umask 077` y permisos de solo lectura;
  - si quedó algún `CHANGE_ME_`, el script falla.
- **El esquema:**
  - el hash del baseline es el mismo de `scripts/import-schema.ps1` (verificado contra el archivo actual);
  - la importación es idempotente: solo corre si la base está vacía.
- **Se apagan** con `stop`, nunca con `down --volumes`, como pide `AGENTS.md`.
- Descartarlos dejaría a las sesiones cloud sin forma de correr los tests. Son 129 líneas y no tocan el código de la app.

## 4. Cómo se verificó

| Comprobación | Resultado |
|---|---|
| `bash -n` sobre los dos scripts | OK |
| Hash SHA-256 del baseline actual contra el del script | Coinciden (`4c8b170b…`) |
| Servicios usados (`everprop-api-php/mysql/redis/nginx/init`) contra `compose.yaml` | Todos existen |
| Placeholders `CHANGE_ME_` que reemplaza contra `.env.example` | Reemplaza APP_KEY, DB, REDIS y WEBHOOK. Los de AWS quedan, y el control final no los exige (no hacen falta para los tests) |

**No verificado: la corrida real.** Se intentó correr `up.sh` en un worktree limpio de esta PC, pero el hook `guard.mjs` bloquea que el agente escriba archivos `.env`, y el script los genera. No se eludió el hook. La prueba real tiene que hacerla:
- una sesión cloud de Claude Code con este setup, o
- Ramiro en una terminal Linux o WSL con Docker: `bash .claude/cloud/up.sh` y después `docker compose --project-name everprop-api exec -T everprop-api-php php artisan test`.

## 5. Pendientes y riesgos

- **Hacer la corrida real** antes del merge. Si falla, corregir en esta rama o descartar.
- **Tiempo de setup:** el caché del entorno exige terminar en unos 5 minutos. La construcción de la imagen PHP más `composer install` puede pasarse. El script informa la duración.
- **Los worktrees viejos** `.claude/worktrees/claude-cloud-setup` y `objective-archimedes-837780` (orígenes de los WIP de EVP-8 y EVP-7) se pueden borrar después del merge.
