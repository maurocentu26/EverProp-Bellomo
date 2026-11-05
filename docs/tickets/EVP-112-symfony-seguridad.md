# EVP-112 — Hotfix producción: actualizar Symfony por avisos de seguridad en main

Rama `hotfix/evp-112-symfony-seguridad` (→ `main`), desde `origin/main` `d87be50` · fecha 2026-11-05 · autor: Claude (agente) con Mauro Centurión
Ticket Jira [EVP-112](https://eversys.atlassian.net/browse/EVP-112).

## 1. Qué pedía el ticket

EVP-111 corrigió en `develop` los avisos de seguridad de Symfony publicados el 2026-11-04, pero `main`, lo que ve el cliente, seguía con versiones afectadas.

Criterios: rama desde `origin/main`, auditoría sin avisos, `composer validate --strict` sin errores, cambios solo en `composer.lock` y este informe, dentro de Symfony 8.1, sin fallas nuevas en Pint, PHPStan y tests respecto del lock anterior de `main`, y nada de IA ni conversaciones en el diff.

Fuera de alcance: otras actualizaciones, cambios de código de la aplicación, merge y deploy.

## 2. Qué se implementó

Solo cambia [composer.lock](../../everprop-api/composer.lock). `composer.json` no cambia, porque sus rangos ya admiten estas versiones, y el `content-hash` del lock tampoco.

El lock de `main` no coincidía con el de `develop`: además de los 7 avisos de EVP-111 tenía uno más, en `symfony/mime`. Antes de la actualización, `composer audit --locked` informaba 8 avisos en 5 paquetes:

| Paquete | Aviso | Tema |
|---|---|---|
| `filesystem` | PKSA-g499-cm4q-v35y | Rutas que escapan de su directorio base |
| `http-foundation` | CVE-2026-118514 | `HEAD` saltea la opción `methods` de reglas de acceso |
| `http-foundation` | PKSA-pr6q-2w5s-kzzf | Reglas de ruta aplicadas delante de PHP que se pueden saltear |
| `http-foundation` | PKSA-nxjs-s6hn-vb6m | `private_ranges` confía de más en ciertas direcciones como proxy |
| `http-foundation` | PKSA-b2gg-vk1g-6d5q | URLs generadas con un host elegido por el cliente |
| `http-kernel` | PKSA-3gxv-7xhq-mgmz | Fragmentos en línea y encabezados reenviados no confiables |
| `mime` | CVE-2026-45070 | Inyección de encabezados de email en nombres de parámetros |
| `routing` | CVE-2026-118516 | Marcadores de host que saltean control de acceso por ruta |

Comando: `composer update symfony/filesystem symfony/http-foundation symfony/http-kernel symfony/mime symfony/routing --with-dependencies --no-install --no-scripts`.

| Paquete | Antes | Después |
|---|---|---|
| `symfony/filesystem` | 8.1.2 | 8.1.11 |
| `symfony/http-foundation` | 8.1.9 | 8.1.11 |
| `symfony/http-kernel` | 8.1.4 | 8.1.11 |
| `symfony/routing` | 8.1.2 | 8.1.11 |
| `symfony/mime` | 8.1.4 | 8.1.10 |
| `symfony/error-handler` | 8.1.2 | 8.1.10 |
| `symfony/process` | 8.1.0 | 8.1.10 |
| `symfony/var-dumper` | 8.1.2 | 8.1.10 |
| `symfony/event-dispatcher` | 8.1.2 | 8.1.5 |
| `symfony/event-dispatcher-contracts` | 3.7.1 | 3.8.1 |
| `symfony/deprecation-contracts` | 3.7.1 | 3.8.1 |
| `symfony/polyfill-intl-idn` | 1.38.1 | 1.43.0 |
| `symfony/polyfill-intl-normalizer` | 1.38.0 | 1.43.0 |
| `symfony/polyfill-mbstring` | 1.43.0 | 1.43.3 |
| `symfony/polyfill-php85` | 1.41.0 | 1.43.0 |

Todos los paquetes de Symfony quedan en la misma versión que en `develop`. No se agregan ni se quitan paquetes.

Sin forwards, variables de entorno, dominios, CORS, Sanctum ni proveedores. No se configuró ningún entorno.

## 3. Por qué esta solución

- Partir del lock de `main` y no copiar el de `develop` evita traer a producción dependencias que `main` no usa.
- No se ignoraron los avisos en la configuración de la auditoría, porque eso deja las versiones vulnerables.
- No se analizó cuáles de los avisos se pueden explotar en este API: se corrigen todos igual.
- La rama va en minúsculas porque el check de PR hacia `main` solo acepta `hotfix/[a-z0-9]…`, como los hotfixes anteriores.

## 4. Cómo se verificó

Mismos pasos que `API quality / verify`, en un stack local aislado de Docker (proyecto `evp112`) con PHP 8.4, MySQL 8.4 y Redis 8.2, y el esquema y los forwards de esta rama importados. Se corrió una vez con cada lock, instalando `vendor` desde cada uno.

| Comprobación | Lock anterior de `main` | Lock nuevo |
|---|---|---|
| `composer audit --locked` | 8 avisos | Sin avisos |
| `composer validate --strict` | Válido | Válido |
| Pint `--test` | Sin errores (192 archivos) | Sin errores (192 archivos) |
| PHPStan | Sin errores | Sin errores |
| Parseo de `openapi.yaml` | Bien | Bien |
| `route:list --except-vendor` | 77 rutas | 77 rutas, salida idéntica |
| Suite completa | 130 tests, 840 aserciones, todos pasan | 130 tests, 840 aserciones, todos pasan |

Las dos corridas ejecutaron la misma lista de tests, sin omitidos.

Política de PR: `check-pr-policy.mjs` de `develop`, corrido localmente sobre el árbol de esta rama, da OK para `hotfix/evp-112-symfony-seguridad → main`, incluida la revisión de IA y conversaciones. Una simulación con `git merge-tree` de esta rama hacia `origin/develop` no da conflictos.

**Sin verificar:** `redocly lint`, imagen de producción y evidencia HTTP no corrieron localmente; quedan para el CI del PR. El panel no se probó contra el API actualizado, y nada se desplegó. Una prueba local no valida producción.

## 5. Pendientes y riesgos

- **Antes del pase a producción falta verificar:** forwards SQL pendientes (`schema_versions`), dominios definitivos, CORS/R2, hosts/Sanctum/cookies (`tenant_domains`), credenciales y permisos de proveedores, base de datos y storage. Este hotfix no agrega forwards, pero `main` puede tener alguno sin aplicar en producción.
- **Después del merge a `main`:** mergear `main` en `develop`.
- **Riesgo:** bajo a medio. Son versiones de corrección dentro de 8.1, pero tocan el núcleo HTTP, rutas y correo. Conviene probar en el entorno desplegado el login y el envío de correo, incluida la recuperación de contraseña.
- **Mirar en el PR:** que `API quality / verify` y `Ticket branch / name` pasen completos.
