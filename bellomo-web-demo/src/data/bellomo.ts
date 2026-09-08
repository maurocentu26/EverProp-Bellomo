/**
 * Fuente editorial: material oficial Bellomo recibido en septiembre de 2026.
 * Los estados de disponibilidad y las condiciones financieras requieren
 * confirmación comercial antes de reservar o contratar.
 */

export type BellomoImage = {
  src: string;
  alt: string;
  fit?: "cover" | "contain";
  position?: string;
  source: "archivo Bellomo" | "material comercial Bellomo" | "referencia editorial";
  kind?: "Fotografía" | "Vista aérea" | "Render" | "Archivo histórico" | "Identidad visual";
};

export type OfficialMediaCollection = {
  id: string;
  title: string;
  category: "Loteos" | "Arquitectura" | "Trayectoria";
  description: string;
  images: BellomoImage[];
};

export type ProjectStage = "preventa" | "venta" | "agotado" | "proximo";

export type Project = {
  id: string;
  name: string;
  stage: ProjectStage;
  stageLabel: string;
  location: string;
  slogan?: string;
  description: string;
  facts: string[];
  services?: string[];
  mapUrl?: string;
  logo?: string;
  media: BellomoImage;
};

export type HeroSlide = {
  id: string;
  eyebrow: string;
  title: string;
  emphasis: string;
  description: string;
  media: BellomoImage;
};

export type PropertyCategory = {
  id: "loteos" | "propiedades" | "locales-comerciales" | "cocheras";
  title: string;
  description: string;
  icon: "land" | "home" | "store" | "garage" | "building";
};

export type ConstructionHighlight = {
  id: string;
  title: string;
  eyebrow: string;
  description: string;
  media: BellomoImage;
  icon: PropertyCategory["icon"];
  focusAreas: string[];
  cta: string;
};

export const bellomoContact = {
  address: "Belgrano 1383",
  city: "San Salvador de Jujuy",
  commercialPhones: "388 422 8755 · 388 433 1981",
  constructionPhone: "388 423 4010",
  weekdayHours: "Lunes a viernes · 08:00–20:00",
  saturdayHours: "Sábados · 09:00–12:00",
  location: "Jujuy · Argentina",
  whatsappDisplay: "+54 9 388 433 1981",
  whatsappPhone: "5493884331981",
  mapsUrl:
    "https://www.google.com/maps/search/?api=1&query=Belgrano%201383%2C%20San%20Salvador%20de%20Jujuy",
};

export function whatsappHref(message: string) {
  return `https://wa.me/${bellomoContact.whatsappPhone}?text=${encodeURIComponent(message)}`;
}

