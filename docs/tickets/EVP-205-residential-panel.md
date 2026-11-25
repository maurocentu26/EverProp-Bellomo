# EVP-205 — Carga y edición residencial en el panel

Rama `ticket/EVP-205-residential-panel` · 2026-11-25 · Álvaro Ruggeri / Codex

## Alcance

El panel permite cargar y editar ambientes separados de dormitorios, baños, superficies, piso, orientación, disposición, cocheras, expensas y características flexibles para casas y departamentos. La ficha y las tarjetas muestran ambientes y dormitorios con sus nombres correctos. El contrato backend está en EVP-204; esta rama no modifica la API Laravel.

## Implementación

- `everprop-api.ts` mapea los campos residenciales y conecta el CRUD de características al recurso administrativo existente.
- Los formularios de alta y edición validan cifras, moneda de expensas y características duplicadas antes de guardar.
- Las características se guardan después de crear o actualizar la propiedad. Si falla una operación intermedia, el formulario informa el estado parcial y ofrece abrir o recargar la ficha; evita repetir a ciegas el alta.
- La ficha y las tarjetas distinguen «Ambientes» de «Dormitorios». La edición del asesor sigue vedada por el control de permisos existente.

## Verificación realizada

- `npm run lint`, `npx tsc --noEmit` y `npm run build`: pasan.
- Los siete scripts de test pedidos por el ticket (`test:conversations`, `test:follow-up`, `test:chat-session`, `test:statistics`, `test:materials`, `test:password-recovery`, `test:collections`): pasan.
- Pruebas focalizadas de adaptador y formulario: 16/16 pasan; incluyen separación de ambientes, mapeo de superficies/expensas y rutas/payloads de características.
- `node --test tests/*.test.mjs`: 230/234 pasan, 4 fallan. Contrastado con `develop` en un worktree limpio: 228/232 pasan, los mismos 4 casos fallan allí (assistant trace, cobranzas y dos de conversaciones). No se atribuyen a este cambio, pero siguen siendo un gate rojo a resolver antes del cierre global.

## Pendiente antes de PR listo para merge

- QA de alta, edición y lectura de casa y departamento en navegador contra el backend EVP-204 y MySQL de prueba aislado.
- Verificar en pantalla pequeña, teclado, asesor de solo lectura y recuperación de errores parciales.
- Resolver o clasificar formalmente los cuatro fallos preexistentes del gate web con el equipo.
- Releer los comentarios de Jira/PR al terminar; al iniciar este trabajo EVP-205 no tenía comentarios.

No se fusionó ni desplegó esta rama. El backend EVP-204 debe integrarse antes de usar los campos nuevos en producción.
