# EVP-L09 — Check de GitHub: la rama del PR lleva la clave del ticket

Rama `ticket/EVP-L09-check-rama-ticket` (desde `develop`) · fecha 2026-10-12 · Claude Code con Ramiro Ruggeri
ID local provisorio (serie EVP-L autorizada por el PM).

## 1. Qué pedía el ticket

`TICKETS.md` exige ramas `ticket/EVP-XX-<descripcion>`. Hasta ahora solo lo controlaban los agentes y las personas. El ticket pide que GitHub rechace los PR a `develop` cuya rama no lleve una clave `EVP-XX` (Jira) o `EVP-LXX` (local).

## 2. Qué se implementó

**Workflow nuevo** [.github/workflows/ticket-branch.yml](../../.github/workflows/ticket-branch.yml)
- Corre en los PR hacia `develop`: al abrirse, reabrirse, editarse y con cada push.
- Valida la rama de origen con `^ticket/EVP-(L[0-9]+|[0-9]+(\.[0-9]+)?)-[a-z0-9][a-z0-9-]*$`.
- Acepta también `main`, que vuelve a `develop` después de cada release (`CLAUDE.md`).
- Si la rama no cumple, falla con un mensaje que explica el formato.

**Documentación:** una línea nueva en `TICKETS.md` §1.

## 3. Por qué esta solución

- Es un workflow sin dependencias, sin checkout y con `permissions: {}`. No lee código ni secretos.
- El nombre de la rama, que viene del autor del PR, llega como variable de entorno y no se interpola en el script, así que no hay inyección de comandos.
- Formatos que acepta:
  - las claves reales de Jira (`EVP-14`);
  - las de proceso que ya existen (`EVP-0`, `EVP-0.1`);
  - las locales (`EVP-L01`).
- **Descartado:**
  - validar el título del PR o los commits: la rama ya vincula todo y no hace falta duplicar el control;
  - consultar Jira para ver si el ticket existe: necesita credenciales en CI y Jira no está conectado.

## 4. Cómo se verificó

Se corrió localmente el script del paso (bash) con distintos nombres de rama:

| Rama | Resultado |
|---|---|
| `ticket/EVP-14-recordatorios-email`, `ticket/EVP-L09-check-rama-ticket`, `ticket/EVP-0.1-sin-ticket-no-hay-cambios`, `ticket/EVP-0-proceso-jira`, `main` | Pasa |
| `chore/staging-on-develop`, `ticket/EVP-14`, `ticket/evp-14-x`, `feature/EVP-14-x`, `ticket/EVP-14-x;rm`, `ticket/EVP-1-a$(id)` | Falla |

**No verificado:**
- **La ejecución en GitHub Actions.** Se verifica con el primer PR, y el de esta misma rama sirve de prueba.
- **El YAML no se validó con un parser** porque no había ninguno disponible en local. Sigue la misma estructura que `guard.yml`.

## 5. Pendientes y riesgos

- **Para que bloquee el merge**, un administrador del repo tiene que marcar `Ticket branch / name` como check requerido en la protección de `develop`. Sin eso, el check avisa pero no impide el merge.
- **Los PR a `main` no se validan** (vienen de `develop` o de ramas de integración). Si Producto quiere reglas para `main`, va en otro ticket.