export const bellomoMedia = {
  history: {
    src: "/images/official/trayectoria/aniversario-historia.webp",
    alt: "Celebración institucional por los 50 años de trayectoria de Bellomo",
    source: "archivo Bellomo",
    kind: "Archivo histórico",
    position: "center",
  },
  huasi: {
    src: "/images/official/residencial/huasi-viii-fachada.webp",
    alt: "Fachada real de Huasi VIII y sus locales comerciales",
    source: "archivo Bellomo",
    kind: "Fotografía",
    position: "center",
  },
  huasiResidential: {
    src: "/images/official/residencial/huasi-iv-fachada.webp",
    alt: "Fachada real del edificio Huasi IV",
    source: "archivo Bellomo",
    kind: "Fotografía",
    position: "center",
  },
  sanAntonio: {
    src: "/images/official/quintas-san-antonio/vista-aerea-2.webp",
    alt: "Vista aérea real del entorno de Quintas de San Antonio",
    source: "archivo Bellomo",
    kind: "Vista aérea",
    position: "center",
  },
  publicWorks: {
    src: "/images/site/official-public-works.jpg",
    alt: "Registro de una obra pública ejecutada por Bellomo",
    fit: "contain",
    source: "archivo Bellomo",
    kind: "Archivo histórico",
    position: "center",
  },
  territory: {
    src: "/images/official/quintas-san-antonio/vista-aerea-1.webp",
    alt: "Vista aérea de territorio desarrollado por Bellomo en Jujuy",
    source: "archivo Bellomo",
    kind: "Vista aérea",
    position: "center 52%",
  },
  architecture: {
    src: "/images/official/residencial/duplex-higuerillas-frente.webp",
    alt: "Dúplex de Higuerillas construido por Bellomo",
    source: "archivo Bellomo",
    kind: "Fotografía",
    position: "center",
  },
  land: {
    src: "/images/official/la-toma/vista-aerea-2.webp",
    alt: "Vista aérea de un desarrollo Bellomo en Jujuy",
    source: "archivo Bellomo",
    kind: "Vista aérea",
    position: "center",
  },
  forest: {
    src: "/images/official/la-arbolada/vista-aerea-actual.webp",
    alt: "Vista aérea actual de La Arbolada",
    source: "archivo Bellomo",
    kind: "Vista aérea",
    position: "center",
  },
  sanPablo: {
    src: "/images/official/san-pablo/vista-aerea-1.webp",
    alt: "Vista aérea real de San Pablo",
    source: "archivo Bellomo",
    kind: "Vista aérea",
    position: "center",
  },
  valleVerde: {
    src: "/images/official/valle-verde/vista-aerea.webp",
    alt: "Vista aérea real de Valle Verde",
    source: "archivo Bellomo",
    kind: "Vista aérea",
    position: "center",
  },
  cardinales: {
    src: "/images/official/los-cardinales/vista-aerea-1.webp",
    alt: "Vista aérea real de Los Cardinales",
    source: "archivo Bellomo",
    kind: "Vista aérea",
    position: "center",
  },
  rocio: {
    src: "/images/official/el-rocio/arbol.webp",
    alt: "Paisaje real del loteo El Rocío",
    source: "archivo Bellomo",
    kind: "Fotografía",
    position: "center",
  },
  emilia: {
    src: "/images/official/santa-emilia/paisaje.webp",
    alt: "Paisaje real del loteo Santa Emilia",
    source: "archivo Bellomo",
    kind: "Fotografía",
    position: "center",
  },
  arenales: {
    src: "/images/official/los-arenales/acceso.webp",
    alt: "Acceso real al loteo Los Arenales",
    source: "archivo Bellomo",
    kind: "Fotografía",
    position: "center",
  },
  lasColinas: {
    src: "/images/official/las-colinas/vista-aerea.webp",
    alt: "Vista aérea real de Las Colinas",
    source: "archivo Bellomo",
    kind: "Vista aérea",
    position: "center",
  },
  losPerales: {
    src: "/images/official/los-perales/vista-aerea-1.webp",
    alt: "Vista aérea real de Los Perales",
    source: "archivo Bellomo",
    kind: "Vista aérea",
    position: "center",
  },
  laToma: {
    src: "/images/official/la-toma/vista-aerea-1.webp",
    alt: "Vista aérea real del entorno de La Toma",
    source: "archivo Bellomo",
    kind: "Vista aérea",
    position: "center",
  },
  privateWorks: {
    src: "/images/official/residencial/duplex-higuerillas-aerea.webp",
    alt: "Vista aérea de los Dúplex de Higuerillas",
    source: "archivo Bellomo",
    kind: "Vista aérea",
    position: "center",
  },
} satisfies Record<string, BellomoImage>;

const officialMedia = (
  src: string,
  alt: string,
  kind: BellomoImage["kind"] = "Fotografía",
  position = "center",
): BellomoImage => ({ src, alt, kind, position, source: "archivo Bellomo" });

const commercialRender = (src: string, alt: string): BellomoImage => ({
  src,
  alt,
  fit: "contain",
  kind: "Render",
  position: "center",
  source: "material comercial Bellomo",
});

