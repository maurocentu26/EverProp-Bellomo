# Requerimiento de Material Multimedia — Catálogo de Proyectos Bellomo
**Documento de Auditoría y Solicitud Comercial · Ticket EVP-56**  
**Fecha:** 22 de Octubre de 2026  
**Dominio CDN Cloudflare R2:** `https://pub-6e84e10f99f7480da92cffa0fbe4b8b3.r2.dev/assets/`

---

## 1. Resumen de la Auditoría

De un total de **27 proyectos comerciales** activos en la base de datos de EverProp (`bellomo_crm`), se contrastaron las referencias existentes en el bucket Cloudflare R2 y los archivos de pre-producción de la landing:

* **14 proyectos (52%)** cuentan con material suficiente o completo para su publicación inmediata (fotos aéreas, renders de fachada, plantas o fichas de venta y logos vectoriales/PNG).
* **7 proyectos (26%)** cuentan con material parcial (por ejemplo, tienen logo oficial pero carecen de fotos de obra actualizadas o tipologías interiores).
* **6 proyectos (22%)** no cuentan con ningún archivo multimedia en Cloudflare R2 y se encuentran bloqueados para su presentación web.

---

## 2. Matriz General de los 27 Proyectos

| # | Proyecto | UUID (`public_id`) | Tipo | Estado R2 | Material Existente en Cloudflare R2 |
|---|---|---|---|:---:|---|
| 1 | **HUASI VII** | `92bf2eb9-507b-4743-ad62-fa6f673e2d1f` | Dpto. (Huasi) | ✅ **Completo** | Renders fachada (`imag 1x/2x`), interiores monoambiente/tipología C y F, plantas PB/1°/2°, logo `huasi-7.png`. |
| 2 | **HUASI IV** | `382c0cc2-c972-4779-9d43-3ae8f60c3642` | Dpto. (Huasi) | ⚠️ **Parcial** | Logo `LOGOS HUASIS/huasi-4.png`. Falta fachada y tipologías. |
| 3 | **HUASI VIII** | `271fa5e6-5dbc-4a98-a33a-ee2f81fdc2ff` | Dpto. (Huasi) | ⚠️ **Parcial** | Logo `LOGOS HUASIS/huasi-8.png`. Faltan renders de tipologías interiores. |
| 4 | **COCHERA HUASI III** | `c674815c-dd8e-4a65-ba94-b5a43f7b125b` | Comercial / Cochera | ⚠️ **Parcial** | Foto exterior de Huasi 3 y logo `huasi-3.png`. Falta toma específica de cocheras/portón. |
| 5 | **COCHERA ALVEAR** | `392941db-4f7c-4ef2-b122-12674dddfba0` | Comercial / Cochera | ⚠️ **Parcial** | Carpeta `EDIFICIO ALVEAR` (renders y planos). Faltan fotos operativas del acceso vehicular. |
| 6 | **COCHERA ALTO PADILLA** | `ecea7fb0-ae84-4094-b1b9-1427c1425451` | Comercial / Cochera | ⚠️ **Parcial** | Incluido en planos de PB de Huasi 7. Falta fotografía o render de portada comercial. |
| 7 | **GALERIA NORTE 2** | `2c09c68a-a135-455b-bfde-79c6a46e7c81` | Comercial / Locales | ✅ **Completo** | Carpeta `GALERIA CHIJRA II/RENDERS/` (10 renders de fachada y locales). |
| 8 | **GALERIA NORTE 1** | `c77a2d36-571c-4dbc-bc0a-5f644febbaac` | Comercial / Locales | ❌ **Faltante** | Sin archivos en R2. |
| 9 | **LA ARBOLADA.** | `4e543b83-5002-4c16-887b-c711d7945b29` | Loteo | ✅ **Completo** | Vista aérea oficial, fotografías de avance, fichas de venta y logo color/blanco. |
| 10 | **LA ARBOLADA 2** | `e9c89484-8213-4dd7-bba1-e2b1f710daa7` | Loteo | ✅ **Completo** | Carpeta `LA ARBOLADA II` (11 fotos/renders) y logo oficial. |
| 11 | **LAS COLINAS** | `0de7600f-1f9d-478f-8c98-504e29b42f0c` | Loteo | ✅ **Completo** | Vistas aéreas oficiales, infraestructura, fichas de venta y logo color/blanco. |
| 12 | **EL ROCIO** | `22836b31-5c48-48d0-9539-5f78b311c43d` | Loteo | ✅ **Completo** | Vistas aéreas, fichas de presupuesto exterior/interior y logos oficiales. |
| 13 | **LOTEO ARENALES** | `4db0b427-1dd6-473c-8b6f-1547ced6d4c2` | Loteo | ✅ **Completo** | Panorámica oficial, fotos de loteo en carpeta `LOTEO ARENALES` y logo. |
| 14 | **FRACCION ARENALES** | `e8ba05b4-3a99-49ab-a178-c854cedd68a0` | Loteo | ⚠️ **Parcial** | Puede compartir vistas de Arenales si se confirma identidad de predio. |
| 15 | **LOTEO CARDINALES** | `ba2810c4-4a2e-4be8-8eec-5fb124d0160b` | Loteo | ✅ **Completo** | Vistas aéreas oficiales, renders de loteo y logos. |
| 16 | **LOTEO LOS PERALES** | `7f842d41-0e54-48b3-a87a-64dbd5a23938` | Loteo | ✅ **Completo** | Vista aérea oficial y logo `Los Perales color.png`. |
| 17 | **LOTEO SAN PABLO 1** | `95b45059-b614-426e-a2c8-4f2015db24a2` | Loteo | ✅ **Completo** | Vistas aéreas oficiales, fichas de venta exterior/interior y logos. |
| 18 | **LOTEO SAN PABLO 2** | `c89d5056-faab-4d12-a2f1-7b9b92d31632` | Loteo | ⚠️ **Parcial** | Comparte logo y entorno de San Pablo. Faltan fotos de avance de etapa 2. |
| 19 | **SANTA EMILIA MONTERRICO** | `0aaa4cf5-06a2-49a0-ab3c-4151fc5642f8` | Loteo | ✅ **Completo** | Fotos de paisaje oficial, fichas de venta y logos. |
| 20 | **QUINTAS DE SAN ANTONIO** | `2501a2c9-1b6d-4f0e-9021-ebce00f798c1` | Loteo | ✅ **Completo** | Carpeta `SAN ANTONIO- QUINTAS`, vistas aéreas, fichas de venta y logos. |
| 21 | **VALLE VERDE LOTEO** | `9dfebc25-b12b-4ddc-9521-01d058b8f831` | Loteo | ✅ **Completo** | Vistas aéreas oficiales, fichas de venta y renders. |
| 22 | **EL ARRABAL** | `663e4aed-45e5-427b-9a2e-fed1694fbd57` | Loteo | ⚠️ **Parcial** | Logos en alta resolución en R2 (`El Arrabal.png`, `El Arrabal_blanco.png`). Faltan fotos de campo / plano. |
| 23 | **LA TOMA loteo** | `96cce5b4-94d2-4ca0-a7d7-e1ef5e562c47` | Loteo | ❌ **Faltante** | Sin archivos en R2 ni local. |
| 24 | **LOTEO MARTIN RAUL GALAN** | `7ece348f-f98b-4e71-8453-da016b240d82` | Loteo | ❌ **Faltante** | Sin archivos en R2 ni local. |
| 25 | **LOTEO PALPALA** | `5c869339-34b9-4ef7-9ab3-0d58902bf5b4` | Loteo | ❌ **Faltante** | Sin archivos en R2 ni local. |
| 26 | **RINCONES 2** | `7e202edb-4677-43dc-a56e-6e4de0a270fd` | Loteo | ❌ **Faltante** | Sin archivos en R2 ni local. |
| 27 | **RINCONES LOTES E INFRA.** | `b3064009-3b18-41df-bee1-c10bc1011403` | Loteo | ❌ **Faltante** | Sin archivos en R2 ni local. |

