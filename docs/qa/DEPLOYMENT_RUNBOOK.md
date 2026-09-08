# Runbook de despliegue — EverProp Bellomo

Este runbook prepara el release; **no autoriza ni ejecuta un deploy**.

## 1. Preflight

1. Fijar `RELEASE_SHA` al commit revisado; no desplegar un working tree sin commit.
2. Exigir CI raíz verde y revisión humana del diff.
3. Ejecutar todos los gates de `PRODUCTION_READINESS.md` sobre el SHA candidato.
4. Verificar `composer audit`/`npm audit` en cero y que `league/commonmark` permanezca en 2.10.1 o una versión corregida posterior.
5. Exigir paridad OpenAPI/Laravel 55/55 o actualizar ambos lados juntos si cambian las rutas.
6. Crear backup consistente de MySQL y copiar archivos persistentes. Registrar ubicación, checksum, cifrado, retención y responsable sin incluir credenciales.
7. Restaurar ese backup en un ambiente aislado y ejecutar smoke de lectura/escritura.
8. Confirmar que las cuentas demo históricas fueron rotadas o invalidadas y auditar invocaciones pasadas de endpoints de setup.

## 2. Railway / API

- Root directory: `everprop-api`.
- Runtime: imagen PHP 8.4 reproducible; no usar PHP del host.
- Dependencias: MySQL 8.4 y Redis accesibles sólo por red privada.
- Aplicar baseline únicamente en instalación vacía, con hash canónico. En instalación existente aplicar SQL forward-only revisado; nunca reimportar baseline sobre datos.
- Usuario runtime MySQL: sólo `SELECT, INSERT, UPDATE, DELETE, EXECUTE`; verificar con `SHOW GRANTS` redactado.
- Variables mínimas a validar por presencia/formato: `APP_ENV=production`, `APP_DEBUG=false`, `APP_KEY`, `APP_URL`, conexiones DB/Redis, `SESSION_SECURE_COOKIE=true`, dominios de sesión, `SANCTUM_STATEFUL_DOMAINS`, CORS exacto, trusted proxies/hosts, `TENANT_HOST_MAP_JSON`, `TENANT_ALLOW_LOCAL_RESOLVER=false`, queue y storage.
- Desplegar procesos separados y supervisados: web, queue worker y scheduler si se usa. Habilitar failed jobs persistentes.
- Configurar storage durable (volumen o S3 compatible), permisos privados por defecto y prueba de upload/download autorizada.
- No habilitar endpoints HTTP de setup/reset. Confirmar 404 antes de abrir tráfico.
- Gate previo al tráfico: `/healthz=200`, `/readyz=200`, logs sin stack/secretos y worker procesando un job sintético.

## 3. Vercel / frontend

- Root directory: `everprop-public`.
- `NEXT_PUBLIC_DATA_MODE=api`.
- `NEXT_PUBLIC_ENABLE_QA_TOOLS=false` y `NEXT_PUBLIC_ENABLE_LOCAL_TENANT_HEADER=false`.
- API same-origin por rewrites; URL backend exacta y HTTPS.
- Dominio final incluido en tenant host map, CORS y Sanctum stateful domains.
- Build debe mostrar Next 16.3.4 o posterior aprobado, las 17 entradas actuales (14 bajo `/admin`) y audit npm limpio.
- Inspeccionar bundle y pantalla: sin passwords, quick-login, simulador, datos demo ni éxito local silencioso.
- Verificar CSP, `nosniff`, anti-frame, Referrer-Policy y Permissions-Policy en respuesta real.

## 4. Orden recomendado

1. Congelar cambios y crear backup verificado.
2. Desplegar backend sin tráfico público nuevo.
3. Aplicar cambios forward-only y arrancar worker.
4. Ejecutar smoke API directo con hostname tenant válido.
5. Desplegar frontend apuntando al backend validado.
6. Ejecutar smoke end-to-end con usuarios sintéticos de cada rol.
7. Abrir tráfico gradualmente y observar errores, latencia, jobs, DB/Redis y sesiones durante al menos 30 minutos.

## 5. Smoke post-deploy

- Health/readiness 200 por URL directa y proxy Vercel.
- CSRF cookie, login válido, contraseña inválida 422/401 estable, `me`, refresh y logout.
- Acceso anónimo a `/admin` redirige a login; back no restaura sesión.
- Catálogo público devuelve sólo publicados del tenant correcto.
- Crear/editar/publicar una propiedad sintética; recargar y verificar versión.
- Crear lead sintético, asignar, asociar propiedad, cambiar etapa y crear follow-up; recargar y verificar.
- READ_ONLY no muta; SALES_ADVISOR no accede a lead ajeno; tenant A no infiere tenant B.
- Batch de dos lotes en proyecto permitido; usuario sin scope/precio recibe 403.
- Notificación se lee/marca/limpia y persiste.
- Agenda/configuración no muestran controles falsos mientras no exista backend.
- Queue procesa job sintético; failed jobs y logs quedan observables sin PII.
- 404/422/401/403/409/419/429/500 presentan respuesta segura y comprensible.