export const officialMediaCollections: OfficialMediaCollection[] = [
  {
    id: "archivo-el-rocio",
    title: "El Rocío",
    category: "Loteos",
    description: "Paisaje, apertura de calles y vista aérea del desarrollo en El Carmen.",
    images: [
      officialMedia("/images/official/el-rocio/atardecer.webp", "Atardecer sobre El Rocío"),
      officialMedia("/images/official/el-rocio/arbol.webp", "Árbol y paisaje natural de El Rocío"),
      officialMedia("/images/official/el-rocio/calles.webp", "Apertura de calles en El Rocío"),
      officialMedia("/images/official/el-rocio/vista-aerea.webp", "Vista aérea de la trama de El Rocío", "Vista aérea"),
    ],
  },
  {
    id: "archivo-san-pablo",
    title: "San Pablo",
    category: "Loteos",
    description: "Registro de territorio, obra e infraestructura con vistas hacia la ciudad.",
    images: [
      officialMedia("/images/official/san-pablo/vista-aerea-1.webp", "Vista aérea de San Pablo", "Vista aérea"),
      officialMedia("/images/official/san-pablo/vista-aerea-2.webp", "Camino y entorno arbolado de San Pablo desde el aire", "Vista aérea"),
      officialMedia("/images/official/san-pablo/urbanizacion.webp", "Territorio urbanizado en San Pablo"),
      officialMedia("/images/official/san-pablo/obra.webp", "Maquinaria trabajando en San Pablo"),
      officialMedia("/images/official/san-pablo/vista-ciudad.webp", "Vista de San Salvador de Jujuy desde San Pablo"),
      officialMedia("/images/official/san-pablo/infraestructura.webp", "Infraestructura eléctrica y calles de San Pablo"),
    ],
  },
  {
    id: "archivo-santa-emilia",
    title: "Santa Emilia",
    category: "Loteos",
    description: "Entorno productivo, caminos y paisaje abierto de Monterrico.",
    images: [
      officialMedia("/images/official/santa-emilia/paisaje.webp", "Paisaje verde de Santa Emilia"),
      officialMedia("/images/official/santa-emilia/camino.webp", "Camino interno de Santa Emilia"),
      officialMedia("/images/official/santa-emilia/terreno.webp", "Terreno y horizonte de Santa Emilia"),
      officialMedia("/images/official/santa-emilia/acceso.webp", "Acceso entre cultivos en Santa Emilia"),
    ],
  },
  {
    id: "archivo-valle-verde",
    title: "Valle Verde",
    category: "Loteos",
    description: "Vista real del terreno y visualizaciones comerciales del proyecto terminado.",
    images: [
      officialMedia("/images/official/valle-verde/paisaje.webp", "Paisaje real de Valle Verde"),
      officialMedia("/images/official/valle-verde/vista-aerea.webp", "Vista aérea real de Valle Verde", "Vista aérea"),
      commercialRender("/images/official/valle-verde/render-acceso.webp", "Render comercial del acceso proyectado a Valle Verde"),
      commercialRender("/images/official/valle-verde/render-urbanizacion.webp", "Render comercial de la urbanización proyectada en Valle Verde"),
    ],
  },
  {
    id: "archivo-los-cardinales",
    title: "Los Cardinales",
    category: "Loteos",
    description: "Tres vistas aéreas oficiales que muestran la trama y el entorno natural.",
    images: [
      officialMedia("/images/official/los-cardinales/vista-aerea-1.webp", "Vista aérea de Los Cardinales y su entorno", "Vista aérea"),
      officialMedia("/images/official/los-cardinales/vista-aerea-2.webp", "Trazado de Los Cardinales visto desde el aire", "Vista aérea"),
      officialMedia("/images/official/los-cardinales/vista-aerea-3.webp", "Calles y parcelas de Los Cardinales", "Vista aérea"),
    ],
  },
  {
    id: "archivo-la-arbolada",
    title: "La Arbolada I y II",
    category: "Loteos",
    description: "Evolución del desarrollo: urbanización, obra y tomas profesionales actuales.",
    images: [
      officialMedia("/images/official/la-arbolada/cartel-arbolada-ii.webp", "Cartel oficial de La Arbolada II"),
      officialMedia("/images/official/la-arbolada/infraestructura.webp", "Infraestructura actual de La Arbolada II"),
      officialMedia("/images/official/la-arbolada/vista-aerea-actual.webp", "Vista aérea actual de La Arbolada", "Vista aérea"),
      officialMedia("/images/official/la-arbolada/calle.webp", "Calle e infraestructura de La Arbolada"),
      officialMedia("/images/official/la-arbolada/vista-aerea-historica.webp", "Vista aérea histórica de La Arbolada", "Vista aérea"),
      officialMedia("/images/official/la-arbolada/obra.webp", "Obra de urbanización en La Arbolada"),
    ],
  },
  {
    id: "archivo-las-colinas",
    title: "Las Colinas",
    category: "Loteos",
    description: "Trazado, infraestructura y crecimiento residencial sobre la RN 9.",
    images: [
      officialMedia("/images/official/las-colinas/vista-aerea.webp", "Vista aérea de Las Colinas", "Vista aérea"),
      officialMedia("/images/official/las-colinas/urbanizacion.webp", "Urbanización de Las Colinas"),
      officialMedia("/images/official/las-colinas/desarrollo.webp", "Desarrollo residencial de Las Colinas"),
      officialMedia("/images/official/las-colinas/infraestructura.webp", "Infraestructura de Las Colinas"),
    ],
  },
  {
    id: "archivo-los-arenales",
    title: "Los Arenales",
    category: "Loteos",
    description: "Panorámicas reales del terreno, sus accesos y el entorno productivo.",
    images: [
      officialMedia("/images/official/los-arenales/panoramica.webp", "Panorámica real de Los Arenales"),
      officialMedia("/images/official/los-arenales/acceso.webp", "Acceso a Los Arenales"),
      officialMedia("/images/official/los-arenales/camino.webp", "Camino interno de Los Arenales"),
      officialMedia("/images/official/los-arenales/terreno.webp", "Terreno de Los Arenales"),
    ],
  },
  {
    id: "archivo-los-perales",
    title: "Los Perales",
    category: "Loteos",
    description: "Secuencia aérea del desarrollo y su integración con el barrio.",
    images: [
      officialMedia("/images/official/los-perales/vista-aerea-1.webp", "Vista aérea del loteo Los Perales", "Vista aérea"),
      officialMedia("/images/official/los-perales/vista-aerea-2.webp", "Entorno urbano de Los Perales", "Vista aérea"),
      officialMedia("/images/official/los-perales/vista-aerea-3.webp", "Parcelas y viviendas de Los Perales", "Vista aérea"),
      officialMedia("/images/official/los-perales/vista-aerea-4.webp", "Panorámica aérea de Los Perales", "Vista aérea"),
    ],
  },
  {
    id: "archivo-quintas-san-antonio",
    title: "Quintas de San Antonio",
    category: "Loteos",
    description: "Vistas del bosque, el valle y los caminos del proyecto en San Antonio.",
    images: [
      officialMedia("/images/official/quintas-san-antonio/vista-aerea-1.webp", "Valle de Quintas de San Antonio", "Vista aérea"),
      officialMedia("/images/official/quintas-san-antonio/vista-aerea-2.webp", "Bosque de Quintas de San Antonio", "Vista aérea"),
      officialMedia("/images/official/quintas-san-antonio/camino.webp", "Camino entre árboles en Quintas de San Antonio", "Vista aérea"),
    ],
  },
  {
    id: "archivo-la-toma",
    title: "La Toma",
    category: "Loteos",
    description: "Tres vistas aéreas del entorno urbano y natural del futuro desarrollo.",
    images: [
      officialMedia("/images/official/la-toma/vista-aerea-1.webp", "Vista aérea del entorno de La Toma", "Vista aérea"),
      officialMedia("/images/official/la-toma/vista-aerea-2.webp", "Área urbana próxima a La Toma", "Vista aérea"),
      officialMedia("/images/official/la-toma/vista-aerea-3.webp", "Trazado y vegetación del entorno de La Toma", "Vista aérea"),
    ],
  },
  {
    id: "archivo-arquitectura",
    title: "Arquitectura y vivienda",
    category: "Arquitectura",
    description: "Obras terminadas y visualizaciones de la línea Huasi, Galería Norte, Higuerillas y viviendas en Perico.",
    images: [
      officialMedia("/images/official/residencial/duplex-higuerillas-frente.webp", "Frente terminado de un Dúplex de Higuerillas"),
      officialMedia("/images/official/residencial/duplex-higuerillas-aerea.webp", "Vista aérea de Dúplex de Higuerillas", "Vista aérea"),
      officialMedia("/images/official/residencial/huasi-iv-fachada.webp", "Fachada real de Huasi IV"),
      officialMedia("/images/official/residencial/huasi-iv-interior.webp", "Interior terminado de Huasi IV"),
      officialMedia("/images/official/residencial/huasi-viii-fachada.webp", "Fachada real de Huasi VIII"),
      officialMedia("/images/official/residencial/huasi-viii-interior.webp", "Interior real de Huasi VIII"),
      commercialRender("/images/official/residencial/galeria-norte-iii-render.webp", "Render comercial de Galería Norte III"),
      commercialRender("/images/official/residencial/huasi-x-render.webp", "Render comercial de Huasi X"),
      commercialRender("/images/official/residencial/viviendas-perico-planificacion.webp", "Visualización del conjunto de viviendas en Perico"),
      commercialRender("/images/official/residencial/viviendas-perico-render.webp", "Render de vivienda del conjunto en Perico"),
    ],
  },
  {
    id: "archivo-trayectoria",
    title: "50 años Bellomo",
    category: "Trayectoria",
    description: "Registro institucional del aniversario y de la continuidad familiar de la empresa.",
    images: [
      officialMedia("/images/official/trayectoria/aniversario-discurso.webp", "Presentación institucional por los 50 años de Bellomo", "Archivo histórico"),
      officialMedia("/images/official/trayectoria/aniversario-historia.webp", "Proyección del archivo histórico durante el aniversario de Bellomo", "Archivo histórico"),
      officialMedia("/images/official/trayectoria/aniversario-familia.webp", "Familia Bellomo en la celebración del 50 aniversario", "Archivo histórico"),
    ],
  },
  {
    id: "archivo-oficina",
    title: "Oficina central",
    category: "Trayectoria",
    description: "Fachada real de la sede de Bellomo en Belgrano 1383, San Salvador de Jujuy.",
    images: [
      officialMedia("/images/official/oficina/belgrano-1383.webp", "Oficina central de Bellomo en Belgrano 1383"),
      officialMedia("/images/official/oficina/fachada-bellomo.webp", "Fachada de la oficina central de Bellomo"),
    ],
  },
];

