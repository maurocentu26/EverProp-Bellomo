/**
 * Contenido temporal para la demo pública de Bellomo.
 *
 * Estados, disponibilidad, descripciones e imágenes deben validarse con
 * Bellomo antes de una publicación productiva.
 */

export type BellomoImage = {
  src: string;
  alt: string;
  intent: string;
  section: string;
  temporarySource: "bellomojujuy.com.ar" | "Unsplash" | "Archivo Bellomo";
  temporary: boolean;
  position?: string;
};

export type Project = {
  logo?: string;
  id: string;
  name: string;
  type: string;
  location: string;
  status: string;
  description: string;
  media: BellomoImage;
};

export type HeroSlide = {
  id: string;
  title: string;
  emphasis: string;
  description: string;
  eyebrow: string;
  media: BellomoImage;
};

export type PropertyCategory = {
  id:
    | "loteos"
    | "propiedades"
    | "locales-comerciales"
    | "cocheras"
    | "proyectos-futuros";
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
  imageLabel?: string;
  referenceMedia?: BellomoImage;
  referenceLabel?: string;
  icon: PropertyCategory["icon"];
  focusAreas: string[];
  cta: string;
};

export type InstitutionSector = {
  title: string;
  description: string;
  icon: PropertyCategory["icon"];
};

export const bellomoContact = {
  address: "Gral. Belgrano 1383",
  city: "San Salvador de Jujuy",
  commercialPhones: "388 422 8755 · 388 433 1981",
  constructionPhone: "388 423 4010",
  weekdayHours: "Lunes a viernes · 08:00–20:00",
  saturdayHours: "Sábados · 09:00–12:00",
  location: "Jujuy · Argentina",
  whatsappDisplay: "+54 9 388 433 1981",
  whatsappPhone: "5493884331981",
};

function temporaryImage(
  src: string,
  alt: string,
  intent: string,
  section: string,
  temporarySource: BellomoImage["temporarySource"],
  position?: string
): BellomoImage {
  return {
    alt,
    intent,
    position,
    section,
    src,
    temporary: true,
    temporarySource,
  };
}

/**
 * Catálogo único de imágenes remotas ya presentes en la demo. No incorpora
 * nuevos recursos externos: cada pieza es temporal y debe sustituirse por un
 * asset oficial, optimizado y aprobado antes de producción.
 */
