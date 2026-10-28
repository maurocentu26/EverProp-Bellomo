# EVP-70 — Entorno local Docker regenerado

Fecha: 2026-10-28. Máquina: notebook de Ramiro (Windows 11, Docker Desktop).

## Qué se hizo
1. Ramiro respaldó `.env` y `.env.testing` (`*.backup-evp70`) y corrió `scripts/bootstrap-local.ps1 -ProjectName everprop-evp70 -ResourcePrefix everprop-evp70 -HttpPort 18090`. El guard impide que el agente lea o escriba `.env` y secretos, así que este paso lo hace una persona.
2. `docker compose --project-name everprop-evp70 up -d --build`: mysql, redis, php, nginx, worker y scheduler sanos.
3. `scripts/import-schema.ps1 -ProjectName everprop-evp70 -ResourcePrefix everprop-evp70 -HttpPort 18090`: baseline y forwards importados, contrato verificado (62 tablas, 134 FKs, runtime sin root).
4. `php artisan test`: **447 pasan, 1 omitido** (2793 aserciones, 247 s).
5. Stack detenido con `stop`. No se borraron contenedores ni volúmenes.

## Volúmenes
- Viejos, intactos: `everprop-api-{cache,mysql-data,redis-data,storage}`.
- Nuevos: `everprop-evp70-{cache,mysql-data,redis-data,storage}`.

## Cómo usarlo
Siempre con `--project-name everprop-evp70`, por ejemplo:

```powershell
cd everprop-api
docker compose --project-name everprop-evp70 up -d
docker compose --project-name everprop-evp70 exec everprop-api-php php artisan test
docker compose --project-name everprop-evp70 stop
```

## Límites
- La base nueva está vacía de datos de negocio (solo esquema). La base vieja sigue en sus volúmenes, pero sus secretos se perdieron, así que no se puede abrir con este `.env`.
- Configuración de Gemini (EVP-22): Ramiro la pasa a mano desde `.env.backup-evp70`. Los tests no la necesitan.
- Los contenedores viejos `everprop-api-*` siguen creados y detenidos; no levantar los dos stacks a la vez.
- Sin secretos en logs ni en el repo.
