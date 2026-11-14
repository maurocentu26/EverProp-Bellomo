# EVP-132 — Seguridad: límites por cliente real (TRUSTED_PROXIES y IP firmada del visitante)

Rama `ticket/EVP-132-trusted-proxies` (desde `develop` @ `cd3ad17`) · fecha 2026-11-14 · autor Claude y Mauro Centurión · sin commit todavía

## 1. Qué pedía el ticket

Hallazgo P2-2 de la auditoría `QA_STAGING_BELLOMO.md` (RES-15, SEC-07). En staging, `TRUSTED_PROXIES` está vacío, así que `$request->ip()` devuelve la IP del proxy de borde de Railway, que cambia entre pedidos. Con eso, los límites `login`, `public-leads`, `public-chat` y `password-recovery` no frenan a nadie:

- 93 altas del formulario pasaron en unos 2 minutos, con un límite de 20/min;
- el contador de login osciló según el proxy.

El riesgo inverso: con los proxies bien configurados, todo lo que llega desde un servidor nuestro (el panel en Vercel, la landing) compartiría un solo cupo para todos los visitantes.

## 2. Qué se implementó

**Configuración de proxies**

- **`TRUSTED_PROXIES=REMOTE_ADDR`** (ya soportado por Laravel; `environment.example` y `docs/railway-backend.md`). Confía solo en quien se conecta al contenedor, el borde de Railway. `$request->ip()` pasa a ser la última IP que agregó ese borde en `X-Forwarded-For`: la del cliente real. Lo que el cliente ponga antes en esa cabecera se ignora.
- **`*` no sirve:** en Laravel confía en *todos* los saltos (`0.0.0.0/0`), y el cliente elige su IP con su propio `X-Forwarded-For`. `everprop:production-check` ahora lo rechaza («Trusted proxies not a wildcard»).

**IP del visitante firmada** (`AppServiceProvider::clientIp`)

- El panel y la landing llaman a la API desde sus servidores, así que para la API todos sus visitantes tienen la misma IP.
- El servidor firma la IP del visitante con la clave del canal panel → API que ya existía (`TENANT_PANEL_SIGNING_KEY`, ADR 0005):
  - cabeceras `X-Eversys-Client-Ip`, `X-Eversys-Client-Timestamp` y `X-Eversys-Client-Signature`;
  - firma: `HMAC-SHA256("eversys-client-ip-v1\nip\ntimestamp")`;
  - vigencia: el mismo TTL que la firma del host.
- **Usan esta IP:** `login`, `public-leads`, `public-chat`, `public-chat-read` y `password-recovery`. Los límites de webhooks (Meta llega directo) siguen con `$request->ip()`.
- **Si la firma no verifica** (falsa, vencida, sin clave o con IP inválida): se usa `$request->ip()`. Una cabecera inválida nunca da un cupo nuevo.

**Panel** (`everprop-public/src/proxy.ts`, `src/lib/tenant-signature.ts`)

- Con la clave configurada, además del host firma la IP del visitante. La toma de la última entrada de `X-Forwarded-For`, la que agregó la plataforma (no la elige el navegador).
- Siempre borra las copias de esas cabeceras que mande el navegador.

## 3. Por qué esta solución

- **`REMOTE_ADDR` en vez de rangos de IP de Railway:** Railway no publica rangos fijos para su borde, y confiar en el salto inmediato es exacto. El contenedor no tiene puerto público fuera del borde.
- **Se reusa el canal firmado panel → API:** misma clave, misma TTL, mismo HMAC. El panel ya lo usaba para el host, así que no hay secreto nuevo que distribuir. Un propósito distinto en el mensaje (`eversys-client-ip-v1`) impide usar la firma de un host como firma de una IP, y al revés.
- **Cupo por visitante y no un cupo grande para la landing:** un cupo compartido deja que un solo visitante abusivo bloquee a todos.

## 4. Cómo se verificó

**API**, en el contenedor `everprop-api-php` (PHP 8.4, MySQL 8.4, Redis; Laravel 13.40), con una copia aislada en `/tmp/evp132`:

- `tests/Feature/Identity/ClientIpRateLimitTest.php` (nuevo): **3 tests, 22 assertions, PASS**.
  - **Detrás del borde** (`REMOTE_ADDR` distinto en cada pedido y primera entrada de `X-Forwarded-For` falsa y rotando): el 6.º login fallido del mismo cliente da 429. Otro cliente sigue recibiendo 422.
  - **IP firmada por el panel:** el visitante A se bloquea en el 6.º intento y el visitante B, detrás del mismo servidor, no.
  - **Firmas que no verifican** (falsa, vencida, sin firma o sin clave): caen al cupo del servidor, no al del visitante A ya bloqueado.
  - **Vector HMAC compartido** con el test del panel.
  - **`production-check`:** falla con `*` y pasa con `REMOTE_ADDR`.
- **Suite completa:** las 14 fallas son las mismas que en `develop` sin este cambio (`CollectionEmailTest` ×11, `WebChatAndUsageTest`, `PrepareMetaReviewTest`, `ProductionEnvironmentTest`). Vienen del `.env.testing` local; el CI de `develop` está en verde.
- **Calidad:** Pint PASS (342 archivos) y PHPStan sin errores.

**Panel**

- `node --test tests/tenant-signature.test.mjs`: 5/5. El test nuevo cubre:
  - el vector HMAC compartido con la API;
  - la última entrada de `X-Forwarded-For`, con IPv4 e IPv6;
  - que el proxy borra las cabeceras falsas del navegador y firma la IP real.
- `tsc --noEmit` y ESLint en los archivos tocados: sin errores.

## 5. Pendientes y riesgos

- **Variables de Railway:** el código no cambia nada hasta que se configure `TRUSTED_PROXIES=REMOTE_ADDR` en staging y en producción.
- **Clave del panel:** `TENANT_PANEL_SIGNING_KEY` tiene que estar en la API (Railway) y en el panel (Vercel). Sin ella, los pedidos del panel siguen limitados por la IP de salida de Vercel.
- **Sin probar en staging:** que Railway agregue la IP del cliente al final de `X-Forwarded-For` y que Vercel pase la IP del visitante al proxy del panel se verifica después de desplegar, con los criterios del ticket:
  - 25 altas desde una IP → 429 desde la 21;
  - 6 logins fallidos → 429, sin afectar a otro cliente.
- **Landing (`bellomo-landing`):** para el criterio de «30 visitantes distintos en un minuto», la ruta `src/app/api/leads/route.ts` tiene que mandar las tres cabeceras con la IP del visitante. Es otro repo y queda para EVP-139. Hasta entonces, sus envíos se limitan por la IP de su servidor.
- **Red privada de Railway:** otro servicio del mismo proyecto que llame directo a la API podría elegir su `X-Forwarded-For`. Son servicios propios.
