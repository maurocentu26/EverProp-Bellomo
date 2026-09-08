export type Company = {
  id: string;
  name: string;
  subdomain?: string;
  primaryColor?: string;
};

export type ProjectType = 'land_development' | 'building' | 'commercial';
export type ProjectStatus = 'planning' | 'pre_sale' | 'under_construction' | 'completed';
export type LeadInterestCategory = 'loteo' | 'local' | 'cochera' | 'tradicional';

// Modelo local del panel. El contrato definitivo del backend queda pendiente
// de confirmación; por eso los campos históricos de Lead se conservan.
export type LeadInterest = {
  id: string;
  companyId: string;
  category?: LeadInterestCategory;
  projectId?: string;
  propertyId?: string;
  propertyTitle?: string;
  status?: string;
  interestLevel?: string;
  unitId?: string;
  price?: number;
  currency?: string;
  preferences?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
};

export type LeadFollowUpType = 'call' | 'whatsapp' | 'email' | 'meeting' | 'visit' | 'note';

// Registro independiente del lead. Se mantiene en el almacenamiento local del
// panel hasta que el backend confirme su contrato definitivo.
export type LeadFollowUp = {
  id: string;
  companyId: string;
  leadId: string;
  agentId: string;
  agentName?: string;
  type: LeadFollowUpType;
  occurredAt: string;
  summary: string;
  result: string;
  nextAction?: string;
  nextContactAt?: string;
};

export const JUJUY_CITIES = [
  "San Salvador de Jujuy",
  "Palpalá",
  "El Carmen",
  "Perico",
  "San Pedro de Jujuy",
  "Yala",
  "Monterrico",
  "Tilcara",
  "Humahuaca",
  "Libertador General San Martín",
] as const;

export type JujuyCity = typeof JUJUY_CITIES[number];

export type Project = {
  id: string;
  companyId: string;
  name: string;
  type: ProjectType;
  status: ProjectStatus;
  progress: number;
  location: {
    city: string;
    province: string;
    address?: string;
  };
  totalUnits: number;
  description?: string;
  masterplanImage?: string;
  coverImage?: string;
};

export type Visit = {
  id: string;
  leadId?: string;
  propertyId?: string;
  leadName?: string;
  propertyTitle?: string;
  phone?: string;
  email?: string;
  scheduledAt: string;
  status: "scheduled" | "completed" | "cancelled";
  notes?: string;
  agentId?: string;
};

export type Property = {
  id: string;
  companyId: string;
  title: string;
  operation: 'sale' | 'rent' | 'temporal';
  propertyType: string;
  price: number;
  currency: 'USD' | 'ARS';
  city: string;
  neighborhood: string;
  bedrooms: number;
  bathrooms: number;
  area_m2?: number;
  mainImage?: string;
  description?: string;
  visits?: Visit[];
  
  // Enterprise / ERP fields
  projectId?: string;
  sectorName?: string;
  unitNumber?: string;
  status?: 'available' | 'reserved' | 'sold';
  services?: { electricity?: boolean; water?: boolean; gas?: boolean; sewage?: boolean; internet?: boolean };
  landFeatures?: { water?: boolean; electricity?: boolean; curb?: boolean; gravel?: boolean; sewage?: boolean; spaceType?: 'Abierto' | 'Semiabierto' | 'Cerrado' };
  isCovered?: boolean;
  commercialFeatures?: { showcaseLength?: number; hasBathroom?: boolean; mezzanine?: boolean; dualAccess?: boolean };
};

export type Lead = {
  id: string;
  companyId: string;
  name: string;
  origin: string;
  propertyIds: string[]; 
  projectId?: string;
  unitIds?: string[];
  stage: 'new' | 'contacted' | 'visiting' | 'negotiation' | 'closing';
  lastActivity: string;
  // Compatibilidad con registros creados antes del historial independiente.
  followUpUpdatedAt?: string;
  phone?: string;
  email?: string;
  interestCategory?: LeadInterestCategory;
  notes?: string;
  interests?: LeadInterest[];
  visits?: Visit[];
  agentId?: string;
  agentName?: string;
};

export function inferLeadInterestCategory(property: Property): LeadInterestCategory {
  const type = (property.propertyType || '').toLowerCase();
  const sector = (property.sectorName || '').toLowerCase();
  const title = (property.title || '').toLowerCase();

  // 1. Cocheras / Estacionamientos
  if (
    type === 'cochera' ||
    type === 'garage' ||
    title.includes('cochera') ||
    title.includes('garage') ||
    title.includes('estacionamiento') ||
    property.isCovered !== undefined
  ) {
    return 'cochera';
  }

  // 2. Locales comerciales / Showrooms / Espacios gastronómicos u oficinas
  if (
    type === 'local' ||
    title.includes('local') ||
    title.includes('showroom') ||
    title.includes('comercial') ||
    title.includes('gastronóm') ||
    title.includes('oficina')
  ) {
    return 'local';
  }

  // 3. Loteos / Terrenos en barrios privados y loteos abiertos
  if (
    type === 'lote' ||
    type === 'loteo' ||
    type === 'lot' ||
    type === 'terreno' ||
    sector.includes('manzana') ||
    sector.includes('lote') ||
    sector.includes('etapa') ||
    title.includes('lote') ||
    title.includes('terreno') ||
    Boolean(property.sectorName && property.unitNumber && !title.includes('depto') && !title.includes('departamento') && !title.includes('casa'))
  ) {
    return 'loteo';
  }

  // 4. Inmobiliaria Tradicional (Departamentos, Casas, Dúplex, etc.)
  return 'tradicional';
}

export const companies: Company[] = [
  { id: 'c1', name: 'Bellomo Jujuy', subdomain: 'bellomo', primaryColor: '#2563eb' },
];

export const projects: Project[] = [
  {
    id: "95b45059-b614-426e-a2c8-4f2015db24a2",
    companyId: 'c1',
    name: "Loteo San Pablo 1",
    type: "land_development",
    status: "under_construction",
    progress: 65,
    location: { city: "San Salvador de Jujuy", province: "Jujuy", address: "Ruta Provincial 1, km 9" },
    totalUnits: 39,
    description: "Desarrollo residencial abierto Loteo San Pablo 1 en San Salvador de Jujuy. Lotes con posesi??n y servicios.",
    coverImage: "https://images.unsplash.com/photo-1500382017468-9049fed747ef?q=80&w=1200"
  },
  {
    id: "9dfebc25-b12b-4ddc-9521-01d058b8f831",
    companyId: 'c1',
    name: "Valle Verde Loteo",
    type: "land_development",
    status: "pre_sale",
    progress: 30,
    location: { city: "San Salvador de Jujuy", province: "Jujuy", address: "Acceso Norte, San Salvador de Jujuy" },
    totalUnits: 20,
    description: "Loteo residencial Valle Verde, parcelas amplias de m??s de 250 m?? en entorno natural consolidado.",
    coverImage: "https://images.unsplash.com/photo-1524813686514-a57563d77d61?q=80&w=1200"
  },
  {
    id: "12e3d498-742b-4e5f-8b1e-7e3ed6b23244",
    companyId: 'c1',
    name: "Remanente El Roco",
    type: "land_development",
    status: "completed",
    progress: 100,
    location: { city: "El Carmen", province: "Jujuy", address: "El Carmen, Valle de los Pericos" },
    totalUnits: 14,
    description: "Remanente de lotes exclusivos El Roco en El Carmen, Jujuy. Disponibilidad inmediata para escriturar.",
    coverImage: "https://images.unsplash.com/photo-1512917774080-9991f1c4c750?q=80&w=1200"
  },
];

