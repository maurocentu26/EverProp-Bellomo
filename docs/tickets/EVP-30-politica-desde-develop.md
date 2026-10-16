# EVP-30 — CI: el check de ramas usa siempre la política de develop

Rama `ticket/EVP-30-politica-desde-develop` (desde `develop`) · fecha 2026-10-15 · Claude Code con Ramiro Ruggeri
Ticket Jira [EVP-30](https://eversys.atlassian.net/browse/EVP-30).

## 1. Qué pedía el ticket

En los PR hacia `develop`, `ticket-branch.yml` (EVP-17) ejecutaba `check-pr-policy.mjs` desde la rama **propuesta**. Eso tenía dos consecuencias:
1. **Los PR `main` → `develop` siempre fallaban** con `MODULE_NOT_FOUND`, porque `main` no tiene `.github/scripts`. Era el caso de #32, el sincronizado obligatorio después de cada hotfix.
2. **Un PR podía modificar su propio control:** si cambiaba el script en su rama, el check aprobaba lo que el mismo PR decidía.

## 2. Qué se implementó

[ticket-branch.yml](../../.github/workflows/ticket-branch.yml):
- La política se descarga siempre de `develop`, que es la rama protegida, para cualquier PR (a `develop` o a `main`). El log registra el SHA de la política usada.
- La decisión del check la toma siempre esa política confiable.
- **Los tests de regresión corren dos veces:**
  - sobre la política confiable;
  - sobre la versión propuesta, solo si el PR trae los scripts. Así, un cambio de política se prueba en su propio PR, pero no decide el resultado.
- Si la rama no tiene scripts (el sincronizado `main` → `develop`), lo informa y sigue.

## 3. Por qué esta solución

- **Es la práctica estándar para checks de política:** el código que decide un control no puede venir del cambio que se controla. Para `main` ya se hacía así, y ahora es igual para `develop`.
- **Es el cambio mínimo:** no toca `check-pr-policy.mjs` ni sus reglas.

**Límite conocido:** el YAML del workflow sí sale del PR, así que alguien con permiso de push podría editarlo. Por eso la protección remota tiene que exigir revisión de `.github/` (CODEOWNERS o un ruleset), como ya anota EVP-17.

## 4. Cómo se verificó

| Comprobación | Resultado |
|---|---|
| `actionlint` 1.7.7 sobre el workflow | Sin errores |
| `main` → `develop` con la política de `develop` | Pasa |
| `ticket/EVP-30-…` → `develop` | Pasa |
| `feature/sin-ticket` → `develop` | Falla, como corresponde |
| `node --test check-pr-policy.test.mjs` | 4 tests OK |
| Ejecución real en GitHub Actions | En el CI del PR de esta rama. Después, volver a correr #32 |

## 5. Pendientes y riesgos

- **Después del merge:** volver a correr el CI de #32. El workflow de un PR se toma del merge con `develop`, así que va a usar esta versión.
- **Admin:** exigir revisión de `.github/` en la protección de `develop`.