---

## 3. Detalle de Archivos a Solicitar al Equipo Comercial

Para los **13 proyectos** que requieren material (6 faltantes + 7 parciales), se detallan los entregables requeridos:

### Proyectos sin Material (Críticos para publicar)

#### 1. LA TOMA Loteo (`96cce5b4-94d2-4ca0-a7d7-e1ef5e562c47`)
* [ ] **Portada principal:** Fotografía aérea o render panorámico (1920×1080 px mín., WebP o JPG alta calidad).
* [ ] **Galería:** Mínimo 3 fotografías de obra, acceso o entorno.
* [ ] **Logo del loteo:** Archivo PNG transparente o WebP (800×800 px mín.).
* [ ] **Plano de loteo:** Archivo PDF o JPG de alta resolución con la subdivisión y manzanas.

#### 2. LOTEO MARTIN RAUL GALAN (`7ece348f-f98b-4e71-8453-da016b240d82`)
* [ ] **Portada principal:** Fotografía de acceso o vista general del predio.
* [ ] **Galería:** 3 fotografías de entorno, servicios y cordón cuneta.
* [ ] **Logo del desarrollo:** PNG transparente.
* [ ] **Ficha / Masterplan:** Documento PDF con datos técnicos de los lotes.

#### 3. LOTEO PALPALA (`5c869339-34b9-4ef7-9ab3-0d58902bf5b4`)
* [ ] **Portada principal:** Vista panorámica del loteo en Palpalá.
* [ ] **Galería:** 3 fotografías de infraestructura y ubicación.
* [ ] **Logo:** PNG transparente.
* [ ] **Plano de ventas:** PDF o imagen de alta resolución.

