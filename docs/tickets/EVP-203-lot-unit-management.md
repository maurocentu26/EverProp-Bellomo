# EVP-203 — Administración individual de lotes

Rama `ticket/EVP-203-lot-unit-management` · 2026-11-25 · Álvaro Ruggeri / Codex

## Alcance implementado

- Desde un proyecto, «Agregar unidad» abre el alta de un lote individual con el proyecto preseleccionado. El formulario vuelve a la ficha de ese proyecto al guardar.
- La edición permite cambiar frente, fondo, ochava, padrón y servicios, conservando otros atributos comerciales del lote. Permite quitar precio y moneda juntos; el adaptador envía ambos `null`.
- La ficha de lote y la lista del proyecto permiten pasar a «No comercializado». La matriz ofrece el cambio desde el lote seleccionado. Los cambios de estado conservan `version` y piden confirmación.
- El lote se puede eliminar desde la ficha, la lista y la matriz cuando el perfil declara la capacidad `delete`; siempre pide confirmación. La UI distingue 403 y 409, y la lista/contadores se actualizan tras éxito.
- Las acciones se ocultan a asesores y perfiles sin las capacidades de creación, edición o borrado. La API sigue siendo la autoridad final para alcance por proyecto y `can_manage_inventory`.

## Verificación realizada

- `npm run lint`, `npx tsc --noEmit`, `npm run build`: pasan.
- Los siete scripts de test pedidos por el ticket (`test:conversations`, `test:follow-up`, `test:chat-session`, `test:statistics`, `test:materials`, `test:password-recovery`, `test:collections`): pasan.
- Pruebas focalizadas de adaptador, proyecto, matriz y ficha: 28/28 pasan. Incluyen contrato de precio/moneda nulos, medidas/servicios, estado no comercializado, ruta de borrado y visibilidad de acciones.
- `node --test tests/*.test.mjs`: 231/235 pasan, cuatro fallos. En `develop` limpio esos mismos cuatro casos fallan (228/232); son un gate previo y requieren clasificación con el equipo antes de considerar verde el suite global.

## Pendiente antes de PR listo para merge

- QA en navegador contra la API y MySQL de prueba: alta individual, edición, estado, borrado, confirmación, 403/409 y contadores; recorrer roles con y sin permiso.
- Revisar la interacción de selección de la matriz en pantalla pequeña y con teclado.
- Releer comentarios nuevos de Mauro en Jira y en el PR antes del cierre. Al iniciar EVP-203 no había comentarios.

No se fusionó ni desplegó esta rama.