export const properties: Property[] = [
  {
    id: "86634fca-fc83-4c43-920d-7b5b4c2fcec1",
    companyId: 'c1',
    title: "Lote 15 \u2014 Manzana AP7",
    operation: 'sale',
    propertyType: 'Lote',
    price: 19428.55,
    currency: "USD",
    city: "San Salvador de Jujuy",
    neighborhood: "SAN GUILLERMO II",
    bedrooms: 0,
    bathrooms: 0,
    area_m2: 267.98,
    projectId: "95b45059-b614-426e-a2c8-4f2015db24a2",
    sectorName: "Manzana AP7",
    unitNumber: "Lote 15",
    status: "reserved",
    description: "LOTE DE 267.98 OCH. 4.79 M2",
    visits: []
  },
  {
    id: "3872c68a-bab6-48ac-b1fd-519ebfa72d70",
    companyId: 'c1',
    title: "Lote 16 \u2014 Manzana AP7",
    operation: 'sale',
    propertyType: 'Lote',
    price: 21292.53,
    currency: "USD",
    city: "San Salvador de Jujuy",
    neighborhood: "SAN GUILLERMO II",
    bedrooms: 0,
    bathrooms: 0,
    area_m2: 293.69,
    projectId: "95b45059-b614-426e-a2c8-4f2015db24a2",
    sectorName: "Manzana AP7",
    unitNumber: "Lote 16",
    status: "reserved",
    description: "LOTE 293.69 M2 OCH. 3.35 M2",
    visits: []
  },
  {
    id: "febe3708-ffc5-47f0-a465-ff865fac5d93",
    companyId: 'c1',
    title: "Lote 17 \u2014 Manzana AP7",
    operation: 'sale',
    propertyType: 'Lote',
    price: 18554.2,
    currency: "USD",
    city: "San Salvador de Jujuy",
    neighborhood: "SAN GUILLERMO II",
    bedrooms: 0,
    bathrooms: 0,
    area_m2: 255.92,
    projectId: "95b45059-b614-426e-a2c8-4f2015db24a2",
    sectorName: "Manzana AP7",
    unitNumber: "Lote 17",
    status: "reserved",
    description: "LOTE DE 255.92 M2",
    visits: []
  },
  {
    id: "c922b50f-a2f3-4d37-8e7d-f40617a572fa",
    companyId: 'c1',
    title: "Lote 18 \u2014 Manzana AP7",
    operation: 'sale',
    propertyType: 'Lote',
    price: 18554.2,
    currency: "USD",
    city: "San Salvador de Jujuy",
    neighborhood: "SAN GUILLERMO II",
    bedrooms: 0,
    bathrooms: 0,
    area_m2: 255.92,
    projectId: "95b45059-b614-426e-a2c8-4f2015db24a2",
    sectorName: "Manzana AP7",
    unitNumber: "Lote 18",
    status: "reserved",
    description: "LOTE DE 255.92 M2",
    visits: []
  },
  {
    id: "3c157af0-e111-4fc0-865b-4476c8ac5304",
    companyId: 'c1',
    title: "Lote 19 \u2014 Manzana AP7",
    operation: 'sale',
    propertyType: 'Lote',
    price: 18554.2,
    currency: "USD",
    city: "San Salvador de Jujuy",
    neighborhood: "SAN GUILLERMO II",
    bedrooms: 0,
    bathrooms: 0,
    area_m2: 255.92,
    projectId: "95b45059-b614-426e-a2c8-4f2015db24a2",
    sectorName: "Manzana AP7",
    unitNumber: "Lote 19",
    status: "reserved",
    description: "LOTE DE 255.92 M2",
    visits: []
  },
  {
    id: "137f929c-5010-4278-8e92-1a692d6c4834",
    companyId: 'c1',
    title: "Lote 2 \u2014 Manzana AP7",
    operation: 'sale',
    propertyType: 'Lote',
    price: 18125.0,
    currency: "USD",
    city: "San Salvador de Jujuy",
    neighborhood: "SAN GUILLERMO II",
    bedrooms: 0,
    bathrooms: 0,
    area_m2: 250.0,
    projectId: "95b45059-b614-426e-a2c8-4f2015db24a2",
    sectorName: "Manzana AP7",
    unitNumber: "Lote 2",
    status: "sold",
    description: "LOTE DE 255.92 M2",
    visits: []
  },
  {
    id: "0d104bf8-e294-401e-9c25-1358537ad5e3",
    companyId: 'c1',
    title: "Lote 20 \u2014 Manzana AP7",
    operation: 'sale',
    propertyType: 'Lote',
    price: 18554.2,
    currency: "USD",
    city: "San Salvador de Jujuy",
    neighborhood: "SAN GUILLERMO II",
    bedrooms: 0,
    bathrooms: 0,
    area_m2: 255.92,
    projectId: "95b45059-b614-426e-a2c8-4f2015db24a2",
    sectorName: "Manzana AP7",
    unitNumber: "Lote 20",
    status: "available",
    description: "LOTE DE 255.92 M2",
    visits: []
  },
  {
    id: "5287137d-93a1-4d1a-930a-c2f78a95fcf9",
    companyId: 'c1',
    title: "Lote 21 \u2014 Manzana AP7",
    operation: 'sale',
    propertyType: 'Lote',
    price: 18554.2,
    currency: "USD",
    city: "San Salvador de Jujuy",
    neighborhood: "SAN GUILLERMO II",
    bedrooms: 0,
    bathrooms: 0,
    area_m2: 255.92,
    projectId: "95b45059-b614-426e-a2c8-4f2015db24a2",
    sectorName: "Manzana AP7",
    unitNumber: "Lote 21",
    status: "sold",
    description: "LOTE DE 255.92 M2",
    visits: []
  },
  {
    id: "be6db9cd-3d4e-48d7-bc72-68aee238eca4",
    companyId: 'c1',
    title: "Lote 22 \u2014 Manzana AP7",
    operation: 'sale',
    propertyType: 'Lote',
    price: 18554.2,
    currency: "USD",
    city: "San Salvador de Jujuy",
    neighborhood: "SAN GUILLERMO II",
    bedrooms: 0,
    bathrooms: 0,
    area_m2: 255.92,
    projectId: "95b45059-b614-426e-a2c8-4f2015db24a2",
    sectorName: "Manzana AP7",
    unitNumber: "Lote 22",
    status: "sold",
    description: "LOTE DE 255.92 M2",
    visits: []
  },
  {
    id: "4f0dfc6c-5fa0-433d-820d-ec6ab86c6afb",
    companyId: 'c1',
    title: "Lote 23 \u2014 Manzana AP7",
    operation: 'sale',
    propertyType: 'Lote',
    price: 18554.2,
    currency: "USD",
    city: "San Salvador de Jujuy",
    neighborhood: "SAN GUILLERMO II",
    bedrooms: 0,
    bathrooms: 0,
    area_m2: 255.92,
    projectId: "95b45059-b614-426e-a2c8-4f2015db24a2",
    sectorName: "Manzana AP7",
    unitNumber: "Lote 23",
    status: "sold",
    description: "LOTE DE 255.92 M2",
    visits: []
  },
  {
    id: "e3b56e1e-b668-42b6-86ce-87f464425869",
    companyId: 'c1',
    title: "Lote 24 \u2014 Manzana AP7",
    operation: 'sale',
    propertyType: 'Lote',
    price: 18554.2,
    currency: "USD",
    city: "San Salvador de Jujuy",
    neighborhood: "SAN GUILLERMO II",
    bedrooms: 0,
    bathrooms: 0,
    area_m2: 255.92,
    projectId: "95b45059-b614-426e-a2c8-4f2015db24a2",
    sectorName: "Manzana AP7",
    unitNumber: "Lote 24",
    status: "sold",
    description: "LOTE DE 255.92 M2",
    visits: []
  },
  {
    id: "9e7a8a18-f61e-41d3-b2a9-342e9342084a",
    companyId: 'c1',
    title: "Lote 25 \u2014 Manzana AP7",
    operation: 'sale',
    propertyType: 'Lote',
    price: 18554.2,
    currency: "USD",
    city: "San Salvador de Jujuy",
    neighborhood: "SAN GUILLERMO II",
    bedrooms: 0,
    bathrooms: 0,
    area_m2: 255.92,
    projectId: "95b45059-b614-426e-a2c8-4f2015db24a2",
    sectorName: "Manzana AP7",
    unitNumber: "Lote 25",
    status: "sold",
    description: "LOTE DE 255.92 M2",
    visits: []
  },
  {
    id: "48093c2b-c300-4711-9898-73ea5bb480c8",
    companyId: 'c1',
    title: "Lote 26 \u2014 Manzana AP7",
    operation: 'sale',
    propertyType: 'Lote',
    price: 18487.5,
    currency: "USD",
    city: "San Salvador de Jujuy",
    neighborhood: "SAN GUILLERMO II",
    bedrooms: 0,
    bathrooms: 0,
    area_m2: 255.0,
    projectId: "95b45059-b614-426e-a2c8-4f2015db24a2",
    sectorName: "Manzana AP7",
    unitNumber: "Lote 26",
    status: "sold",
    description: "LOTE DE 255.92 M2",
    visits: []
  },
  {
    id: "600cacd4-16d2-4af9-8f45-7b6f77ab3a8c",
    companyId: 'c1',
    title: "Lote 27 \u2014 Manzana AP7",
    operation: 'sale',
    propertyType: 'Lote',
    price: 18554.2,
    currency: "USD",
    city: "San Salvador de Jujuy",
    neighborhood: "SAN GUILLERMO II",
    bedrooms: 0,
    bathrooms: 0,
    area_m2: 255.92,
    projectId: "95b45059-b614-426e-a2c8-4f2015db24a2",
    sectorName: "Manzana AP7",
    unitNumber: "Lote 27",
    status: "available",
    description: "LOTE DE 255.92 M2",
    visits: []
  },
  {
    id: "82a874f1-6bdd-446e-8e8c-ec0e38ab6d38",
    companyId: 'c1',
    title: "Lote 28 \u2014 Manzana AP7",
    operation: 'sale',
    propertyType: 'Lote',
    price: 18554.2,
    currency: "USD",
    city: "San Salvador de Jujuy",
    neighborhood: "SAN GUILLERMO II",
    bedrooms: 0,
    bathrooms: 0,
    area_m2: 255.92,
    projectId: "95b45059-b614-426e-a2c8-4f2015db24a2",
    sectorName: "Manzana AP7",
    unitNumber: "Lote 28",
    status: "sold",
    description: "LOTE DE 255.92 M2",
    visits: []
  },
  {
    id: "b0bd8ab5-a369-4bde-9b6a-f7ee21bd6828",
    companyId: 'c1',
    title: "Lote 29 \u2014 Manzana AP7",
    operation: 'sale',
    propertyType: 'Lote',
    price: 18554.2,
    currency: "USD",
    city: "San Salvador de Jujuy",
    neighborhood: "SAN GUILLERMO II",
    bedrooms: 0,
    bathrooms: 0,
    area_m2: 255.92,
    projectId: "95b45059-b614-426e-a2c8-4f2015db24a2",
    sectorName: "Manzana AP7",
    unitNumber: "Lote 29",
    status: "sold",
    description: "LOTE DE 255.92 M2",
    visits: []
  },
  {
    id: "b98dd7c4-023d-44bd-af70-cc71c2c0f10f",
    companyId: 'c1',
    title: "Lote 3 \u2014 Manzana AP7",
    operation: 'sale',
    propertyType: 'Lote',
    price: 18554.2,
    currency: "USD",
    city: "San Salvador de Jujuy",
    neighborhood: "SAN GUILLERMO II",
    bedrooms: 0,
    bathrooms: 0,
    area_m2: 255.92,
    projectId: "95b45059-b614-426e-a2c8-4f2015db24a2",
    sectorName: "Manzana AP7",
    unitNumber: "Lote 3",
    status: "sold",
    description: "LOTE DE 255.92 M2",
    visits: []
  },
  {
    id: "ccf8f018-5c60-45bb-85f1-b5537af53982",
    companyId: 'c1',
    title: "Lote 30 \u2014 Manzana AP7",
    operation: 'sale',
    propertyType: 'Lote',
    price: 18193.88,
    currency: "USD",
    city: "San Salvador de Jujuy",
    neighborhood: "SAN GUILLERMO II",
    bedrooms: 0,
    bathrooms: 0,
    area_m2: 250.95,
    projectId: "95b45059-b614-426e-a2c8-4f2015db24a2",
    sectorName: "Manzana AP7",
    unitNumber: "Lote 30",
    status: "sold",
    description: "LOTE DE 250.95 M2",
    visits: []
  },
  {
    id: "2406a312-3a1c-4e0a-acab-858b8a146ac3",
    companyId: 'c1',
    title: "Lote 4 \u2014 Manzana AP7",
    operation: 'sale',
    propertyType: 'Lote',
    price: 18125.0,
    currency: "USD",
    city: "San Salvador de Jujuy",
    neighborhood: "SAN GUILLERMO II",
    bedrooms: 0,
    bathrooms: 0,
    area_m2: 250.0,
    projectId: "95b45059-b614-426e-a2c8-4f2015db24a2",
    sectorName: "Manzana AP7",
    unitNumber: "Lote 4",
    status: "sold",
    description: "LOTE DE 255.92 M2",
    visits: []
  },
  {
    id: "a6112106-821d-40cc-96e2-19b777e9a3bb",
    companyId: 'c1',
    title: "Lote 5 \u2014 Manzana AP7",
    operation: 'sale',
    propertyType: 'Lote',
    price: 18125.0,
    currency: "USD",
    city: "San Salvador de Jujuy",
    neighborhood: "SAN GUILLERMO II",
    bedrooms: 0,
    bathrooms: 0,
    area_m2: 250.0,
    projectId: "95b45059-b614-426e-a2c8-4f2015db24a2",
    sectorName: "Manzana AP7",
    unitNumber: "Lote 5",
    status: "sold",
    description: "LOTE DE 255.92 M2",
    visits: []
  },
  {
    id: "6ee3555c-79ef-4662-837a-068e0feaa78b",
    companyId: 'c1',
    title: "Lote 6 \u2014 Manzana AP7",
    operation: 'sale',
    propertyType: 'Lote',
    price: 18554.2,
    currency: "USD",
    city: "San Salvador de Jujuy",
    neighborhood: "SAN GUILLERMO II",
    bedrooms: 0,
    bathrooms: 0,
    area_m2: 255.92,
    projectId: "95b45059-b614-426e-a2c8-4f2015db24a2",
    sectorName: "Manzana AP7",
    unitNumber: "Lote 6",
    status: "sold",
    description: "LOTE DE 255.92 M2",
    visits: []
  },
  {
    id: "73cb8123-727d-484d-894c-438fc26b6fc9",
    companyId: 'c1',
    title: "Lote 7 \u2014 Manzana AP7",
    operation: 'sale',
    propertyType: 'Lote',
    price: 18554.2,
    currency: "USD",
    city: "San Salvador de Jujuy",
    neighborhood: "SAN GUILLERMO II",
    bedrooms: 0,
    bathrooms: 0,
    area_m2: 255.92,
    projectId: "95b45059-b614-426e-a2c8-4f2015db24a2",
    sectorName: "Manzana AP7",
    unitNumber: "Lote 7",
    status: "sold",
    description: "LOTE DE 255.92 M2",
    visits: []
  },
  {
    id: "4bf95f21-7a8a-47e2-a7ce-2458b3840cf3",
    companyId: 'c1',
    title: "Lote 8 \u2014 Manzana AP7",
    operation: 'sale',
    propertyType: 'Lote',
    price: 18487.5,
    currency: "USD",
    city: "San Salvador de Jujuy",
    neighborhood: "SAN GUILLERMO II",
    bedrooms: 0,
    bathrooms: 0,
    area_m2: 255.0,
    projectId: "95b45059-b614-426e-a2c8-4f2015db24a2",
    sectorName: "Manzana AP7",
    unitNumber: "Lote 8",
    status: "sold",
    description: "LOTE DE 255.92 M2",
    visits: []
  },
  {
    id: "8d4043ac-461c-4418-9e58-cb2e5cec88a4",
    companyId: 'c1',
    title: "Lote 9 \u2014 Manzana AP7",
    operation: 'sale',
    propertyType: 'Lote',
    price: 18554.2,
    currency: "USD",
    city: "San Salvador de Jujuy",
    neighborhood: "SAN GUILLERMO II",
    bedrooms: 0,
    bathrooms: 0,
    area_m2: 255.92,
    projectId: "95b45059-b614-426e-a2c8-4f2015db24a2",
    sectorName: "Manzana AP7",
    unitNumber: "Lote 9",
    status: "sold",
    description: "LOTE DE 255.92 M2",
    visits: []
  },
  {
    id: "bc18f745-d19d-4fa3-a6b5-29ba3fb4a0d9",
    companyId: 'c1',
    title: "Lote 1 \u2014 Manzana AP8",
    operation: 'sale',
    propertyType: 'Lote',
    price: 18320.75,
    currency: "USD",
    city: "San Salvador de Jujuy",
    neighborhood: "SAN GUILLERMO II",
    bedrooms: 0,
    bathrooms: 0,
    area_m2: 252.7,
    projectId: "95b45059-b614-426e-a2c8-4f2015db24a2",
    sectorName: "Manzana AP8",
    unitNumber: "Lote 1",
    status: "sold",
    description: "LOTE DE 252.70 M2 OCH. 3.22 M2",
    visits: []
  },
  {
    id: "6e54ca4c-e162-47f6-9dee-c3ef48f2751f",
    companyId: 'c1',
    title: "Lote 10 \u2014 Manzana AP8",
    operation: 'sale',
    propertyType: 'Lote',
    price: 959700.0,
    currency: "ARS",
    city: "San Salvador de Jujuy",
    neighborhood: "SAN GUILLERMO II",
    bedrooms: 0,
    bathrooms: 0,
    area_m2: 250.0,
    projectId: "95b45059-b614-426e-a2c8-4f2015db24a2",
    sectorName: "Manzana AP8",
    unitNumber: "Lote 10",
    status: "sold",
    description: "LOTE DE 255.92 M2",
    visits: []
  },
  {
    id: "7fbf4a25-c45b-4d5c-8608-e0629fb8bc10",
    companyId: 'c1',
    title: "Lote 11 \u2014 Manzana AP8",
    operation: 'sale',
    propertyType: 'Lote',
    price: 959700.0,
    currency: "ARS",
    city: "San Salvador de Jujuy",
    neighborhood: "SAN GUILLERMO II",
    bedrooms: 0,
    bathrooms: 0,
    area_m2: 255.0,
    projectId: "95b45059-b614-426e-a2c8-4f2015db24a2",
    sectorName: "Manzana AP8",
    unitNumber: "Lote 11",
    status: "sold",
    description: "LOTE DE 255.92 M2",
    visits: []
  },
  {
    id: "778e97a2-55f8-4bae-a580-09010ec6552f",
    companyId: 'c1',
    title: "Lote 12 \u2014 Manzana AP8",
    operation: 'sale',
    propertyType: 'Lote',
    price: 18554.2,
    currency: "USD",
    city: "San Salvador de Jujuy",
    neighborhood: "SAN GUILLERMO II",
    bedrooms: 0,
    bathrooms: 0,
    area_m2: 255.92,
    projectId: "95b45059-b614-426e-a2c8-4f2015db24a2",
    sectorName: "Manzana AP8",
    unitNumber: "Lote 12",
    status: "reserved",
    description: "LOTE DE 255.92 M2",
    visits: []
  },
  {
    id: "3bda11ef-732e-41ce-96d6-f1f735c6ba5f",
    companyId: 'c1',
    title: "Lote 13 \u2014 Manzana AP8",
    operation: 'sale',
    propertyType: 'Lote',
    price: 1500000.0,
    currency: "ARS",
    city: "San Salvador de Jujuy",
    neighborhood: "SAN GUILLERMO II",
    bedrooms: 0,
    bathrooms: 0,
    area_m2: 255.0,
    projectId: "95b45059-b614-426e-a2c8-4f2015db24a2",
    sectorName: "Manzana AP8",
    unitNumber: "Lote 13",
    status: "sold",
    description: "LOTE DE 255.92 M2",
    visits: []
  },
  {
    id: "57ffb649-256d-47b6-b727-bc7684304517",
    companyId: 'c1',
    title: "Lote 14 \u2014 Manzana AP8",
    operation: 'sale',
    propertyType: 'Lote',
    price: 33336.22,
    currency: "USD",
    city: "San Salvador de Jujuy",
    neighborhood: "SAN GUILLERMO II",
    bedrooms: 0,
    bathrooms: 0,
    area_m2: 459.81,
    projectId: "95b45059-b614-426e-a2c8-4f2015db24a2",
    sectorName: "Manzana AP8",
    unitNumber: "Lote 14",
    status: "reserved",
    description: "LOTE DE 459.81 M2 OCH. 4.79 M2",
    visits: []
  },
  {
    id: "4d88c258-2be9-47ae-bfa8-d4b45da320a7",
    companyId: 'c1',
    title: "Lote 15 \u2014 Manzana AP8",
    operation: 'sale',
    propertyType: 'Lote',
    price: 35200.92,
    currency: "USD",
    city: "San Salvador de Jujuy",
    neighborhood: "SAN GUILLERMO II",
    bedrooms: 0,
    bathrooms: 0,
    area_m2: 485.53,
    projectId: "95b45059-b614-426e-a2c8-4f2015db24a2",
    sectorName: "Manzana AP8",
    unitNumber: "Lote 15",
    status: "reserved",
    description: "LOTE DE 485.53 M2 OCH. 3.35 M2",
    visits: []
  },
  {
    id: "5764ce34-689e-4cbc-b985-77d20fb7cd42",
    companyId: 'c1',
    title: "Lote 16 \u2014 Manzana AP8",
    operation: 'sale',
    propertyType: 'Lote',
    price: 18554.2,
    currency: "USD",
    city: "San Salvador de Jujuy",
    neighborhood: "SAN GUILLERMO II",
    bedrooms: 0,
    bathrooms: 0,
    area_m2: 255.92,
    projectId: "95b45059-b614-426e-a2c8-4f2015db24a2",
    sectorName: "Manzana AP8",
    unitNumber: "Lote 16",
    status: "reserved",
    description: "LOTE DE 255.92 M2",
    visits: []
  },
  {
    id: "26732dea-70a2-453a-a356-bc7f13a6d560",
    companyId: 'c1',
    title: "Lote 17 \u2014 Manzana AP8",
    operation: 'sale',
    propertyType: 'Lote',
    price: 18554.2,
    currency: "USD",
    city: "San Salvador de Jujuy",
    neighborhood: "SAN GUILLERMO II",
    bedrooms: 0,
    bathrooms: 0,
    area_m2: 255.92,
    projectId: "95b45059-b614-426e-a2c8-4f2015db24a2",
    sectorName: "Manzana AP8",
    unitNumber: "Lote 17",
    status: "reserved",
    description: "LOTE DE 255.92 M2",
    visits: []
  },
  {
    id: "ea981881-ab3c-408f-b8d9-93b74a909fd3",
    companyId: 'c1',
    title: "Lote 18 \u2014 Manzana AP8",
    operation: 'sale',
    propertyType: 'Lote',
    price: 18554.2,
    currency: "USD",
    city: "San Salvador de Jujuy",
    neighborhood: "SAN GUILLERMO II",
    bedrooms: 0,
    bathrooms: 0,
    area_m2: 255.92,
    projectId: "95b45059-b614-426e-a2c8-4f2015db24a2",
    sectorName: "Manzana AP8",
    unitNumber: "Lote 18",
    status: "reserved",
    description: "LOTE DE 255.92 M2",
    visits: []
  },
  {
    id: "653d5644-f5b2-4b74-95d4-75d7dde74202",
    companyId: 'c1',
    title: "Lote 19 \u2014 Manzana AP8",
    operation: 'sale',
    propertyType: 'Lote',
    price: 1300000.0,
    currency: "ARS",
    city: "San Salvador de Jujuy",
    neighborhood: "SAN GUILLERMO II",
    bedrooms: 0,
    bathrooms: 0,
    area_m2: 255.92,
    projectId: "95b45059-b614-426e-a2c8-4f2015db24a2",
    sectorName: "Manzana AP8",
    unitNumber: "Lote 19",
    status: "sold",
    description: "LOTE DE 255.92 M2",
    visits: []
  },
  {
    id: "7a3b5744-bb2b-4d9d-a66c-750d0ec871cc",
    companyId: 'c1',
    title: "Lote 2 \u2014 Manzana AP8",
    operation: 'sale',
    propertyType: 'Lote',
    price: 18554.2,
    currency: "USD",
    city: "San Salvador de Jujuy",
    neighborhood: "SAN GUILLERMO II",
    bedrooms: 0,
    bathrooms: 0,
    area_m2: 255.92,
    projectId: "95b45059-b614-426e-a2c8-4f2015db24a2",
    sectorName: "Manzana AP8",
    unitNumber: "Lote 2",
    status: "sold",
    description: "LOTE DE 255.92 M2 OCH.",
    visits: []
  },
  {
    id: "662d4b5c-a849-424f-b85a-b870810ef1d7",
    companyId: 'c1',
    title: "Lote 20 \u2014 Manzana AP8",
    operation: 'sale',
    propertyType: 'Lote',
    price: 18487.5,
    currency: "USD",
    city: "San Salvador de Jujuy",
    neighborhood: "SAN GUILLERMO II",
    bedrooms: 0,
    bathrooms: 0,
    area_m2: 255.0,
    projectId: "95b45059-b614-426e-a2c8-4f2015db24a2",
    sectorName: "Manzana AP8",
    unitNumber: "Lote 20",
    status: "sold",
    description: "LOTE DE 255.92 M2",
    visits: []
  },
  {
    id: "d44ccd4c-b998-4907-bf6f-6db4bb0c5998",
    companyId: 'c1',
    title: "Lote 21 \u2014 Manzana AP8",
    operation: 'sale',
    propertyType: 'Lote',
    price: 18125.0,
    currency: "USD",
    city: "San Salvador de Jujuy",
    neighborhood: "SAN GUILLERMO II",
    bedrooms: 0,
    bathrooms: 0,
    area_m2: 250.0,
    projectId: "95b45059-b614-426e-a2c8-4f2015db24a2",
    sectorName: "Manzana AP8",
    unitNumber: "Lote 21",
    status: "sold",
    description: "LOTE DE 255.92 M2",
    visits: []
  },
  {
    id: "ba30645f-c067-488b-9ee3-a0627b787e33",
    companyId: 'c1',
    title: "Lote 22 \u2014 Manzana AP8",
    operation: 'sale',
    propertyType: 'Lote',
    price: 18125.0,
    currency: "USD",
    city: "San Salvador de Jujuy",
    neighborhood: "SAN GUILLERMO II",
    bedrooms: 0,
    bathrooms: 0,
    area_m2: 250.0,
    projectId: "95b45059-b614-426e-a2c8-4f2015db24a2",
    sectorName: "Manzana AP8",
    unitNumber: "Lote 22",
    status: "sold",
    description: "LOTE DE 255.92 M2",
    visits: []
  },
  {
    id: "fec3a1c2-ad21-4071-bac8-4941468b522b",
    companyId: 'c1',
    title: "Lote 11 \u2014 Manzana AP14",
    operation: 'sale',
    propertyType: 'Lote',
    price: 1317580.8,
    currency: "ARS",
    city: "San Salvador de Jujuy",
    neighborhood: "ALTO COMEDERO",
    bedrooms: 0,
    bathrooms: 0,
    area_m2: 250.0,
    projectId: "9dfebc25-b12b-4ddc-9521-01d058b8f831",
    sectorName: "Manzana AP14",
    unitNumber: "Lote 11",
    status: "sold",
    description: "LOTE DE 296 M2 OCH. 4 M2",
    visits: []
  },
  {
    id: "48d23467-233a-4dfe-96df-0a1b7e79b74f",
    companyId: 'c1',
    title: "Lote 12 \u2014 Manzana AP14",
    operation: 'sale',
    propertyType: 'Lote',
    price: 1200000.0,
    currency: "ARS",
    city: "San Salvador de Jujuy",
    neighborhood: "ALTO COMEDERO",
    bedrooms: 0,
    bathrooms: 0,
    area_m2: 300.0,
    projectId: "9dfebc25-b12b-4ddc-9521-01d058b8f831",
    sectorName: "Manzana AP14",
    unitNumber: "Lote 12",
    status: "sold",
    description: "LOTE DE 300 M2",
    visits: []
  },
  {
    id: "42674946-faa2-4803-8e26-a4bf31a99ecc",
    companyId: 'c1',
    title: "Lote 13 \u2014 Manzana AP14",
    operation: 'sale',
    propertyType: 'Lote',
    price: 18125.0,
    currency: "USD",
    city: "San Salvador de Jujuy",
    neighborhood: "ALTO COMEDERO",
    bedrooms: 0,
    bathrooms: 0,
    area_m2: 250.0,
    projectId: "9dfebc25-b12b-4ddc-9521-01d058b8f831",
    sectorName: "Manzana AP14",
    unitNumber: "Lote 13",
    status: "sold",
    description: "LOTE DE 300 M2",
    visits: []
  },
  {
    id: "7a6cc82e-4743-4d04-baf6-0bab15f8ccc2",
    companyId: 'c1',
    title: "Lote 14 \u2014 Manzana AP14",
    operation: 'sale',
    propertyType: 'Lote',
    price: 21750.0,
    currency: "USD",
    city: "San Salvador de Jujuy",
    neighborhood: "ALTO COMEDERO",
    bedrooms: 0,
    bathrooms: 0,
    area_m2: 300.0,
    projectId: "9dfebc25-b12b-4ddc-9521-01d058b8f831",
    sectorName: "Manzana AP14",
    unitNumber: "Lote 14",
    status: "sold",
    description: "LOTE DE 300 M2",
    visits: []
  },
  {
    id: "28e674e4-a42a-420a-a1f2-2e18031b9e35",
    companyId: 'c1',
    title: "Lote 15 \u2014 Manzana AP14",
    operation: 'sale',
    propertyType: 'Lote',
    price: 18125.0,
    currency: "USD",
    city: "San Salvador de Jujuy",
    neighborhood: "ALTO COMEDERO",
    bedrooms: 0,
    bathrooms: 0,
    area_m2: 250.0,
    projectId: "9dfebc25-b12b-4ddc-9521-01d058b8f831",
    sectorName: "Manzana AP14",
    unitNumber: "Lote 15",
    status: "sold",
    description: "LOTE DE 300 M2",
    visits: []
  },
  {
    id: "1ecc575d-e2fb-463d-b5f1-fda916f2962e",
    companyId: 'c1',
    title: "Lote 16 \u2014 Manzana AP14",
    operation: 'sale',
    propertyType: 'Lote',
    price: 21750.0,
    currency: "USD",
    city: "San Salvador de Jujuy",
    neighborhood: "ALTO COMEDERO",
    bedrooms: 0,
    bathrooms: 0,
    area_m2: 300.0,
    projectId: "9dfebc25-b12b-4ddc-9521-01d058b8f831",
    sectorName: "Manzana AP14",
    unitNumber: "Lote 16",
    status: "sold",
    description: "LOTE DE 300 M2",
    visits: []
  },
  {
    id: "85b862e4-bc2b-4653-870e-44e5d2d419cf",
    companyId: 'c1',
    title: "Lote 17 \u2014 Manzana AP14",
    operation: 'sale',
    propertyType: 'Lote',
    price: 1200000.0,
    currency: "ARS",
    city: "San Salvador de Jujuy",
    neighborhood: "ALTO COMEDERO",
    bedrooms: 0,
    bathrooms: 0,
    area_m2: 250.0,
    projectId: "9dfebc25-b12b-4ddc-9521-01d058b8f831",
    sectorName: "Manzana AP14",
    unitNumber: "Lote 17",
    status: "sold",
    description: "LOTE DE 300 M2 VENTA CABA CON AP4 L4",
    visits: []
  },
  {
    id: "3a4ee040-9cba-4844-b724-5c356e118df4",
    companyId: 'c1',
    title: "Lote 18 \u2014 Manzana AP14",
    operation: 'sale',
    propertyType: 'Lote',
    price: 21750.0,
    currency: "USD",
    city: "San Salvador de Jujuy",
    neighborhood: "ALTO COMEDERO",
    bedrooms: 0,
    bathrooms: 0,
    area_m2: 300.0,
    projectId: "9dfebc25-b12b-4ddc-9521-01d058b8f831",
    sectorName: "Manzana AP14",
    unitNumber: "Lote 18",
    status: "sold",
    description: "LOTE DE 300 M2",
    visits: []
  },
  {
    id: "d66ee610-c41a-4f1e-9dc2-4748bc61037c",
    companyId: 'c1',
    title: "Lote 19 \u2014 Manzana AP14",
    operation: 'sale',
    propertyType: 'Lote',
    price: 18125.0,
    currency: "USD",
    city: "San Salvador de Jujuy",
    neighborhood: "ALTO COMEDERO",
    bedrooms: 0,
    bathrooms: 0,
    area_m2: 250.0,
    projectId: "9dfebc25-b12b-4ddc-9521-01d058b8f831",
    sectorName: "Manzana AP14",
    unitNumber: "Lote 19",
    status: "sold",
    description: "LOTE DE 300 M2",
    visits: []
  },
  {
    id: "09e38bd2-bb6a-4970-9ab1-11cdf6338036",
    companyId: 'c1',
    title: "Lote 2 \u2014 Manzana AP14",
    operation: 'sale',
    propertyType: 'Lote',
    price: 850000.0,
    currency: "ARS",
    city: "San Salvador de Jujuy",
    neighborhood: "ALTO COMEDERO",
    bedrooms: 0,
    bathrooms: 0,
    area_m2: 300.0,
    projectId: "9dfebc25-b12b-4ddc-9521-01d058b8f831",
    sectorName: "Manzana AP14",
    unitNumber: "Lote 2",
    status: "sold",
    description: "LOTE DE 300 M2",
    visits: []
  },
  {
    id: "a6ee9597-59d5-4d36-b1e6-3a622bbf920c",
    companyId: 'c1',
    title: "Lote 20 \u2014 Manzana AP14",
    operation: 'sale',
    propertyType: 'Lote',
    price: 18125.0,
    currency: "USD",
    city: "San Salvador de Jujuy",
    neighborhood: "ALTO COMEDERO",
    bedrooms: 0,
    bathrooms: 0,
    area_m2: 250.0,
    projectId: "9dfebc25-b12b-4ddc-9521-01d058b8f831",
    sectorName: "Manzana AP14",
    unitNumber: "Lote 20",
    status: "sold",
    description: "LOTE DE 296 M2 OCH. 4 M2",
    visits: []
  },
  {
    id: "33b705fd-0dee-4f19-af1c-11febbcd2ab2",
    companyId: 'c1',
    title: "Lote 3 \u2014 Manzana AP14",
    operation: 'sale',
    propertyType: 'Lote',
    price: 21750.0,
    currency: "USD",
    city: "San Salvador de Jujuy",
    neighborhood: "ALTO COMEDERO",
    bedrooms: 0,
    bathrooms: 0,
    area_m2: 300.0,
    projectId: "9dfebc25-b12b-4ddc-9521-01d058b8f831",
    sectorName: "Manzana AP14",
    unitNumber: "Lote 3",
    status: "sold",
    description: "LOTE DE 300 M2",
    visits: []
  },
  {
    id: "5a8ce6da-db1e-4904-9399-371cc56a4b61",
    companyId: 'c1',
    title: "Lote 4 \u2014 Manzana AP14",
    operation: 'sale',
    propertyType: 'Lote',
    price: 18125.0,
    currency: "USD",
    city: "San Salvador de Jujuy",
    neighborhood: "ALTO COMEDERO",
    bedrooms: 0,
    bathrooms: 0,
    area_m2: 250.0,
    projectId: "9dfebc25-b12b-4ddc-9521-01d058b8f831",
    sectorName: "Manzana AP14",
    unitNumber: "Lote 4",
    status: "sold",
    description: "LOTE DE 300 M2 CAMBIO POR AP30 L13",
    visits: []
  },
  {
    id: "2604520b-05e0-46cf-a31e-aebe95c02f7c",
    companyId: 'c1',
    title: "Lote 5 \u2014 Manzana AP14",
    operation: 'sale',
    propertyType: 'Lote',
    price: 18125.0,
    currency: "USD",
    city: "San Salvador de Jujuy",
    neighborhood: "ALTO COMEDERO",
    bedrooms: 0,
    bathrooms: 0,
    area_m2: 250.0,
    projectId: "9dfebc25-b12b-4ddc-9521-01d058b8f831",
    sectorName: "Manzana AP14",
    unitNumber: "Lote 5",
    status: "sold",
    description: "LOTE DE 300 M2",
    visits: []
  },
  {
    id: "fdbab130-40f3-4b39-a204-5d1693383d90",
    companyId: 'c1',
    title: "Lote 6 \u2014 Manzana AP14",
    operation: 'sale',
    propertyType: 'Lote',
    price: 18125.0,
    currency: "USD",
    city: "San Salvador de Jujuy",
    neighborhood: "ALTO COMEDERO",
    bedrooms: 0,
    bathrooms: 0,
    area_m2: 250.0,
    projectId: "9dfebc25-b12b-4ddc-9521-01d058b8f831",
    sectorName: "Manzana AP14",
    unitNumber: "Lote 6",
    status: "sold",
    description: "LOTE DE 300 M2",
    visits: []
  },
  {
    id: "141b5107-610c-411c-8f5a-0a156274b1e6",
    companyId: 'c1',
    title: "Lote 7 \u2014 Manzana AP14",
    operation: 'sale',
    propertyType: 'Lote',
    price: 850000.0,
    currency: "ARS",
    city: "San Salvador de Jujuy",
    neighborhood: "ALTO COMEDERO",
    bedrooms: 0,
    bathrooms: 0,
    area_m2: 300.0,
    projectId: "9dfebc25-b12b-4ddc-9521-01d058b8f831",
    sectorName: "Manzana AP14",
    unitNumber: "Lote 7",
    status: "sold",
    description: "LOTE DE 300 M2",
    visits: []
  },
  {
    id: "abbf96f3-0a7a-4b3d-b06a-d772230cb1f1",
    companyId: 'c1',
    title: "Lote 8 \u2014 Manzana AP14",
    operation: 'sale',
    propertyType: 'Lote',
    price: 21750.0,
    currency: "USD",
    city: "San Salvador de Jujuy",
    neighborhood: "ALTO COMEDERO",
    bedrooms: 0,
    bathrooms: 0,
    area_m2: 300.0,
    projectId: "9dfebc25-b12b-4ddc-9521-01d058b8f831",
    sectorName: "Manzana AP14",
    unitNumber: "Lote 8",
    status: "sold",
    description: "LOTE DE 300 M2",
    visits: []
  },
  {
    id: "cbdacd79-f161-479d-8bb8-d161379768d0",
    companyId: 'c1',
    title: "Lote 9 \u2014 Manzana AP14",
    operation: 'sale',
    propertyType: 'Lote',
    price: 850000.0,
    currency: "ARS",
    city: "San Salvador de Jujuy",
    neighborhood: "ALTO COMEDERO",
    bedrooms: 0,
    bathrooms: 0,
    area_m2: 300.0,
    projectId: "9dfebc25-b12b-4ddc-9521-01d058b8f831",
    sectorName: "Manzana AP14",
    unitNumber: "Lote 9",
    status: "sold",
    description: "LOTE DE 300 M2",
    visits: []
  },
  {
    id: "9d5fbf36-e76d-4b49-a198-c43ab18e4b2d",
    companyId: 'c1',
    title: "Lote 1 \u2014 Manzana AP15",
    operation: 'sale',
    propertyType: 'Lote',
    price: 21460.0,
    currency: "USD",
    city: "San Salvador de Jujuy",
    neighborhood: "ALTO COMEDERO",
    bedrooms: 0,
    bathrooms: 0,
    area_m2: 296.0,
    projectId: "9dfebc25-b12b-4ddc-9521-01d058b8f831",
    sectorName: "Manzana AP15",
    unitNumber: "Lote 1",
    status: "sold",
    description: "LOTE DE 296 M2 OCH. 4 M2",
    visits: []
  },
  {
    id: "b2831604-ae23-4072-8f34-63ad2e931a0e",
    companyId: 'c1',
    title: "Lote 10 \u2014 Manzana AP15",
    operation: 'sale',
    propertyType: 'Lote',
    price: 18125.0,
    currency: "USD",
    city: "San Salvador de Jujuy",
    neighborhood: "ALTO COMEDERO",
    bedrooms: 0,
    bathrooms: 0,
    area_m2: 250.0,
    projectId: "9dfebc25-b12b-4ddc-9521-01d058b8f831",
    sectorName: "Manzana AP15",
    unitNumber: "Lote 10",
    status: "sold",
    description: "LOTE DE 300 M2",
    visits: []
  },
  {
    id: "a2f93ed3-08b9-4ff1-a2d8-5a242710d049",
    companyId: 'c1',
    title: "Lote 9 \u2014 Manzana AP12",
    operation: 'sale',
    propertyType: 'Lote',
    price: 17835.0,
    currency: "USD",
    city: "El Carmen",
    neighborhood: "EL CARMEN",
    bedrooms: 0,
    bathrooms: 0,
    area_m2: 246.0,
    projectId: "12e3d498-742b-4e5f-8b1e-7e3ed6b23244",
    sectorName: "Manzana AP12",
    unitNumber: "Lote 9",
    status: "sold",
    description: "LOTE DE 246 M2 OCH. 4 M2",
    visits: []
  },
  {
    id: "047524a5-09df-4566-b1b9-52f1aa42d3ff",
    companyId: 'c1',
    title: "Lote 1 \u2014 Manzana AP13",
    operation: 'sale',
    propertyType: 'Lote',
    price: 122789.54,
    currency: "ARS",
    city: "El Carmen",
    neighborhood: "EL CARMEN",
    bedrooms: 0,
    bathrooms: 0,
    area_m2: 250.0,
    projectId: "12e3d498-742b-4e5f-8b1e-7e3ed6b23244",
    sectorName: "Manzana AP13",
    unitNumber: "Lote 1",
    status: "sold",
    description: "LOTE DE 347,89 M2",
    visits: []
  },
  {
    id: "12111de6-7d9c-41e3-9e9f-5ddc5479684d",
    companyId: 'c1',
    title: "Lote 10 \u2014 Manzana AP13",
    operation: 'sale',
    propertyType: 'Lote',
    price: 19056.07,
    currency: "USD",
    city: "El Carmen",
    neighborhood: "EL CARMEN",
    bedrooms: 0,
    bathrooms: 0,
    area_m2: 250.0,
    projectId: "12e3d498-742b-4e5f-8b1e-7e3ed6b23244",
    sectorName: "Manzana AP13",
    unitNumber: "Lote 10",
    status: "sold",
    description: "LOTE DE 250M2",
    visits: []
  },
  {
    id: "ecce9781-616f-4ee2-8f6c-0e2d8c781e35",
    companyId: 'c1',
    title: "Lote 11 \u2014 Manzana AP13",
    operation: 'sale',
    propertyType: 'Lote',
    price: 146520.0,
    currency: "ARS",
    city: "El Carmen",
    neighborhood: "EL CARMEN",
    bedrooms: 0,
    bathrooms: 0,
    area_m2: 250.0,
    projectId: "12e3d498-742b-4e5f-8b1e-7e3ed6b23244",
    sectorName: "Manzana AP13",
    unitNumber: "Lote 11",
    status: "sold",
    description: "LOTE DE: 250M2",
    visits: []
  },
  {
    id: "37e5a048-facf-45cb-b1a5-bbad5d3bfb63",
    companyId: 'c1',
    title: "Lote 12 \u2014 Manzana AP13",
    operation: 'sale',
    propertyType: 'Lote',
    price: 207500.0,
    currency: "ARS",
    city: "El Carmen",
    neighborhood: "EL CARMEN",
    bedrooms: 0,
    bathrooms: 0,
    area_m2: 250.0,
    projectId: "12e3d498-742b-4e5f-8b1e-7e3ed6b23244",
    sectorName: "Manzana AP13",
    unitNumber: "Lote 12",
    status: "sold",
    description: "LOTE DE 246M2",
    visits: []
  },
  {
    id: "a334fcf8-9350-43b6-8e9d-c1d1df3b3956",
    companyId: 'c1',
    title: "Lote 13 \u2014 Manzana AP13",
    operation: 'sale',
    propertyType: 'Lote',
    price: 350000.0,
    currency: "ARS",
    city: "El Carmen",
    neighborhood: "EL CARMEN",
    bedrooms: 0,
    bathrooms: 0,
    area_m2: 250.0,
    projectId: "12e3d498-742b-4e5f-8b1e-7e3ed6b23244",
    sectorName: "Manzana AP13",
    unitNumber: "Lote 13",
    status: "sold",
    description: "LOTE DE 250 M2",
    visits: []
  },
  {
    id: "d28cd699-a381-4f1f-a3c4-1b3a453fb658",
    companyId: 'c1',
    title: "Lote 14 \u2014 Manzana AP13",
    operation: 'sale',
    propertyType: 'Lote',
    price: 182425.23,
    currency: "ARS",
    city: "El Carmen",
    neighborhood: "EL CARMEN",
    bedrooms: 0,
    bathrooms: 0,
    area_m2: 250.0,
    projectId: "12e3d498-742b-4e5f-8b1e-7e3ed6b23244",
    sectorName: "Manzana AP13",
    unitNumber: "Lote 14",
    status: "sold",
    description: "LOTE DE 250 M2",
    visits: []
  },
  {
    id: "702b4632-a1e6-4fbd-96b0-201ccfbbefa0",
    companyId: 'c1',
    title: "Lote 16 \u2014 Manzana AP13",
    operation: 'sale',
    propertyType: 'Lote',
    price: 217757.0,
    currency: "ARS",
    city: "El Carmen",
    neighborhood: "EL CARMEN",
    bedrooms: 0,
    bathrooms: 0,
    area_m2: 250.0,
    projectId: "12e3d498-742b-4e5f-8b1e-7e3ed6b23244",
    sectorName: "Manzana AP13",
    unitNumber: "Lote 16",
    status: "sold",
    description: "LOTE DE 250 M2",
    visits: []
  },
  {
    id: "80f0cd99-ba7b-4d37-a8f8-2bca64eb96d3",
    companyId: 'c1',
    title: "Lote 17 \u2014 Manzana AP13",
    operation: 'sale',
    propertyType: 'Lote',
    price: 217757.0,
    currency: "ARS",
    city: "El Carmen",
    neighborhood: "EL CARMEN",
    bedrooms: 0,
    bathrooms: 0,
    area_m2: 250.0,
    projectId: "12e3d498-742b-4e5f-8b1e-7e3ed6b23244",
    sectorName: "Manzana AP13",
    unitNumber: "Lote 17",
    status: "sold",
    description: "LOTE DE 250 M2",
    visits: []
  },
  {
    id: "0b4d1fb4-1f51-481c-ac18-208f2b063233",
    companyId: 'c1',
    title: "Lote 18 \u2014 Manzana AP13",
    operation: 'sale',
    propertyType: 'Lote',
    price: 18125.0,
    currency: "USD",
    city: "El Carmen",
    neighborhood: "EL CARMEN",
    bedrooms: 0,
    bathrooms: 0,
    area_m2: 250.0,
    projectId: "12e3d498-742b-4e5f-8b1e-7e3ed6b23244",
    sectorName: "Manzana AP13",
    unitNumber: "Lote 18",
    status: "sold",
    description: "LOTE DE: 411,60 M2",
    visits: []
  },
  {
    id: "273adfcd-7a55-4939-bdc3-665e35efbec0",
    companyId: 'c1',
    title: "Lote 2 \u2014 Manzana AP13",
    operation: 'sale',
    propertyType: 'Lote',
    price: 18125.0,
    currency: "USD",
    city: "El Carmen",
    neighborhood: "CARMEN",
    bedrooms: 0,
    bathrooms: 0,
    area_m2: 250.0,
    projectId: "12e3d498-742b-4e5f-8b1e-7e3ed6b23244",
    sectorName: "Manzana AP13",
    unitNumber: "Lote 2",
    status: "sold",
    description: "",
    visits: []
  },
  {
    id: "4eb16dbf-8cc9-4571-bbc1-6106b49817a2",
    companyId: 'c1',
    title: "Lote 3 \u2014 Manzana AP13",
    operation: 'sale',
    propertyType: 'Lote',
    price: 182990.65,
    currency: "ARS",
    city: "El Carmen",
    neighborhood: "EL CARMEN",
    bedrooms: 0,
    bathrooms: 0,
    area_m2: 250.0,
    projectId: "12e3d498-742b-4e5f-8b1e-7e3ed6b23244",
    sectorName: "Manzana AP13",
    unitNumber: "Lote 3",
    status: "sold",
    description: "LOTE DE 250M2",
    visits: []
  },
  {
    id: "35025eea-1c55-4908-be95-fd1d331b1654",
    companyId: 'c1',
    title: "Lote 5 \u2014 Manzana AP13",
    operation: 'sale',
    propertyType: 'Lote',
    price: 148890.43,
    currency: "ARS",
    city: "El Carmen",
    neighborhood: "EL CARMEN",
    bedrooms: 0,
    bathrooms: 0,
    area_m2: 250.0,
    projectId: "12e3d498-742b-4e5f-8b1e-7e3ed6b23244",
    sectorName: "Manzana AP13",
    unitNumber: "Lote 5",
    status: "sold",
    description: "LOTE DE 250M2",
    visits: []
  },
  {
    id: "e7b8a8b9-e62b-41a8-8221-162e05e549c6",
    companyId: 'c1',
    title: "Lote 6 \u2014 Manzana AP13",
    operation: 'sale',
    propertyType: 'Lote',
    price: 18125.0,
    currency: "USD",
    city: "El Carmen",
    neighborhood: "EL CARMEN",
    bedrooms: 0,
    bathrooms: 0,
    area_m2: 250.0,
    projectId: "12e3d498-742b-4e5f-8b1e-7e3ed6b23244",
    sectorName: "Manzana AP13",
    unitNumber: "Lote 6",
    status: "sold",
    description: "LOTE DE 250 M2",
    visits: []
  },
];



