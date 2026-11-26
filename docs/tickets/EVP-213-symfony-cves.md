# EVP-213: actualizar Symfony por CVEs

Fecha: 2026-11-26. Rama: `ticket/EVP-213-symfony-cves`, desde `develop` (`cb3b7a2`).

## 1. Problema

El job `verify` del backend corre `composer audit --locked`. Desde el 25/11 falla con:

> Found 5 security vulnerability advisories affecting 3 packages

Los paquetes afectados son `symfony/routing`, `symfony/http-kernel` y `symfony/mailer`. Entre las advisories están CVE-2026-133746 y CVE-2026-133754, en las que `UrlGenerator` puede generar URLs hacia otro host.

No lo causa ningún cambio de código: falla el `composer.lock` de `develop`. Bloquea cualquier PR de backend; lo detectó el PR #188 (EVP-212).

## 2. Qué se hizo

Se corrió:

```
composer update symfony/routing symfony/http-kernel symfony/mailer --with-dependencies --patch-only
```

`--patch-only` impide subir de minor. `composer.json` no cambió; solo cambió `composer.lock`.

| Paquete | Antes | Después |
|---|---|---|
| `symfony/routing` | v8.1.11 | v8.1.12 |
| `symfony/http-kernel` | v8.1.11 | v8.1.12 |
| `symfony/http-foundation` | v8.1.11 | v8.1.12 |
| `symfony/mailer` | v8.1.2 | v8.1.12 |
| `symfony/mime` | v8.1.10 | v8.1.12 |
| `symfony/var-dumper` | v8.1.10 | v8.1.12 |
| `symfony/service-contracts` | v3.7.1 | v3.7.3 |
| `egulias/email-validator` | 4.0.4 | 4.0.5 |
| `doctrine/lexer` | 3.0.1 | 3.0.3 |

`http-foundation` tenía que acompañar a `http-kernel`, que lo exige en `^8.1.12`. El resto son dependencias de `mailer` y `mime`. Todos los cambios son de parche.

## 3. Cómo se verificó

Docker local con MySQL 8.4 y PHP 8.4:
- `composer audit --locked`: **No security vulnerability advisories found**;
- `pint --test`: PASS;
- `phpstan analyse`: sin errores;
- `php artisan test`: suite completa en verde (sección 4).

## 4. Resultado de la suite

`php artisan test` (suite completa): **1228 passed, 2 skipped** (7743 assertions). Al terminar se detuvo el stack local, sin borrar bases ni volúmenes.

## 5. Pendientes

- Después del merge, actualizar el PR #188 (EVP-212) con `develop` para que su CI pase.
- No requiere deploy específico: el próximo despliegue de staging toma el lock nuevo.