export const bellomoMedia = {
  about: temporaryImage(
    "/images/site/about.jpg",
    "Interior residencial contemporáneo con materiales cálidos y luz natural",
    "Representar calidad material y habitabilidad sin atribuir la obra a Bellomo",
    "Nosotros",
    "Unsplash",
    "center"
  ),
  commercial: temporaryImage(
    "/images/site/commercial.jpg",
    "Referencia conceptual para asesoramiento y decisión inmobiliaria",
    "Introducir el servicio comercial sin afirmar disponibilidad concreta",
    "Comercializadora",
    "Unsplash",
    "center"
  ),
  contact: temporaryImage(
    "/images/site/contact.jpg",
    "Detalle de arquitectura contemporánea con terminaciones cálidas",
    "Cerrar el recorrido con una atmósfera arquitectónica sobria",
    "Contacto",
    "Unsplash",
    "center"
  ),
  team: temporaryImage(
    "/images/site/team.jpg",
    "Espacio de trabajo contemporáneo para coordinación profesional",
    "Acompañar la presentación del equipo sin simular integrantes reales",
    "Equipo",
    "Unsplash",
    "center"
  ),
  territory: temporaryImage(
    "/images/hero/territorio-jujuy.jpg",
    "Paisaje montañoso del norte argentino como referencia territorial",
    "Vincular la propuesta con territorio, escala y horizonte",
    "Hero y loteos",
    "Unsplash",
    "center 52%"
  ),
  residenceExterior: temporaryImage(
    "/images/hero/lugares-que-perduran.jpg",
    "Vivienda contemporánea integrada a un entorno arbolado",
    "Comunicar arquitectura residencial y permanencia",
    "Hero",
    "Unsplash",
    "58% center"
  ),
  architecture: temporaryImage(
    "/images/hero/diseno-calidad.jpg",
    "Volumen arquitectónico contemporáneo de líneas precisas",
    "Representar diseño y calidad constructiva",
    "Hero",
    "Unsplash",
    "center"
  ),
  publicWorks: temporaryImage(
    "/images/site/public-works.jpg",
    "Profesional revisando documentación técnica de una obra",
    "Representar planificación técnica sin atribuir la escena a Bellomo",
    "Obras públicas",
    "Unsplash",
    "center"
  ),
  privateWorks: temporaryImage(
    "/images/site/private-works.jpg",
    "Arquitectura urbana contemporánea vista desde nivel peatonal",
    "Representar escala y ejecución de obra privada",
    "Obras privadas",
    "Unsplash",
    "center"
  ),
  properties: temporaryImage(
    "/images/site/properties.jpg",
    "Interior residencial luminoso y funcional",
    "Representar habitabilidad y decisión patrimonial",
    "Propiedades",
    "Unsplash",
    "center"
  ),
  retail: temporaryImage(
    "/images/site/retail.jpg",
    "Interior comercial organizado con circulación visible",
    "Representar uso comercial y experiencia del espacio",
    "Locales comerciales",
    "Unsplash",
    "center"
  ),
  parking: temporaryImage(
    "/images/site/parking.jpg",
    "Acceso ordenado a estacionamiento urbano contemporáneo",
    "Representar comodidad y operación funcional",
    "Cocheras",
    "Unsplash",
    "center"
  ),
  landField: temporaryImage(
    "/images/site/land-field.jpg",
    "Extensión de tierra abierta bajo luz de atardecer",
    "Comunicar tierra, proyección y horizonte de inversión",
    "Loteos",
    "Unsplash",
    "center"
  ),
  landForest: temporaryImage(
    "/images/site/land-forest.jpg",
    "Entorno natural arbolado como referencia paisajística",
    "Acompañar propuestas residenciales vinculadas al entorno",
    "Loteos",
    "Unsplash",
    "center"
  ),
  landSanPablo: temporaryImage(
    "/images/site/land-san-pablo.jpg",
    "Camino de montaña del norte argentino",
    "Representar conectividad territorial sin atribuir ubicación exacta",
    "Loteos",
    "Unsplash",
    "center"
  ),
  landValleVerde: temporaryImage(
    "/images/site/land-valle-verde.jpg",
    "Valle del norte argentino con paisaje abierto",
    "Representar entorno y expansión territorial",
    "Loteos",
    "Unsplash",
    "center"
  ),
  landCardinales: temporaryImage(
    "/images/site/land-cardinales.jpg",
    "Paisaje de escala residencial y horizonte abierto",
    "Acompañar la idea de vivienda y tranquilidad",
    "Loteos",
    "Unsplash",
    "center"
  ),
  landRocio: temporaryImage(
    "/images/site/land-rocio.jpg",
    "Paisaje rural bajo luz cálida de amanecer",
    "Representar tierra y escala humana",
    "Loteos",
    "Unsplash",
    "center"
  ),
  landEmilia: temporaryImage(
    "/images/site/land-emilia.jpg",
    "Entorno natural abierto con luz cálida",
    "Acompañar una propuesta de crecimiento familiar",
    "Loteos",
    "Unsplash",
    "center"
  ),
  landArenales: temporaryImage(
    "/images/site/land-arenales.jpg",
    "Terreno abierto de paisaje árido y horizonte amplio",
    "Representar inversión en suelo sin indicar una parcela concreta",
    "Loteos",
    "Unsplash",
    "center"
  ),
  officialAltosHornos: temporaryImage(
    "/images/site/official-altos-hornos.png",
    "Archivo histórico Altos Hornos publicado en el sitio de Bellomo",
    "Aportar continuidad histórica con material actualmente publicado",
    "Nosotros",
    "bellomojujuy.com.ar",
    "center"
  ),
  officialPublicWorks: temporaryImage(
    "/images/site/official-public-works.jpg",
    "Archivo de obra publicado en el sitio de Bellomo",
    "Aportar evidencia histórica de obra pública como referencia temporal",
    "Obras públicas",
    "bellomojujuy.com.ar",
    "center"
  ),
  officialSanAntonio: temporaryImage(
    "/images/site/official-san-antonio.png",
    "Render de Quintas de San Antonio publicado en el sitio de Bellomo",
    "Vincular el prototipo con un desarrollo Bellomo verificable",
    "Hero y loteos",
    "bellomojujuy.com.ar",
    "center"
  ),
  officialHuasiFacade: temporaryImage(
    "/images/site/official-huasi-facade.jpg",
    "Fachada de un Edificio Huasi publicada en el sitio de Bellomo",
    "Representar la línea Huasi con material actualmente publicado",
    "Edificios Huasi",
    "bellomojujuy.com.ar",
    "center"
  ),
  officialHuasiResidential: temporaryImage(
    "/images/site/official-huasi-residential.jpg",
    "Edificio residencial Huasi publicado en el sitio de Bellomo",
    "Representar trayectoria residencial urbana",
    "Edificios Huasi",
    "bellomojujuy.com.ar",
    "center"
  ),
} satisfies Record<string, BellomoImage>;