export const heroSlides: HeroSlide[] = [
  {
    id: "trayectoria",
    eyebrow: "Desde 1976 · Jujuy",
    title: "Construimos presente.",
    emphasis: "Proyectamos futuro.",
    description:
      "Tierra, arquitectura e infraestructura reunidas por una empresa familiar con 50 años de trayectoria.",
    media: bellomoMedia.huasi,
  },
  {
    id: "territorio",
    eyebrow: "Desarrollo urbano",
    title: "Conocemos la tierra.",
    emphasis: "Entendemos Jujuy.",
    description:
      "Urbanizaciones pensadas desde el territorio, la conectividad y el crecimiento de cada comunidad.",
    media: bellomoMedia.territory,
  },
  {
    id: "respaldo",
    eyebrow: "Obra pública y privada",
    title: "Experiencia que se ve.",
    emphasis: "Respaldo que perdura.",
    description:
      "Diseño, elaboración y ejecución de proyectos de ingeniería, arquitectura y urbanización.",
    media: bellomoMedia.architecture,
  },
];

export const bellomoStats = [
  { label: "Años de trayectoria", value: "50" },
  { label: "Loteos desarrollados", value: "+15" },
  { label: "Obras públicas", value: "+200" },
  { label: "Terrenos vendidos", value: "+2.000" },
  { label: "Edificios residenciales", value: "+8" },
  { label: "Departamentos", value: "+100" },
  { label: "Locales comerciales", value: "+120" },
  { label: "Clientes activos", value: "+500" },
];

