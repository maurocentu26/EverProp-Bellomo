# EVP-171: editar datos del proyecto y de sus unidades desde la ficha

Rama `hotfix/evp-171-editar-ficha-proyecto` desde `main` @ `bdf4954` (después de EVP-170) · 2026-11-20 · Mauro Centurión con Claude

## Reporte

Hacía falta poder modificar cada ficha de proyecto en producción. El backend ya aceptaba `PUT /api/v1/admin/projects/{id}`, pero el panel no tenía una pantalla para hacerlo. El ingreso guiado de EVP-170 solo abre proyectos creados por ese flujo, así que devolvía 404 para los 28 proyectos importados del Excel.

En producción los nombres siguen siendo los rótulos del Excel ("LA ARBOLADA.", "LOTEO …"). Uno además tiene la codificación rota: "Remanente El RocÃ­o". Con esta edición se pueden corregir desde el panel.

## Cambio (solo frontend, sin backend ni esquema)

- **`components/admin/ProjectBasicsFields.tsx` (nuevo):** los campos del paso 1 del ingreso, extraídos de `ProjectIntakeForm` sin cambiarlos. El ingreso y la edición usan el mismo formulario.
- **`components/admin/ProjectEditDialog.tsx` (nuevo):** el diálogo "Editar datos".
  - Carga `GET /admin/projects/{id}`, muestra los campos básicos más la descripción y guarda con el `PUT` que ya existía.
  - Los 422 se muestran en su campo y un 403 avisa que el perfil no tiene permiso.
  - Si la etapa nueva es pública (Preventa, En construcción o Finalizado) y la anterior no lo era, pide confirmar porque eso publica las unidades disponibles (`ProjectStatus::publicValues`).
- **`app/admin/desarrollos/[id]/page.tsx`:**
  - Botón "Editar datos" junto a "Cargar manzana y lotes". Al guardar, el encabezado se actualiza sin recargar.
  - Botón "Editar" en cada unidad, que abre `EditPropertyModal`; la fila, la barra de estados y los filtros se recalculan.
  - Ambos botones aparecen solo para perfiles que no son asesores. El asesor sigue en solo lectura.
  - "Editar datos" se oculta en modo mock, que no tiene API.
- **`lib/project-intake.ts`:**
  - `projectEditPayload()`: datos básicos más descripción.
  - `publishesProject()`: detecta el paso a una etapa pública.
  - `intakeBasics()` tolera nombre, ciudad o provincia vacíos.
- **`lib/everprop-api.ts`:** `updateEverpropProject()` devuelve el proyecto ya mapeado.
- **`app/admin-catalog.css`:** `.project-unit-actions` (en desktop los dos botones van en línea, en celular ocupan el ancho completo).

**El precio de la unidad se actualiza en la ficha** (era un riesgo identificado en el plan): `updateEverpropProperty` devuelve `mapProperty(...)`, que vuelve a calcular `inventoryPrice`/`inventoryCurrency`, que es lo que lee `inventoryPriceLabel()`.

## Verificación

- **`npm run test:projects`:** 25 pass, 0 fail. Son 2 tests nuevos en `project-intake.test.mjs`:
  - Un proyecto importado con dirección y avance nulos conserva sus datos, y solo se envían campos editables.
  - El aviso de publicación aparece solo al pasar a una etapa pública.

  Además, `projects-redesign.test.mjs` ahora verifica que el asesor no ve "Editar" y que el administrador lo ve en cada unidad.
- **`npx eslint`** sobre los archivos tocados: 0 errores y ningún warning nuevo (los de `any` en `everprop-api.ts` ya existían).
- **`npm run build`** (Next 16.3.6): compila y pasa el chequeo de TypeScript.
- **QA en navegador en modo mock** (`http://localhost:3171`), sobre "Loteo San Pablo 1":
  - **Administrador:** "Editar" en cada unidad. Al cambiar Lote 20 a precio USD 19.000 y estado Reservado, la fila muestra "Reservado · USD 19.000" y la barra pasa a "1 en venta · 12 reservadas".
  - **Asesor:** sin botones de edición y con "Solo lectura".
  - **Celular (375×812):** botones de 310×52 px y sin scroll horizontal.
- **QA contra la API real** (stack Docker aislado `evp171-qa` en `:18171`, esquema importado y verificado con 53 tablas y 118 FKs, datos de `everprop:local-demo`, panel en `:3000`), sobre "Loteo San Pablo 1":
  - **Carga:** el diálogo trae los datos reales del proyecto, descripción incluida.
  - **422:** un nombre de 201 caracteres (salteando el `maxLength` del input) muestra el error de la API en el campo Nombre, con `aria-invalid`, y el diálogo queda abierto. El mensaje llega en inglés desde Laravel; eso ya pasaba antes y no cambia con este ticket.
  - **Guardar:** el cambio de nombre, dirección y descripción actualiza el encabezado sin recargar. Después de recargar sigue igual, y la base tiene los valores nuevos.
  - **Etapa pública:** pasar de "En construcción" a "En planificación" no pide confirmación. Pasar de "En planificación" a "Preventa" muestra el aviso y cambia el botón a "Confirmar y publicar". Si se cambia la etapa, el aviso desaparece. Al confirmar se guarda `PRE_SALE`.
  - **403:** Sofía Bellomo (gerencia comercial, sin `can_manage_inventory`) recibe "Tu perfil no tiene permiso para editar o publicar este proyecto." y no se guarda nada.
  - **Unidad desde la ficha (administrador):** Lote 15 de la Manzana AP7 pasa a USD 20.000 y Reservado. La fila muestra "Reservado · USD 20.000" con el valor que devuelve la API, y la barra pasa de "11 en venta · 2 reservadas" a "10 en venta · 3 reservadas".
- **Observación, fuera de alcance:** la gerencia comercial ve "Editar datos" y "Editar" porque no es asesora, pero la API le responde 403 si no tiene `can_manage_inventory`. El aviso de permiso lo cubre. Ocultar los botones según ese permiso requeriría exponerlo en la sesión del panel.

## Fuera de alcance y riesgos

- No incluye borrar proyectos, subir materiales (módulo Web) ni reimportar el Excel.
- Una reimportación futura del Excel vuelve a pisar estado y precio de las unidades. Desde EVP-110 conserva nombre, ciudad y dirección del proyecto.
- Después del merge a `main`, sync `main` → `develop`, porque `develop` tampoco tiene esta edición.
