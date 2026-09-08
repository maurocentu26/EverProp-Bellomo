# Inventario técnico de material visual Bellomo

Auditoría realizada el 4 de septiembre de 2026 sobre la carpeta compartida
`Material Bellomo / Fotos` de Google Drive.

## Alcance de la fuente

| Tipo | Cantidad | Tamaño total |
| --- | ---: | ---: |
| ZIP | 26 | 53.004.733.347 bytes |
| Videos MP4 independientes | 2 | 6.622.863.317 bytes |
| PDF ajeno al archivo fotográfico | 1 | 214.951 bytes |
| **Total** | **29** | **59.627.811.615 bytes (59,63 GB)** |

Los 26 ZIP fueron inspeccionados por rangos HTTP y lectura de su directorio
central. Este método permitió identificar nombres, carpetas, tipos y tamaños sin
descargar más de 53 GB de contenedores al equipo local.

## Material incorporado

Se extrajeron candidatos desde la carpeta preparada por Bellomo como
`CONTENIDO / PAGINA WEB / FOTOS DE CADA LOTEO` y se complementaron con tomas
recientes de cámara y dron. Después de la revisión visual se publicaron 60 piezas:

| Colección | Piezas | Tipo principal |
| --- | ---: | --- |
| El Rocío | 4 | Fotografía y vista aérea |
| San Pablo | 6 | Fotografía y vista aérea |
| Santa Emilia | 4 | Fotografía |
| Valle Verde | 4 | Fotografía, vista aérea y 2 renders rotulados |
| Los Cardinales | 3 | Vista aérea |
| La Arbolada I y II | 6 | Fotografía y vista aérea |
| Las Colinas | 4 | Fotografía y vista aérea |
| Los Arenales | 4 | Fotografía |
| Los Perales | 4 | Vista aérea |
| Quintas de San Antonio | 3 | Vista aérea |
| La Toma | 3 | Vista aérea |
| Arquitectura y vivienda | 10 | Fotografía y 4 renders rotulados |
| 50 años Bellomo | 3 | Archivo institucional |
| Oficina central | 2 | Fotografía |
| **Total** | **60** | **Archivo oficial Bellomo** |

## Tratamiento web

- Directorio de publicación: `public/images/official/`.
- Formato: WebP con calidad 82.
- Límite: 1.920 px de ancho y 1.440 px de alto, sin ampliación artificial.
- Peso final: 18.698.860 bytes para las 60 piezas.
- Se aplicó la orientación EXIF antes de codificar y no se conservaron metadatos
  innecesarios en las copias públicas.
- `next/image` define tamaños responsivos y carga diferida para la galería.
- El nombre del proyecto y el tipo de pieza quedan modelados en
  `src/data/bellomo.ts`; los renders se diferencian de las fotografías reales.

## Material conservado sólo en Drive

- Dos videos independientes de aproximadamente 3,62 GB y 3,00 GB.
- Videos MOV/MP4 y originales DNG/HEIC distribuidos dentro de los ZIP.
- Tomas repetitivas, versiones verticales duplicadas y archivos de producción.
- Fotografías de `La Noria`, pendientes de una ficha o confirmación comercial.
- `ESTE ARCHIVO.pdf`, excluido porque contiene material de EverSys y no una
  fuente fotográfica Bellomo.

Mantener estos originales fuera de Git evita archivos mayores al límite de
GitHub, reduce el tiempo de despliegue y preserva Drive como fuente maestra.
