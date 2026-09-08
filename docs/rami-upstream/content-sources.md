# Fuentes de contenido Bellomo

Inventario editorial usado para la integración web del 4 de septiembre de 2026.
Este archivo documenta procedencia y criterios; no reemplaza una validación
comercial o legal de vigencia.

## Fuentes principales

| Fuente | Uso | SHA-256 |
| --- | --- | --- |
| `BELLOMO Web textos ok - 2026.docx` | Historia, métricas, proyectos, ubicaciones, servicios y cartera | `28322BE9C51E4D8A576E4957891A21AD0C641D335A910A839CF86AEB1682A3D9` |
| `Financiación Bellomo.docx` | Entregas mínimas, cuotas, tasas, reservas y observaciones | `43034B1BBE6D6F2533F97FD9CDC2EFCE8F1A2125E9E5A524ACE8BA560EF81ADC` |
| `Manual de Marca, BELLOMO ALTA.pdf` | Paleta, tipografía, proporciones y reglas de uso de marca | `FB25D4F94FBD74F2861EC39E7E6A27FE763F2D035CCE4B3DE91779C792E45A5E` |
| Carpeta `Logos loteos` de Drive | Logos oficiales de proyectos publicados en `public/brand/projects/` | Verificación por nombre y tamaño contra Drive |
| Carpeta `FICHAS DE PRESUPUESTOS` de Drive | Contraste visual de logos, dirección, teléfono y fichas disponibles | Sólo lectura; no se publican formularios internos |
| Carpeta `Fotos` de Drive | Fotografías reales, vistas aéreas, renders identificados y archivo del 50.º aniversario | Inventario técnico en `docs/drive-media-inventory.md` |

## Criterios editoriales

- Se priorizan los indicadores institucionales más recientes: 50 años, más de
  15 loteos, más de 200 obras públicas, más de 2.000 terrenos vendidos y más de
  500 clientes activos.
- No se publican porcentajes históricos de lotes vendidos como disponibilidad
  actual.
- La financiación no se muestra como sección ni calculadora pública. Bellomito
  conserva esa referencia y siempre exige confirmación de vigencia, disponibilidad
  y cotización.
- Los importes, tasas, plazos, descuentos y fechas estimadas no se presentan
  como oferta vinculante.
- Las notas de blog de 2020 y convenios vencidos se excluyen de contenido actual.
- Una ficha titulada `Los Cardinales` contiene un rótulo interno de `Valle
  Verde`; se excluye como evidencia pública hasta que Bellomo confirme la versión.
- El PDF `ESTE ARCHIVO.pdf` dentro de `Fotos` contiene material institucional de
  EverSys, no material fotográfico Bellomo, y queda fuera del sitio.
- Los 26 ZIP de la carpeta `Fotos` se inspeccionaron mediante lectura remota de
  sus índices, sin descargar los contenedores completos. Se seleccionaron 60
  piezas oficiales, se aplicó la orientación embebida y se generaron copias WebP
  de hasta 1.920 × 1.440 px para la web.
- Los originales, los videos 4K y las tomas repetitivas permanecen como fuente
  maestra en Drive: no se incorporan al repositorio porque el conjunto supera
  59 GB y afectaría el clonado, el despliegue y la experiencia de navegación.
- Los renders de Valle Verde, Huasi, Galería Norte y viviendas de Perico se
  rotulan como `Render`; no se presentan como obra terminada.
- Las tomas de `La Noria` no se asocian a un proyecto público porque no existe
  una ficha comercial ni un logo que permitan confirmar esa relación.
- El Arrabal, Rincones de San Pedrito, Loteo Palpalá, Martín Raúl Galán, Huasi
  VII y Terrazas de Galán usan identidad oficial en sus cards mientras no haya
  una fotografía confirmada para cada desarrollo. No se reutilizan imágenes de
  La Toma, Huasi VIII o Quintas de San Antonio como si pertenecieran a ellos.
- `el-arrabal-web.png` y `las-colinas-2-web.png` son variantes deterministas de
  los PNG oficiales: sólo eliminan el lienzo blanco excedente y agregan margen
  óptico. Los archivos maestros recibidos permanecen intactos.

## Vigencia y mantenimiento

La fuente editorial pública consumida por la interfaz es `src/data/bellomo.ts`.
Las condiciones financieras viven en `src/lib/server/financing.ts`, marcado
`server-only` y consumido exclusivamente por Bellomito. Cualquier cambio comercial
debe actualizar la fuente correspondiente, conservar la advertencia de vigencia y
volver a ejecutar lint, tipos, build y QA responsive.

Las copias web oficiales viven en `public/images/official/`. No deben
reemplazarse por descargas sin optimizar. Antes de desplegar el archivo del
aniversario en un entorno público, Bellomo debe confirmar los permisos de uso de
imagen de las personas fotografiadas.

No existe una calculadora pública. Bellomito puede calcular el precio sin comisión
en el servidor y no usa un porcentaje almacenado por proyecto: la persona usuaria
debe indicar el porcentaje vigente en cada consulta. Se asume que la comisión fue
agregada sobre el precio neto: `precio neto = precio final / (1 + porcentaje / 100)`.