// Generar Leads realistas de Bellomo
const leadScenarios = [
  { name: "Esteban Benítez", origin: "WhatsApp", stage: "new" as const, phone: "+54 9 388 456-7890", email: "esteban.benitez@gmail.com", notes: "Ingresó por consulta de WhatsApp. Busca lote de 250m2 para construir vivienda familiar. Consulta por anticipo y 36 cuotas en pesos CAC.", agentId: "usr-sales" },
  { name: "Dra. Mariana Tolaba", origin: "Portal Inmobiliario", stage: "new" as const, phone: "", email: "mariana.tolaba@saludjujuy.com", notes: "Contactó por portal inmobiliario interesada en local comercial en PB para consultorio de kinesiología. Falta registrar teléfono celular.", agentId: "usr-sales-2" },
  { name: "Gonzalo Argañaraz", origin: "Instagram", stage: "contacted" as const, phone: "+54 9 388 512-3456", email: "gonzalo.arganaraz@hotmail.com", notes: "Primer llamado telefónico muy positivo. Vive en Palpalá y busca construir su primera vivienda en Loteo San Pablo 1.", agentId: "usr-sales" },
  { name: "Carlos & Viviana Pereyra", origin: "Referido", stage: "contacted" as const, phone: "+54 9 388 498-1122", email: "carlos.pereyra@empresa.com", notes: "Interesados en combo de lote en Valle Verde + cochera mensual en centro de Jujuy.", agentId: "usr-sales-2" },
  { name: "Arq. Jorge Bustos (Martín Fierro S.R.L.)", origin: "Web", stage: "contacted" as const, phone: "+54 9 388 421-9988", email: "jbustos@bustosarq.com.ar", notes: "Calificado financieramente. Disponen del 60% al contado y solicitan 12 cuotas fijas en dólares por 2 lotes contiguos.", agentId: "usr-sales" },
  { name: "Facundo Carrillo", origin: "Web", stage: "visiting" as const, phone: "+54 9 388 587-6543", email: "facundo.carrillo@outlook.com", notes: "Visita presencial coordinada para este sábado a las 10:30 hs en el pórtico de acceso de San Pablo 1.", agentId: "usr-sales" },
  { name: "Ing. Fernando Quispe", origin: "WhatsApp", stage: "visiting" as const, phone: "+54 9 388 405-2233", email: "fquispe@mineriajujuy.com", notes: "Visita técnica agendada para el viernes a las 16:00 hs para revisar potencia eléctrica y acometidas de gas en Local Comercial 1.", agentId: "usr-sales-2" },
  { name: "Romina Gutiérrez", origin: "Web", stage: "negotiation" as const, phone: "+54 9 388 477-8899", email: "romi.gutierrez@estudiocivil.com", notes: "Propuesta comercial enviada: entrega inicial del 35% y saldo en 24 cuotas ajustables por CAC. Pendiente firma de reserva.", agentId: "usr-sales" },
  { name: "Estudio Jurídico Morales & Asoc.", origin: "Referido", stage: "negotiation" as const, phone: "+54 9 388 423-0011", email: "secretaria@moralesabogados.com", notes: "Borrador de contrato de locación comercial por 36 meses en revisión legal con garantías propietarias presentadas.", agentId: "usr-sales-2" },
  { name: "Dr. Marcelo Iriarte", origin: "WhatsApp", stage: "closing" as const, phone: "+54 9 388 501-4455", email: "miriarte@clinicaperico.com.ar", notes: "Operación cerrada con éxito. Firma de boleto de compraventa y pago de anticipo completados en escribanía.", agentId: "usr-sales" },
];