export const trajectoryMilestones = [
  {
    year: "1950",
    title: "Una tradición familiar",
    text: "La familia Bellomo inicia una tradición constructora que se sostendrá durante generaciones.",
  },
  {
    year: "1976",
    title: "Nace Bellomo SRL",
    text: "El Ing. Pedro V. Bellomo funda la compañía y consolida su presencia en obras civiles de escala regional y nacional.",
  },
  {
    year: "1989",
    title: "Innovación industrial",
    text: "Se instala en Jujuy una fábrica de viviendas industrializadas con tecnología de paneles de hormigón armado.",
  },
  {
    year: "2003",
    title: "Desarrollo inmobiliario",
    text: "Comienza una etapa pionera de loteos a gran escala, comercialización y administración de propiedades.",
  },
  {
    year: "Hoy",
    title: "Una marca, una visión",
    text: "Construcción, urbanización y gestión inmobiliaria vuelven a integrarse bajo el nombre Bellomo.",
  },
];

export const propertyCategories: PropertyCategory[] = [
  {
    id: "loteos",
    title: "Loteos",
    description: "Tierra con proyección para construir, invertir y crecer.",
    icon: "land",
  },
  {
    id: "propiedades",
    title: "Propiedades",
    description: "Opciones residenciales y administración inmobiliaria.",
    icon: "home",
  },
  {
    id: "locales-comerciales",
    title: "Locales comerciales",
    description: "Espacios para actividad, visibilidad y nuevos negocios.",
    icon: "store",
  },
  {
    id: "cocheras",
    title: "Cocheras",
    description: "Soluciones urbanas para uso mensual o por hora, según disponibilidad.",
    icon: "garage",
  },
];

export const constructionHighlights: ConstructionHighlight[] = [
  {
    id: "obras-publicas",
    title: "Obras públicas",
    eyebrow: "Infraestructura y comunidad",
    description:
      "Más de 200 obras públicas forman parte de una trayectoria que incluye aeropuertos, saneamiento, puentes, pavimentos, líneas férreas y complejos habitacionales.",
    media: bellomoMedia.publicWorks,
    icon: "building",
    focusAreas: ["Ingeniería e infraestructura", "Vivienda", "Saneamiento y conectividad"],
    cta: "Consultar por obra pública",
  },
  {
    id: "obras-privadas",
    title: "Obras privadas",
    eyebrow: "Proyecto y ejecución",
    description:
      "Planificación, arquitectura y construcción para proyectos residenciales, comerciales e institucionales, desde la idea hasta la entrega.",
    media: bellomoMedia.privateWorks,
    icon: "home",
    focusAreas: ["Arquitectura", "Dirección y ejecución", "Urbanización"],
    cta: "Consultar una obra privada",
  },
  {
    id: "edificios-huasi",
    title: "Edificios Huasi",
    eyebrow: "Trayectoria residencial",
    description:
      "Una línea de edificios iniciada en 1985, con proyectos en Jujuy y Córdoba y más de 100 departamentos construidos.",
    media: bellomoMedia.huasiResidential,
    icon: "building",
    focusAreas: ["Vivienda urbana", "Locales y cocheras", "Calidad constructiva"],
    cta: "Conocer la línea Huasi",
  },
];

const normalizedProjectLogos = new Set(["el-arrabal", "las-colinas-2"]);
const projectLogo = (name: string) =>
  `/brand/projects/${name}${normalizedProjectLogos.has(name) ? "-web" : ""}.png`;

const projectIdentity = (src: string, projectName: string, alt?: string): BellomoImage => ({
  src,
  alt: alt ?? `Identidad visual oficial de ${projectName}; no se publica una fotografía asociada sin confirmación`,
  fit: "contain",
  kind: "Identidad visual",
  position: "center 30%",
  source: "archivo Bellomo",
});