export const bellomoEditorialImages = {
  about: bellomoMedia.about,
  commercial: bellomoMedia.commercial,
  contact: bellomoMedia.contact,
  team: bellomoMedia.team,
};

export const bellomoReferenceImages = {
  altosHornos: bellomoMedia.officialAltosHornos,
  huasiFacade: bellomoMedia.officialHuasiFacade,
  huasiResidential: bellomoMedia.officialHuasiResidential,
  publicWorksArchive: bellomoMedia.officialPublicWorks,
  sanAntonio: bellomoMedia.officialSanAntonio,
};

export const heroSlides: HeroSlide[] = [
  {
    id: "futuro",
    title: "Construimos",
    emphasis: "lugares que perduran.",
    description:
      "Tierra, arquitectura y ejecución reunidas por una misma idea: crear espacios con respaldo y valor a largo plazo.",
    eyebrow: "Desarrollos inmobiliarios · Jujuy",
    media: bellomoMedia.residenceExterior,
  },
  {
    id: "territorio",
    title: "Tierra, obra y",
    emphasis: "futuro en Jujuy.",
    description:
      "Desarrollo urbano con conocimiento del territorio. Proyectos para vivir, invertir y acompañar el crecimiento de la provincia.",
    eyebrow: "Bellomo · Desarrollo urbano",
    media: bellomoMedia.territory,
  },
  {
    id: "calidad",
    title: "Diseño y calidad",
    emphasis: "que se sienten.",
    description:
      "Arquitectura contemporánea, materiales seleccionados y decisiones que sostienen el valor de cada proyecto.",
    eyebrow: "Calidad que se proyecta",
    media: bellomoMedia.architecture,
  },
];

export const bellomoStats = [
  { label: "Años de trayectoria", value: 48, suffix: "+" },
  { label: "Obras públicas", value: 200, suffix: "+" },
  { label: "Familias acompañadas", value: 2, suffix: "k+" },
  { label: "Proyectos desarrollados", value: 100, suffix: "+" },
];

export const serviceLines = [
  {
    title: "Desarrollos",
    description:
      "Loteos y propuestas residenciales pensadas para vivir e invertir.",
  },
  {
    title: "Construcción",
    description:
      "Obras públicas y privadas con respaldo técnico y calidad material.",
  },
  {
    title: "Comercialización",
    description:
      "Propiedades, locales y cocheras con acompañamiento personalizado.",
  },
];

export const constructionHighlights: ConstructionHighlight[] = [
  {
    id: "obras-publicas",
    title: "Obras públicas",
    eyebrow: "Comunidad e infraestructura",
    description:
      "Viviendas, caminos, redes de servicios y espacios comunitarios ejecutados con planificación, durabilidad y una mirada de impacto regional.",
    media: bellomoMedia.publicWorks,
    imageLabel: "Imagen de referencia",
    referenceMedia: bellomoReferenceImages.publicWorksArchive,
    referenceLabel: "Archivo publicado en bellomojujuy.com.ar",
    icon: "land",
    focusAreas: [
      "Vivienda e infraestructura",
      "Caminos y redes de servicios",
      "Impacto regional y durabilidad",
    ],
    cta: "Consultar por obra pública",
  },
  {
    id: "obras-privadas",
    title: "Obras privadas",
    eyebrow: "Ejecución a medida",
    description:
      "Viviendas familiares y espacios comerciales desarrollados desde la planificación hasta los acabados, con soluciones ajustadas a cada proyecto.",
    media: bellomoMedia.privateWorks,
    imageLabel: "Imagen de referencia",
    icon: "store",
    focusAreas: [
      "Viviendas y comercios",
      "Planificación y acabados",
      "Diseño a medida",
    ],
    cta: "Consultar una obra privada",
  },
  {
    id: "edificios-huasi",
    title: "Edificios Huasi",
    eyebrow: "Proyectos entregados",
    description:
      "Arquitectura residencial contemporánea que combina ubicación, confort y calidad constructiva, con torres entregadas como respaldo y disponibilidad a confirmar.",
    media: bellomoReferenceImages.huasiResidential,
    imageLabel: "Referencia publicada en bellomojujuy.com.ar",
    icon: "building",
    focusAreas: [
      "Ubicación y confort",
      "Inversión residencial",
      "Entregados y nuevas opciones",
    ],
    cta: "Conocer la línea Huasi",
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
    description: "Opciones residenciales con calidad, ubicación y respaldo.",
    icon: "home",
  },
  {
    id: "locales-comerciales",
    title: "Locales comerciales",
    description: "Espacios preparados para impulsar nuevos negocios.",
    icon: "store",
  },
  {
    id: "cocheras",
    title: "Cocheras",
    description: "Soluciones urbanas prácticas y oportunidades de inversión.",
    icon: "garage",
  },
  {
    id: "proyectos-futuros",
    title: "Proyectos futuros",
    description:
      "Nuevas oportunidades urbanas para anticiparse, invertir y proyectar.",
    icon: "building",
  },
];

