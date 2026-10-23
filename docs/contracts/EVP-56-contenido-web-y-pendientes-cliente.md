# Contenido de proyectos para Web — revisión con Bellomo

Precarga exclusivamente local. Se conservan los datos originales del inventario y no se publica ningún proyecto automáticamente. Mauro confirmó dejar pendientes las correspondencias dudosas.

## Preparado para editar

27 borradores en Web;12 correspondencias con catálogos/textos de la landing.133 referencias de archivos registrables. Los datos sin texto público o sin imágenes quedan vacíos, sin inventar información.

Nombre, resumen, descripción, servicios, portada, logo, galería, orden y selección del Hero se editan desde Web. Eslogan, distancia y financiación existentes se conservan en la descripción con etiquetas; servicios en características. Las fichas técnicas y planos en formato imagen quedan en galería con su texto identificador. Los PDF, cuando existan, se registran como documentos. No se agregó un editor de campos nuevos.

| Proyecto en Web | Fuente adicional | Archivos | Imágenes de galería | Texto público |
|---|---|---:|---:|---|
| LOTEO SAN PABLO 1 | Solo inventario / archivos ya asociados | 6 | 6 | Falta texto público |
| Valle Verde | valle-verde | 9 | 9 | Disponible |
| RINCONES LOTES E INFRAESTRUC. | Solo inventario / archivos ya asociados | 0 | 0 | Falta texto público |
| COCHERA HUASI III | Solo inventario / archivos ya asociados | 2 | 2 | Falta texto público |
| LOTEO PALPALA | Solo inventario / archivos ya asociados | 0 | 0 | Falta texto público |
| LOTEO MARTIN RAUL GALAN | Solo inventario / archivos ya asociados | 0 | 0 | Falta texto público |
| RINCONES 2 | Solo inventario / archivos ya asociados | 0 | 0 | Falta texto público |
| COCHERA ALVEAR | Solo inventario / archivos ya asociados | 8 | 8 | Falta texto público |
| Las Colinas | las-colinas | 13 | 12 | Disponible |
| Edificio Huasi 4 | edificio-huasi-4 | 2 | 1 | Disponible |
| GALERIA NORTE 1 | Solo inventario / archivos ya asociados | 0 | 0 | Falta texto público |
| La Arbolada | la-arbolada | 10 | 9 | Disponible |
| COCHERA ALTO PADILLA | Solo inventario / archivos ya asociados | 0 | 0 | Falta texto público |
| El Rocío | el-rocio | 9 | 9 | Disponible |
| Los Cardinales | los-cardinales | 4 | 4 | Disponible |
| LOTEO LOS PERALES | los-perales | 2 | 1 | Disponible |
| Santa Emilia | santa-emilia | 9 | 9 | Disponible |
| LOTEO SAN PABLO 2 | Solo inventario / archivos ya asociados | 0 | 0 | Falta texto público |
| EL ARRABAL | Solo inventario / archivos ya asociados | 2 | 2 | Falta texto público |
| LOTEO ARENALES | Solo inventario / archivos ya asociados | 7 | 7 | Falta texto público |
| Quintas de San Antonio | quintas-san-antonio | 14 | 14 | Disponible |
| FRACCION ARENALES | Solo inventario / archivos ya asociados | 0 | 0 | Falta texto público |
| Edificio Huasi 8 | edificio-huasi-8 | 2 | 1 | Disponible |
| Edificio Huasi 7 | edificio-huasi-7 | 13 | 13 | Disponible |
| LA TOMA loteo | Solo inventario / archivos ya asociados | 0 | 0 | Falta texto público |
| GALERIA NORTE 2 | galeria-norte-ii | 10 | 10 | Disponible |
| LA ARBOLADA 2 | Solo inventario / archivos ya asociados | 11 | 11 | Falta texto público |

## Decisiones que debe confirmar el cliente

Estos contenidos se conservan completos en la sección provenance del manifiesto de precarga; todavía no se asociaron a otro proyecto ni se crearon registros nuevos.

| Contenido de la landing | Imágenes disponibles | Confirmación requerida |
|---|---:|---|
| Los Arenales | 4 | Confirmar Loteo Arenales o Fracción Arenales; no inferir El Arenal. |
| San Pablo | 6 | Confirmar etapa 1 o 2. |
| Edificio Huasi 3 | 2 | La landing describe el edificio; EverProp tiene una cochera, no asociar ambos como si fueran lo mismo. |
| Edificio Huasi X | 9 | No tiene equivalente en los 27 proyectos de inventario. |
| Torre de Departamentos H9 | 21 | No tiene equivalente en los 27 proyectos de inventario. |
| Edificio Huasi 1 | 2 | No tiene equivalente en los 27 proyectos de inventario. |
| Edificio Huasi 2 | 2 | No tiene equivalente en los 27 proyectos de inventario. |
| Edificio Huasi 5 | 2 | No tiene equivalente en los 27 proyectos de inventario. |
| Edificio Huasi 6 | 1 | No tiene equivalente en los 27 proyectos de inventario. |
| Sala de Convenciones Corporativa | 0 | No tiene equivalente en los 27 proyectos de inventario. |

También quedan sin asociar las tarjetas del Hero de Huasi X, Torre Huasi IX y Espacios en Huasi IX. El material general de marca/empresa no se asocia arbitrariamente a un proyecto. No se toman precios ni moneda de textos comerciales temporales del catálogo de demostración.

## Límites y datos pendientes

- Preparar un borrador no significa que el contenido comercial esté actualizado ni aprobado para producción. Bellomo debe revisar financiación, servicios y disponibilidad antes de publicarlo.
- Las imágenes ya registradas en el manifiesto anterior conservan su asociación original. En COCHERA HUASI III solo se reutiliza ese archivo aprobado; no se importó la descripción del edificio Huasi3.
- Los proyectos con solo inventario necesitan un resumen antes de activar Mostrar en la landing. Los destacados además requieren portada.
- Hay direcciones y descripciones heredadas con problemas de codificación (por ejemplo caracteres de República y posesión); no se corrigió ni sustituyó el inventario original. Se pueden corregir los textos editoriales desde Web.
- Se comprobó disponibilidad HTTP de137 URLs únicas del conjunto inicial (todas200); cinco URLs de logos se normalizaron para codificar espacios y deduplicar referencias. No equivale a comprobar derechos de uso o exactitud del contenido.
- La integración local consulta la API sin caché: guardar en Web y recargar la landing muestra el estado seleccionado. La actualización de una pestaña ya abierta no es automática.
- Nada se aplicó a staging o producción.
- La precarga de borradores ocultos retira esos proyectos y sus unidades del catálogo público/Bellomito **local** hasta que se activen desde Web; no modifica el inventario comercial guardado.
- Las 10 tarjetas de `bellomo.ts` están marcadas en origen como demo temporal. Se archivaron completas para revisión; sus estados/disponibilidad no se copiaron como datos confirmados.
