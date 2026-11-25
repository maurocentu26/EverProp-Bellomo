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

## QA integrada posterior

- En navegador, con la API EVP-204 y MySQL 8.4 aislado, se creó un departamento con medidas, expensas y característica; se leyó en la ficha y se editó la característica. Se revisó la ficha y el modal en ancho de 390 px.
- La prueba integrada detectó campos de lote en el modal residencial; se ocultaron y se ajustó el resumen de revisión. El identificador `2-undefined` provenía de la integración local con EVP-203; se corrigió en esa rama.
- Pendiente de verificación: alta de casa, teclado, asesor de solo lectura y recuperación de errores parciales. Los cuatro fallos globales preexistentes siguen clasificados como gate previo. Los comentarios de Jira EVP-205 eran cero al crear la PR.

PR: https://github.com/maurocentu26/EverProp-Bellomo/pull/183. No se fusionó ni desplegó esta rama. El backend EVP-204 debe integrarse antes de usar los campos nuevos en producción.
