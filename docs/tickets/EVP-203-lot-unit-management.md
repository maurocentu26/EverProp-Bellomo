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
- Pruebas focalizadas de adaptador, proyecto, matriz y ficha: 29/29 pasan. Incluyen contrato de precio/moneda nulos, medidas/servicios, estado no comercializado, ruta de borrado y visibilidad de acciones.
- `node --test tests/*.test.mjs`: 232/236 pasan, cuatro fallos. En `develop` limpio esos mismos cuatro casos fallan (228/232); son un gate previo y requieren clasificación con el equipo antes de considerar verde el suite global.

## QA integrada posterior

- En navegador, con API real y MySQL 8.4 aislado, se creó un lote individual desde el proyecto, se editaron medidas/servicios, se vaciaron precio y moneda, se cambió a «No comercializado» y se eliminó desde la matriz. El contador del proyecto se corrigió para mostrar cero al eliminar la última unidad.
- La integración con EVP-205 detectó un identificador `2-undefined` para un departamento sin número de unidad; se corrigió la construcción del identificador antes de subir la rama.
- Pendiente de verificación: 403/409 en navegador, roles sin permisos, matriz en móvil y teclado. Los cuatro fallos globales preexistentes siguen clasificados como gate previo. Los comentarios de Jira EVP-203 eran cero al crear la PR.

PR: https://github.com/maurocentu26/EverProp-Bellomo/pull/184. No se fusionó ni desplegó esta rama.

## Revisión de Mauro — servicios de lotes por rango

El comentario de revisión del 2026-11-25 detectó que `batch-generate` devolvía servicios como lista de códigos en español y el editor esperaba un objeto booleano con claves en inglés. El adaptador ahora normaliza las listas antiguas y los objetos que ya mezclaban ambos formatos. Conserva también claves desconocidas y da prioridad a una selección booleana explícita frente al código heredado. Los lotes nuevos generados por rango se envían como objeto booleano, el mismo formato que usa el editor. Alumbrado público y cordón cuneta figuran en el editor, la revisión y la matriz; el alta individual también los envía en `services_json`.

La regresión cubre lectura de una lista de servicios de un lote generado por rango, su edición sin índices numéricos, la conservación de alumbrado/cordón y un objeto previamente mezclado.

## Integración con EVP-204 y EVP-205

Tras fusionarse #182 y #183 en `develop`, se incorporó `origin/develop` en esta rama. Los conflictos de `everprop-api.ts`, `EditPropertyModal.tsx`, `NewPropertyForm.tsx` e `inventory-redesign.test.mjs` quedaron resueltos conservando los campos residenciales, el editor de características y las acciones individuales de lotes. La diferencia con `develop` se limita al alcance de EVP-203 y sus pruebas.

Verificación tras la integración: 31/31 pruebas focalizadas de API, ficha, matriz y proyecto; `npm run lint -- --quiet`, `npx tsc --noEmit`, `npm run build` y los siete scripts de regresión pedidos por el ticket pasan. La QA previa con API real y MySQL aislado recorrió el alta, edición, cambio de estado y borrado; queda pendiente repetir ese recorrido en navegador sobre la rama fusionada, junto con 403/409, perfiles restringidos, matriz móvil y teclado. Los cuatro fallos del suite global identificados antes de esta integración siguen clasificados como gate previo; no se volvió a ejecutar el suite global en esta pasada.
