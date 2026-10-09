import json

with open('src/data/admin-sample.ts', 'r', encoding='utf-8') as f:
    content = f.read()

new_projects = """  {
    id: "3e4b5c6d-7a8b-9c0d-1e2f-3a4b5c6d7e8f",
    companyId: 'c1',
    name: "Edificio Altos del Parque",
    type: "building",
    status: "under_construction",
    progress: 45,
    location: { city: "San Salvador de Jujuy", province: "Jujuy", address: "Av. Illia 123" },
    totalUnits: 15,
    description: "Departamentos de 1 y 2 dormitorios con excelentes amenities.",
    coverImage: "https://images.unsplash.com/photo-1545324418-cc1a3fa10c00?q=80&w=1200"
  },
  {
    id: "5f6a7b8c-9d0e-1f2a-3b4c-5d6e7f8a9b0c",
    companyId: 'c1',
    name: "Galería Comercial Norte",
    type: "commercial",
    status: "completed",
    progress: 100,
    location: { city: "San Salvador de Jujuy", province: "Jujuy", address: "Belgrano 456" },
    totalUnits: 8,
    description: "Locales comerciales en la mejor zona de Jujuy.",
    coverImage: "https://images.unsplash.com/photo-1519642918688-7e43b19245d8?q=80&w=1200"
  },
"""

content = content.replace("export const projects: Project[] = [", "export const projects: Project[] = [\n" + new_projects)

with open('src/data/admin-sample.ts', 'w', encoding='utf-8') as f:
    f.write(content)