export const bellomoProjects: Project[] = [
  {
    id: "el-rocio",
    name: "El Rocío",
    stage: "preventa",
    stageLabel: "Preventa · con posesión",
    location: "El Carmen",
    slogan: "Empapate de frescura y tranquilidad",
    description:
      "Urbanización camino a los diques La Ciénaga y Las Maderas, en el corazón de los valles jujeños.",
    facts: ["254 lotes", "Desde 250 hasta 600 m²", "Acceso por RN 9"],
    services: ["Agua potable", "Cordón cuneta", "Apertura de calles", "Red eléctrica"],
    mapUrl: "https://goo.gl/maps/62ajzARyuAPveZix6",
    logo: projectLogo("el-rocio"),
    media: bellomoMedia.rocio,
  },
  {
    id: "san-pablo-1",
    name: "San Pablo I",
    stage: "preventa",
    stageLabel: "Preventa",
    location: "B° Coronel Arias · San Salvador de Jujuy",
    slogan: "Tu balcón a la ciudad",
    description:
      "Desarrollo en una nueva expansión de la ciudad, cerca de la terminal y rodeado por el paisaje de los cerros.",
    facts: ["Lotes de 300 a 1.000 m²", "Aproximadamente 3 minutos del centro"],
    services: ["Agua potable", "Cordón cuneta", "Red eléctrica"],
    mapUrl: "https://goo.gl/maps/1UwnW1CDetpP1zAZ8",
    logo: projectLogo("san-pablo"),
    media: bellomoMedia.sanPablo,
  },
  {
    id: "san-pablo-2",
    name: "San Pablo II",
    stage: "preventa",
    stageLabel: "Preventa",
    location: "B° Coronel Arias · San Salvador de Jujuy",
    slogan: "Tu balcón a la ciudad",
    description: "Segunda etapa del desarrollo San Pablo, ubicada en la expansión urbana del barrio Coronel Arias.",
    facts: ["Expansión urbana", "Consulta de ubicación y lote disponible"],
    services: ["Infraestructura según proyecto", "Servicios a confirmar por lote"],
    mapUrl: "https://goo.gl/maps/1UwnW1CDetpP1zAZ8",
    logo: projectLogo("san-pablo"),
    media: bellomoMedia.sanPablo,
  },
  {
    id: "santa-emilia",
    name: "Santa Emilia",
    stage: "preventa",
    stageLabel: "Preventa",
    location: "Monterrico · El Carmen",
    slogan: "Urbanización a tu alcance",
    description: "Una urbanización próxima al centro de Monterrico y rodeada por el paisaje productivo de los valles.",
    facts: ["Lotes de 300 a 1.000 m²", "A cuadras del centro de Monterrico"],
    services: ["Agua potable", "Cordón cuneta", "Red eléctrica"],
    mapUrl: "https://goo.gl/maps/e4D7Cn3PN2UpFnK39",
    logo: projectLogo("santa-emilia"),
    media: bellomoMedia.emilia,
  },
  {
    id: "valle-verde",
    name: "Valle Verde",
    stage: "preventa",
    stageLabel: "Preventa",
    location: "B° Sargento Cabral · San Salvador de Jujuy",
    slogan: "El valle pensado para tu futuro",
    description: "Proyecto de expansión con sector comercial privado y una zona recreativa proyectada como parque lineal.",
    facts: ["Lotes de 300 a 1.000 m²", "Sector comercial y recreativo proyectado"],
    services: ["Agua potable", "Cordón cuneta", "Red eléctrica"],
    mapUrl: "https://goo.gl/maps/BHCdb2VzC1QdWKVGA",
    logo: projectLogo("valle-verde"),
    media: bellomoMedia.valleVerde,
  },
  {
    id: "los-cardinales",
    name: "Los Cardinales",
    stage: "preventa",
    stageLabel: "Preventa",
    location: "B° Sargento Cabral · RN 9",
    slogan: "Proyectá tu futuro en el lugar correcto",
    description: "Desarrollo en la parte alta de Sargento Cabral, con vegetación, vistas a la ciudad y espacios comunitarios proyectados.",
    facts: ["Lotes de 250 a 600 m²", "Aproximadamente 10 minutos del centro"],
    services: ["Agua", "Cordón cuneta", "Cloacas", "Alumbrado", "Calles enripiadas"],
    mapUrl: "https://goo.gl/maps/E6jYRGbHVY3j175i9",
    logo: projectLogo("los-cardinales"),
    media: bellomoMedia.cardinales,
  },
  {
    id: "la-arbolada-2",
    name: "La Arbolada II",
    stage: "preventa",
    stageLabel: "Preventa",
    location: "B° Sargento Cabral · San Salvador de Jujuy",
    slogan: "Respirá tranquilidad",
    description: "Continuación de La Arbolada, pensada como una urbanización residencial integrada al entorno.",
    facts: ["Lotes desde 300 m²", "Aproximadamente 315 lotes proyectados"],
    services: ["Agua potable", "Red eléctrica", "Calles enripiadas"],
    mapUrl: "https://goo.gl/maps/CdoPKYA4stvWAyWx5",
    logo: projectLogo("la-arbolada"),
    media: bellomoMedia.forest,
  },
  {
    id: "los-arenales",
    name: "Los Arenales",
    stage: "preventa",
    stageLabel: "Preventa",
    location: "Jujuy",
    description: "Propuesta de tierra en Jujuy. La ubicación precisa, las superficies y la disponibilidad se confirman con el equipo comercial.",
    facts: ["Proyecto en preventa", "Consulta personalizada"],
    logo: projectLogo("los-arenales"),
    media: bellomoMedia.arenales,
  },
  {
    id: "el-arrabal",
    name: "El Arrabal",
    stage: "preventa",
    stageLabel: "Preventa",
    location: "Jujuy",
    description: "Proyecto Bellomo en etapa de preventa. La ubicación, las características y la disponibilidad se confirman con el equipo comercial.",
    facts: ["Preventa", "Disponibilidad a confirmar"],
    logo: projectLogo("el-arrabal"),
    media: projectIdentity(projectLogo("el-arrabal"), "El Arrabal"),
  },
  {
    id: "las-colinas-2",
    name: "Las Colinas II",
    stage: "preventa",
    stageLabel: "Preventa",
    location: "RN 9 · Jujuy",
    slogan: "Tierra de sueños",
    description: "Continuación de Las Colinas, proyectada en dos etapas sobre una superficie aproximada de 70 hectáreas.",
    facts: ["Aproximadamente 70 ha", "Plan especial informado para lotes de 300 m²"],
    services: ["Agua potable", "Red eléctrica", "Cloacas", "Calles enripiadas"],
    mapUrl: "https://goo.gl/maps/VUhJxtTkFSLzDxpV8",
    logo: projectLogo("las-colinas-2"),
    media: bellomoMedia.lasColinas,
  },
  {
    id: "la-arbolada",
    name: "La Arbolada",
    stage: "venta",
    stageLabel: "Venta · escritura y posesión",
    location: "B° Sargento Cabral · San Salvador de Jujuy",
    slogan: "Terrenos verdes muy cerca de todo",
    description: "Barrio residencial próximo a Sargento Cabral, con posesión y escritura informadas en el material comercial.",
    facts: ["28 ha urbanizadas", "Lotes de 300 m²", "Aproximadamente 5 minutos del centro"],
    services: ["Agua potable", "Cordón cuneta", "Cloacas", "Red eléctrica"],
    mapUrl: "https://goo.gl/maps/CdoPKYA4stvWAyWx5",
    logo: projectLogo("la-arbolada"),
    media: bellomoMedia.forest,
  },
  {
    id: "las-colinas",
    name: "Las Colinas",
    stage: "venta",
    stageLabel: "Venta · escritura y posesión",
    location: "RN 9 · a 8 km de San Salvador de Jujuy",
    slogan: "Tierra de sueños",
    description: "Urbanización entre la capital y El Carmen, conectada por la Ruta Nacional 9.",
    facts: ["20 ha urbanizadas", "Lotes de 250 a 300 m²", "Aproximadamente 8 minutos del centro"],
    services: ["Agua potable", "Cordón cuneta", "Red eléctrica", "Cerco perimetral"],
    mapUrl: "https://goo.gl/maps/VUhJxtTkFSLzDxpV8",
    logo: projectLogo("las-colinas"),
    media: bellomoMedia.lasColinas,
  },
  {
    id: "los-perales",
    name: "Los Perales",
    stage: "venta",
    stageLabel: "Venta · escritura y posesión",
    location: "B° Los Perales · San Salvador de Jujuy",
    slogan: "Sentite lejos, estando cerca",
    description: "Desarrollo residencial próximo al centro, rodeado de vegetación y conectado con la actividad comercial de la zona.",
    facts: ["Aproximadamente 5 minutos del centro", "Disponibilidad a confirmar"],
    mapUrl: "https://goo.gl/maps/JUbmLHpR98dkwHPT8",
    logo: projectLogo("los-perales"),
    media: bellomoMedia.losPerales,
  },
  {
    id: "rincones",
    name: "Rincones de San Pedrito I y II",
    stage: "agotado",
    stageLabel: "Vendido · escritura y posesión",
    location: "B° San Pedrito · San Salvador de Jujuy",
    slogan: "Es para tu familia, es para tu futuro",
    description: "Dos etapas desarrolladas desde 2004 y 2008, con cerca de 450 lotes urbanizados.",
    facts: ["Cerca de 450 lotes", "Dos etapas"],
    services: ["Agua potable", "Cloacas", "Red eléctrica", "Cordón cuneta", "Calles enripiadas"],
    mapUrl: "https://goo.gl/maps/S1RJ2siSWyS7BJs77",
    logo: projectLogo("rincones-san-pedrito"),
    media: projectIdentity(projectLogo("rincones-san-pedrito"), "Rincones de San Pedrito"),
  },
  {
    id: "palpala",
    name: "Loteo Palpalá",
    stage: "agotado",
    stageLabel: "Vendido · escritura y posesión",
    location: "Palpalá",
    slogan: "Viví cerca",
    description: "Urbanización céntrica iniciada en 2012, próxima a la Ruta 1 y al Paseo de las Flores.",
    facts: ["Proyecto entregado", "Lotes de 200 a 900 m² en el conjunto Palpalá–Martín Galán"],
    mapUrl: "https://goo.gl/maps/Wvdq7xFTjBfzkQNP8",
    logo: projectLogo("palpala"),
    media: projectIdentity(projectLogo("palpala"), "Loteo Palpalá"),
  },
  {
    id: "martin-galan",
    name: "Martín Raúl Galán",
    stage: "agotado",
    stageLabel: "Vendido · con posesión",
    location: "Palpalá",
    slogan: "Viví cerca",
    description: "Proyecto urbano vinculado a Loteo Palpalá, con plaza central y acceso a servicios de la ciudad.",
    facts: ["Proyecto entregado", "Escritura informada como próxima en el material recibido"],
    mapUrl: "https://goo.gl/maps/Wvdq7xFTjBfzkQNP8",
    logo: projectLogo("martin-galan"),
    media: projectIdentity(projectLogo("martin-galan"), "Martín Raúl Galán"),
  },
  {
    id: "huasi-7",
    name: "Huasi VII",
    stage: "proximo",
    stageLabel: "Venta en pozo",
    location: "Alto Padilla · San Salvador de Jujuy",
    description: "Nuevo proyecto residencial de la línea Huasi. Tipologías, precios y cronograma deben confirmarse con el área comercial.",
    facts: ["Proyecto residencial", "Venta en pozo"],
    media: projectIdentity(
      "/brand/logo-bellomo-isotipo.png",
      "Huasi VII",
      "Marca Bellomo usada como referencia visual de Huasi VII ante la ausencia de una fotografía confirmada",
    ),
  },
  {
    id: "terrazas-galan",
    name: "Terrazas de Galán",
    stage: "proximo",
    stageLabel: "Proyecto futuro",
    location: "Juan Galán · Jujuy",
    description: "Proyecto futuro incorporado al portafolio Bellomo. Información técnica y comercial en preparación.",
    facts: ["Próximo desarrollo", "Consulta anticipada"],
    media: projectIdentity(
      "/brand/logo-bellomo-isotipo.png",
      "Terrazas de Galán",
      "Marca Bellomo usada como referencia visual de Terrazas de Galán ante la ausencia de una fotografía confirmada",
    ),
  },
  {
    id: "quintas-san-antonio",
    name: "Quintas de San Antonio",
    stage: "proximo",
    stageLabel: "Proyecto futuro",
    location: "La Toma · San Antonio",
    description: "Proyecto de cinco etapas destinado a quintas de fin de semana, esparcimiento y descanso.",
    facts: ["5 etapas proyectadas", "Fracciones de aproximadamente 1 ha", "A 2 km del pueblo"],
    services: ["Agua", "Alumbrado público"],
    logo: projectLogo("quintas-san-antonio"),
    media: bellomoMedia.sanAntonio,
  },
  {
    id: "la-toma",
    name: "Loteo La Toma",
    stage: "proximo",
    stageLabel: "Proyecto futuro",
    location: "San Antonio · Jujuy",
    description: "Nuevo desarrollo de tierra en etapa de definición. Se reciben consultas anticipadas sin compromiso.",
    facts: ["Proyecto futuro", "Información en preparación"],
    media: bellomoMedia.laToma,
  },
];