#### 4. RINCONES 2 (`7e202edb-4677-43dc-a56e-6e4de0a270fd`)
* [ ] **Portada principal:** Vista aérea o render del desarrollo Rincones 2.
* [ ] **Galería:** Fotos de apertura de calles y tendido eléctrico.
* [ ] **Logo:** PNG transparente.

#### 5. RINCONES LOTES E INFRAESTRUCTURA (`b3064009-3b18-41df-bee1-c10bc1011403`)
* [ ] **Portada principal:** Fotografía de avance de obras de infraestructura.
* [ ] **Galería:** Fotos de servicios instalados (agua, luz, accesos).
* [ ] **Plano de infraestructura:** PDF técnico.

#### 6. GALERIA NORTE 1 (`c77a2d36-571c-4dbc-bc0a-5f644febbaac`)
* [ ] **Portada principal:** Fotografía de fachada o render de la galería comercial.
* [ ] **Galería:** Fotos de pasillos y locales comerciales.
* [ ] **Plano comercial:** Distribución de locales.

---

### Proyectos con Material Parcial (Complementarios)

#### 7. EL ARRABAL (`663e4aed-45e5-427b-9a2e-fed1694fbd57`)
* *Estado actual:* Cuenta con logos oficiales en alta resolución.
* [ ] **Faltante:** 1 fotografía de portada panorámica (1920×1080) y 2 fotos de avance en el predio.

#### 8. HUASI IV (`382c0cc2-c972-4779-9d43-3ae8f60c3642`)
* *Estado actual:* Cuenta con el logo `huasi-4.png`.
* [ ] **Faltante:** 1 render o fotografía de fachada terminada del edificio.

#### 9. HUASI VIII (`271fa5e6-5dbc-4a98-a33a-ee2f81fdc2ff`)
* *Estado actual:* Cuenta con el logo `huasi-8.png`.
* [ ] **Faltante:** Renders de fachada y plantas de tipologías.

#### 10. COCHERAS HUASI III / ALVEAR / ALTO PADILLA
* [ ] **Faltante:** Fotografía o render del ingreso vehicular y rampas de acceso para utilizar como portada comercial.

#### 11. LA ARBOLADA 2 / SAN PABLO 2 / FRACCION ARENALES
* [ ] **Faltante:** Confirmar si el equipo comercial aprueba reutilizar el material fotográfico de la etapa 1 o si enviarán fotos de la nueva etapa.

---

## 4. Estándar Técnico de Entrega de Archivos

Para asegurar una carga directa y óptima en Cloudflare R2 sin degradación visual:

1. **Fotografías y Renders:**
   * Proporción recomendada: 16:9 o 4:3.
   * Resolución mínima: 1920×1080 píxeles.
   * Formatos admitidos: WebP, JPEG o PNG. Peso máximo: 10 MB por imagen.
2. **Logos de Proyectos:**
   * Fondo transparente obligatorio.
   * Formatos admitidos: PNG o WebP.
   * Dos versiones deseadas: Color original y Blanco monocromático (para fondos oscuros).
3. **Documentos y Planos:**
   * Formato: PDF estándar (no protegido con clave). Peso máximo: 20 MB.
