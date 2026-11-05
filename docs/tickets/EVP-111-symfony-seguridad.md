# EVP-111 — API: actualizar Symfony por avisos de seguridad que frenan el CI

Rama `ticket/EVP-111-symfony-seguridad` · fecha 2026-11-04 · autor: Claude (agente) con Mauro Centurión

## 1. Qué pedía el ticket

`composer audit --locked` empezó a informar 7 avisos de seguridad en cuatro paquetes de Symfony. El paso `Validate dependencies and code` de `API quality / verify` corta ahí, así que los PR #105 y #106 quedan en rojo sin correr Pint, PHPStan, OpenAPI, los tests con MySQL y Redis, E2E ni la imagen de producción.

Criterios: auditoría sin avisos, `composer validate --strict` sin errores, cambios solo en dependencias dentro de Symfony 8.1, sin fallas nuevas en Pint, PHPStan y tests, y el check completo en verde en el PR.

Fuera de alcance: otras actualizaciones, cambios de código de la aplicación y deploy.

## 2. Qué se implementó

Solo cambia [composer.lock](../../everprop-api/composer.lock). `composer.json` no cambia, porque sus rangos ya admiten estas versiones.

| Paquete | Antes | Después |
|---|---|---|
| `symfony/filesystem` | 8.1.2 | 8.1.11 |
| `symfony/http-foundation` | 8.1.9 | 8.1.11 |
| `symfony/http-kernel` | 8.1.4 | 8.1.11 |
| `symfony/routing` | 8.1.2 | 8.1.11 |
| `symfony/error-handler` | 8.1.2 | 8.1.10 |
| `symfony/process` | 8.1.0 | 8.1.10 |
| `symfony/var-dumper` | 8.1.2 | 8.1.10 |
| `symfony/event-dispatcher` | 8.1.2 | 8.1.5 |
| `symfony/event-dispatcher-contracts` | 3.7.1 | 3.8.1 |
| `symfony/deprecation-contracts` | 3.7.1 | 3.8.1 |
| `symfony/polyfill-php85` | 1.41.0 | 1.43.0 |

Avisos resueltos:

| Paquete | Aviso | Tema |
|---|---|---|
| `filesystem` | PKSA-g499-cm4q-v35y | Rutas que escapan de su directorio base |
| `http-foundation` | CVE-2026-118514 | `HEAD` saltea la opción `methods` de reglas de acceso |
| `http-foundation` | PKSA-pr6q-2w5s-kzzf | Reglas de ruta aplicadas delante de PHP que se pueden saltear |
| `http-foundation` | PKSA-nxjs-s6hn-vb6m | `private_ranges` confía de más en ciertas direcciones como proxy |
| `http-foundation` | PKSA-b2gg-vk1g-6d5q | URLs generadas con un host elegido por el cliente |
| `http-kernel` | PKSA-3gxv-7xhq-mgmz | Fragmentos en línea y encabezados reenviados no confiables |
| `routing` | CVE-2026-118516 | Marcadores de host que saltean control de acceso por ruta |

Sin forwards, variables de entorno, dominios, CORS, Sanctum ni proveedores. No se configuró ningún entorno.

## 3. Por qué esta solución

- `composer update` de los cuatro paquetes con `--with-dependencies` es el cambio mínimo que la auditoría acepta. Los otros siete paquetes los arrastra esa actualización.
- No se ignoraron los avisos en la configuración de la auditoría, porque eso deja las versiones vulnerables.
- No se analizó cuáles de los avisos se pueden explotar en este API: se corrigen todos igual.

## 4. Cómo se verificó

Contenedor local de PHP, con el código del worktree y un `vendor` instalado aparte desde cada lock, sin tocar el `vendor` del contenedor.

- `composer audit --locked`: antes, 7 avisos en 4 paquetes; después, sin avisos.
- `composer validate --strict`: válido.
- Pint: sin errores (339 archivos). PHPStan: sin errores. `route:list --except-vendor`: termina bien.
- **Suite completa, MySQL 8.4:** 552 tests con 6 errores y 10 fallas, tanto con el lock anterior como con el nuevo. La lista de tests que fallan es idéntica en las dos corridas. Están en `CollectionEmailTest`, `CollectionsTest`, `QueueDispatchFlowTest`, `WebChatAndUsageTest`, `PrepareMetaReviewTest` y `ProductionEnvironmentTest`. Esta actualización no los causa, pero su causa no se investigó en este ticket.
- **Sin verificar:** E2E, `redocly lint` e imagen de producción no corrieron localmente; quedan para el CI del PR. El panel no se probó contra el API actualizado, y nada se desplegó.

## 5. Pendientes y riesgos

- **`develop` primero:** #105 y #106 siguen en rojo hasta que este cambio entre en `develop` y sus ramas se actualicen con él.
- **Producción:** `main` sigue con `symfony/http-foundation` 8.1.9, una versión afectada, y este ticket no lo cambia. Llevarlo a producción requiere su propio `hotfix/*` o release, con autorización. Antes de un pase hay que verificar forwards SQL pendientes (`schema_versions`), dominios definitivos, CORS/R2, hosts/Sanctum/cookies (`tenant_domains`), credenciales y permisos de proveedores, base de datos y storage.
- **Mirar en el PR:** localmente, 16 tests fallan con y sin este cambio. Si en el CI pasan, la causa es del entorno local.