export const projectStages: { id: ProjectStage; label: string; description: string }[] = [
  { id: "preventa", label: "Preventa", description: "Escritura y posesión estimadas en aproximadamente 48/60 meses, según documentación y avance de cada proyecto." },
  { id: "venta", label: "Venta", description: "Proyectos informados con escritura y posesión. La disponibilidad puntual se confirma antes de reservar." },
  { id: "agotado", label: "Trayectoria", description: "Urbanizaciones vendidas que documentan la experiencia y continuidad de Bellomo." },
  { id: "proximo", label: "Próximos", description: "Proyectos en pozo o futuros, sujetos a definición técnica y comercial." },
];

export const rentalPortfolio = [
  "Galería Norte I · Chijra · 36 locales",
  "Galería Norte II · Chijra · 80 locales",
  "Huasi VIII · Alvear · 3 plantas y 4 locales comerciales",
  "Cocheras Alvear · mensual y por hora",
  "Cocheras Huasi III · Chijra · mensual",
];

export const navigation = [
  { label: "Inicio", href: "#inicio" },
  { label: "Bellomo", href: "#bellomo" },
  { label: "Proyectos", href: "#proyectos" },
  { label: "Archivo", href: "#archivo" },
  { label: "Construcción", href: "#construccion" },
  { label: "Contacto", href: "#contacto" },
];