export const institutionSectors: InstitutionSector[] = [
  {
    title: "Organismos públicos",
    description:
      "Capacidad técnica para infraestructura y obras con impacto comunitario.",
    icon: "building",
  },
  {
    title: "Desarrollos privados",
    description:
      "Planificación y ejecución para proyectos residenciales y comerciales.",
    icon: "store",
  },
  {
    title: "Inversores",
    description:
      "Oportunidades acompañadas con contexto, proyección y continuidad.",
    icon: "land",
  },
  {
    title: "Familias",
    description:
      "Espacios para vivir y decisiones respaldadas por experiencia local.",
    icon: "home",
  },
  {
    title: "Comercios",
    description:
      "Soluciones urbanas pensadas para actividad, visibilidad y crecimiento.",
    icon: "store",
  },
  {
    title: "Proyectos urbanos",
    description:
      "Tierra, arquitectura e infraestructura articuladas en una misma visión.",
    icon: "building",
  },
];

export const bellomoProjects: Project[] = [
  {
    id: "quintas-san-antonio",
    name: "Quintas de San Antonio",
    type: "Loteo residencial",
    location: "La Toma, San Antonio",
    status: "En desarrollo",
    description:
      "Hectáreas destinadas a quintas de fin de semana, en una zona residencial de descanso y contacto con la naturaleza.",
    media: bellomoMedia.landField,
  },
  {
    id: "la-arbolada",
    name: "La Arbolada",
    type: "Loteo",
    location: "Jujuy",
    status: "Consultar disponibilidad",
    description:
      "Una propuesta para proyectar el hogar y resguardar la inversión en un entorno de crecimiento.",
    media: bellomoMedia.landForest,
  },
  {
    id: "las-colinas",
    name: "Las Colinas",
    type: "Desarrollo residencial",
    location: "Jujuy",
    status: "Consultar disponibilidad",
    description:
      "Tierra, entorno y proyección urbana para quienes buscan construir una nueva etapa.",
    media: bellomoMedia.territory,
  },
  {
    id: "edificios-huasi",
    name: "Edificios Huasi",
    type: "Desarrollo urbano",
    location: "San Salvador de Jujuy",
    status: "En desarrollo",
    description:
      "Edificios que integran diseño contemporáneo, conectividad urbana y calidad constructiva.",
    media: bellomoReferenceImages.huasiFacade,
  },
  {
    id: "san-pablo",
    name: "San Pablo",
    type: "Loteo",
    location: "Jujuy",
    status: "Consultar disponibilidad",
    description:
      "Una propuesta residencial con proyección, conectividad y entorno para construir.",
    media: bellomoMedia.landSanPablo,
  },
  {
    id: "valle-verde",
    name: "Valle Verde",
    type: "Loteo residencial",
    location: "Jujuy",
    status: "Consultar disponibilidad",
    description:
      "Naturaleza y expansión urbana para una inversión pensada a largo plazo.",
    media: bellomoMedia.landValleVerde,
  },
  {
    id: "los-cardinales",
    name: "Los Cardinales",
    type: "Desarrollo residencial",
    location: "Jujuy",
    status: "Consultar disponibilidad",
    description:
      "Un entorno para proyectar vivienda propia con tranquilidad y respaldo.",
    media: bellomoMedia.landCardinales,
  },
  {
    id: "el-rocio",
    name: "El Rocío",
    type: "Loteo",
    location: "Jujuy",
    status: "Consultar disponibilidad",
    description:
      "Tierra y paisaje reunidos en una oportunidad residencial de escala humana.",
    media: bellomoMedia.landRocio,
  },
  {
    id: "santa-emilia",
    name: "Santa Emilia",
    type: "Loteo residencial",
    location: "Jujuy",
    status: "Consultar disponibilidad",
    description:
      "Una propuesta de crecimiento familiar en un sector con proyección urbana.",
    media: bellomoMedia.landEmilia,
  },
  {
    id: "los-arenales",
    name: "Los Arenales",
    type: "Desarrollo de tierra",
    location: "Jujuy",
    status: "Consultar disponibilidad",
    description:
      "Una alternativa para invertir en suelo y acompañar el desarrollo de la ciudad.",
    media: bellomoMedia.landArenales,
  },
];

export const navigation = [
  { label: "Inicio", href: "#inicio" },
  { label: "Bellomo", href: "#bellomo" },
  { label: "Comercializadora", href: "#comercializadora" },
  { label: "Constructora", href: "#constructora" },
  { label: "Contacto", href: "#contacto" },
];
