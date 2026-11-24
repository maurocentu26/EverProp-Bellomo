# EVP-199 — Hotfix: web-token/jwt-library 4.2.3 → 4.2.8 por advisories de `composer audit`

Rama `hotfix/evp-199-jwt-library` (desde `main` @ `6b15285`) · fecha 2026-11-24 · Claude (agente) con Mauro Centurión

## 1. Qué pedía el ticket

El check **API quality** del PR #168 (EVP-198) falló en `composer audit --locked`. Encontró 13 advisories de seguridad sobre `web-token/jwt-library` 4.2.3, publicados entre el 30/10 y el 8/11/2026. Algunos son denegación de servicio en el parseo de JWS/JWE; otros, de criptografía en RSA-OAEP, ECDH-ES y AES-GCM.

`main` y `develop` tienen la misma versión en el lock, así que cualquier PR de API falla en ese paso hasta corregirlo. Además, el job corta ahí y no llega a correr pint, PHPStan ni los tests con MySQL.

## 2. Qué se implementó

- `composer update web-token/jwt-library --no-install --no-scripts --no-plugins`. Cambia solo el bloque de ese paquete en `everprop-api/composer.lock`: versión, referencia del commit y metadatos.
- Composer resolvió **4.2.8**, la última 4.2.x. La mínima corregida según los advisories es 4.2.6.
- `composer.json` sin cambios. No cambió ninguna otra dependencia: el `require` del paquete es el mismo.
- La librería la usa `minishlink/web-push` v11.0.0 (push notifications), que acepta `^3.4.9|^4.0.6`.

## 3. Por qué esta solución

- Es una actualización de parche dentro de la misma minor (4.2.x), sin cambios de API pública. Es el mínimo cambio que deja `composer audit` limpio.
- Va como hotfix desde `main`, porque el problema bloquea el CI de `main` (y la release EVP-198). Se descartó ignorar los advisories en la config de `audit`, porque dejaría el riesgo en producción.
- Mismo criterio que EVP-112 y EVP-170: hotfix a `main` y después llevar el cambio a `develop`.

## 4. Cómo se verificó

Todo en un contenedor descartable con la imagen local `everprop-api-php:local` (PHP 8.4), sin tocar el stack en ejecución:

- `composer validate --strict`: OK.
- `composer audit --locked`: "No security vulnerability advisories found".
- `composer install` y `composer show web-token/jwt-library`: 4.2.8 instalada.
- `vendor/bin/phpstan analyse` (con `APP_ENV=testing`): sin errores.
- Prueba de humo de web-push: `VAPID::createVapidKeys()`, `VAPID::validate()` y `VAPID::getVapidHeaders()` generan las claves y firman el JWT VAPID (encabezado `Authorization`), que es el camino que usa la librería actualizada.
- `phpunit --testsuite Unit`: 72 tests. Pasan los 59 que no usan base de datos. Los 13 restantes fallan solo con "Connection refused" a MySQL, porque no había base en el contenedor.

**No verificado localmente:** los tests Feature con MySQL y Redis, incluido `WebPushTest`. Los corre el CI del PR (`api.yml`).

## 5. Pendientes y riesgos

- **Antes de desplegar a producción**, verificar los accesos de producción: dominios, CORS, `tenant_domains`, Sanctum y cookies. El cambio no toca esquema.
- **Después del merge a `main`**, mergear `main` en `develop`. Si no, el CI de `develop` sigue fallando en el audit.
- Después de mergear, actualizar `release/evp-198-datos-cliente` desde `main` para que el CI del PR #168 corra completo.
- Riesgo bajo: push notifications usa la librería para firmar VAPID. El smoke local pasó, y `WebPushTest` en CI lo confirma.
