# EVP-28 — Seguridad: symfony/http-foundation por CVE-2026-108082

Ramas `ticket/EVP-28-symfony-http-foundation` (→ `develop`) y `hotfix/evp-28-symfony-http-foundation` (→ `main`) · fecha 2026-10-15 · Claude Code con Ramiro Ruggeri
Ticket Jira [EVP-28](https://eversys.atlassian.net/browse/EVP-28).

## 1. Qué pedía el ticket

El paso `composer audit` del CI empezó a fallar en todos los PR: hay un aviso nuevo, CVE-2026-108082 (PKSA-xmwy-rmx5-m7h4).
- **Qué es:** un ReDoS en `HeaderUtils::split()` que se dispara con el header `Cache-Control` de un request.
- **Qué versión afecta:** `symfony/http-foundation` 8.1.4. La corrección está desde la 8.1.7.
- **Riesgo:** un request armado puede consumir CPU de la API.
- **Alcance:** `develop` y `main` tienen la versión afectada.

## 2. Qué se hizo

`composer update symfony/http-foundation --with-dependencies --no-install`. Solo cambia `composer.lock`:

| Paquete | Antes | Después |
|---|---|---|
| symfony/http-foundation | 8.1.4 | **8.1.9** |
| symfony/polyfill-mbstring | 1.38.2 | 1.43.0 |
| symfony/polyfill-php80 | 1.37.0 | 1.43.0 |
| symfony/polyfill-php83 | 1.41.0 | 1.43.0 |

`composer.json` no cambia. La misma actualización se aplicó por separado sobre el lock de `main`, en la rama `hotfix/`.

## 3. Por qué esta solución

- **Es el cambio mínimo:** actualiza solo el paquete afectado y lo que exige su resolución. Es una versión de parche dentro de 8.1.
- **Va en un ticket propio, fuera de EVP-23:** destraba el CI de todos los PR y se puede llevar a producción por separado.

## 4. Cómo se verificó

| Comprobación | Resultado |
|---|---|
| `composer audit`, después de la actualización | "No security vulnerability advisories found" |
| Suite completa, Pint, PHPStan y E2E | En el CI de los PR (`develop` y `main`) |

## 5. Pendientes y riesgos

- **Producción:** aplicar el hotfix a `main` y desplegar.
- **Volver a correr el CI** de los PR abiertos (#29) después del merge a `develop`.
