# EverProp — Monorepo (Bellomo CRM & Real Estate Management)

Monorepo integral para la plataforma inmobiliaria y CRM de **Bellomo**:
* **`everprop-api/`**: Backend API REST multitenant construido sobre Laravel 12/13, PHP 8.4, MySQL 8 y Redis.
* **`everprop-public/`**: Frontend SPA y panel de control web administrativo construido con Next.js 16 (App Router), TypeScript y Tailwind CSS.

---

## Estructura del Monorepo

```tree
everprop/
├── everprop-api/        # Backend API (Laravel / PHP / MySQL)
│   ├── app/             # Dominios de negocio (CRM, Inventory, Identity, Tenancy)
│   ├── config/          # Configuraciones (cors, sanctum, session, database)
│   ├── database/        # Migraciones, esquemas baseline y seeders de prueba
│   └── routes/          # Rutas REST de la API
│
└── everprop-public/     # Frontend Web Admin (Next.js / TypeScript)
    ├── src/
    │   ├── app/         # Páginas y rutas Next.js App Router (/admin, /login, etc.)
    │   ├── components/  # Componentes UI reutilizables (Kanban, Drawers, Modals)
    │   ├── lib/         # Cliente HTTP de la API EverProp y utilidades
    │   └── data/        # Datos muestra para modo demo / pruebas aisladas
    └── public/          # Assets estáticos
```

---

## Despliegue en Producción

### 1. Backend en Railway
* **Repositorio:** Este mismo monorepo.
* **Root Directory en Railway:** `/everprop-api`
* **Start Command:** `php artisan serve --host=0.0.0.0 --port=$PORT`
* **Base de Datos:** Servicio administrado MySQL provisionado en Railway.

### 2. Frontend en Vercel
* **Repositorio:** Este mismo monorepo.
* **Root Directory en Vercel:** `everprop-public`
* **Framework Preset:** Next.js
* **Variables de Entorno:**
  * `NEXT_PUBLIC_EVERPROP_API_URL`: URL del backend en Railway
  * `NEXT_PUBLIC_API_URL`: URL del backend en Railway
  * `NEXT_PUBLIC_EVERPROP_TENANT`: `bellomo`
  * `NEXT_PUBLIC_DATA_MODE`: `api`