const availableOrReservedProps = properties.filter(p => p.status === 'available' || p.status === 'reserved' || !p.status);
const unassignedProps = [...availableOrReservedProps];

export const leads: Lead[] = leadScenarios.map((sc, index) => {
  const stage = sc.stage;
  const agentId = sc.agentId;
  const leadId = `l${index + 1}`;
  const propertyIds: string[] = [];
  let projectId: string | undefined = undefined;
  
  // Asignar unidades a este lead asegurando que cubrimos el pool de unassignedProps
  if (unassignedProps.length > 0) {
    const toTake = Math.min(Math.floor(Math.random() * 2) + 1, unassignedProps.length);
    for (let i=0; i<toTake; i++) {
      const p = unassignedProps.pop()!;
      propertyIds.push(p.id);
      if (!projectId && p.projectId) projectId = p.projectId;
    }
  } else {
    const rndP = availableOrReservedProps[Math.floor(Math.random() * availableOrReservedProps.length)];
    propertyIds.push(rndP.id);
    if (rndP.projectId) projectId = rndP.projectId;
  }
  
  // Crear una visita para este lead si está en etapa 'visiting' o superior
  const visits: Visit[] = [];
  if (['visiting', 'negotiation', 'closing'].includes(stage)) {
    const v: Visit = {
      id: `v-${leadId}`,
      leadId,
      propertyId: propertyIds[0],
      leadName: sc.name,
      propertyTitle: properties.find(p => p.id === propertyIds[0])?.title,
      scheduledAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * ((index % 3) + 1)).toISOString(),
      status: stage === 'visiting' ? 'scheduled' : 'completed',
      agentId,
      phone: sc.phone,
      email: sc.email,
      notes: sc.notes,
    };
    visits.push(v);
    
    // Sincronizar visita en la propiedad
    const prop = properties.find(p => p.id === propertyIds[0]);
    if (prop) {
      if (!prop.visits) prop.visits = [];
      prop.visits.push(v);
    }
  }

  return {
    id: leadId,
    companyId: 'c1',
    name: sc.name,
    origin: sc.origin,
    propertyIds,
    projectId,
    stage,
    lastActivity: new Date(Date.now() - 1000 * 60 * 60 * (index + 1)).toISOString(),
    followUpUpdatedAt: index % 4 === 0
      ? undefined
      : new Date(Date.now() - 1000 * 60 * 60 * 24 * (
        index % 4 === 1 ? 4 : index % 4 === 2 ? 9 : 12
      )).toISOString(),
    phone: sc.phone,
    email: sc.email,
    notes: sc.notes,
    visits,
    agentId
  };
});

// Fallback: Si quedaron propiedades disponibles/reservadas sin asignar por la matemática, asignarlas al primer lead
if (unassignedProps.length > 0) {
  unassignedProps.forEach(p => {
    leads[0].propertyIds.push(p.id);
  });
}

const adminSample = { companies, projects, properties, leads };
export default adminSample; 
