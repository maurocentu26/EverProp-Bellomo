---
name: corporate-design-system
description: >-
  Sistema y directrices de diseño corporativo profesional para EverProp. Usar
  esta skill siempre que el usuario solicite diseñar, maquetar, estructurar o
  refactorizar interfaces de usuario, componentes, dashboards, formularios,
  tablas, modales o vistas comerciales. Garantiza un estilo empresarial sobrio,
  sin degradados, sin emojis y con iconografía funcional estandarizada.
---

# Sistema de Diseño Corporativo — EverProp

Esta skill establece las normas de diseño visual, accesibilidad y experiencia de usuario (UI/UX) para todas las aplicaciones y módulos de **EverProp**. El objetivo es brindar una interfaz de clase empresarial (B2B SaaS / Enterprise Real Estate), seria, legible y de alta eficiencia operativa.

---

## 1. Reglas Fundamentales de Estilo

### A. Cero Degradados (No Gradients)
- **Prohibido:** No utilizar clases como `bg-gradient-to-*`, fondos radiales ni efectos de iluminación multicolor o difuminados decorativos.
- **Correcto:** Emplear colores sólidos y fondos neutros estructurados:
  - Fondos de página: `bg-slate-50` o `bg-slate-100`.
  - Superficies de tarjetas y contenedores: `bg-white`.
  - Paneles de alto contraste o encabezados institucionales: `bg-slate-900` o `bg-slate-950` sólidos con texto `text-white`.
  - Separaciones y fondos secundarios: `bg-slate-100` o `bg-slate-200/60`.

### B. Cero Emojis (No Emojis)
- **Prohibido:** No incluir emojis en ningún elemento de la interfaz (ni en títulos, botones, alertas, tabs, badges ni textos de ayuda).
- **Correcto:** La comunicación debe ser formal, clara y concisa. Si se requiere apoyo visual, utilizar exclusivamente iconos SVG vectoriales de la librería **Lucide React**.

### C. Iconografía Descriptiva y Funcional
- Usar iconos únicamente cuando aporten claridad semántica o aceleren la comprensión del usuario (ej: acciones de búsqueda, añadir elemento, teléfono, mensaje, calendario, estado de validación).
- **Librería:** `lucide-react`.
- **Dimensiones estándar:**
  - Acciones compactas / dentro de texto: `size-3.5` (14px) o `size-4` (16px).
  - Botones estándar y cabeceras: `size-4` o `size-5` (20px).
  - Contenedores destacados de métrica: `size-5` o `size-6` (24px) dentro de un contenedor `size-10` o `size-11` con esquinas redondeadas (`rounded-xl`).
- Los iconos interactivos sin texto visible deben contar obligatoriamente con atributos `aria-label` y `title` para accesibilidad.

---

## 2. Paleta de Colores Semántica (Tailwind CSS)

| Función | Fondo / Borde | Texto | Uso |
| :--- | :--- | :--- | :--- |
| **Neutro Base** | `bg-white`, `border-slate-200` | `text-slate-900`, `text-slate-600` | Fondo general, tarjetas, textos primarios y secundarios |
| **Acción Primaria** | `bg-blue-600 hover:bg-blue-700` | `text-white` | Botones de acción principal (CTA), enlaces destacados |
| **Acción Secundaria** | `bg-white border-slate-300 hover:bg-slate-50` | `text-slate-700` | Botones secundarios, filtros, cancelaciones |
| **Éxito / Venta / WhatsApp** | `bg-emerald-50 border-emerald-200` | `text-emerald-700` | Cierres de venta, confirmaciones, contacto WhatsApp |
| **Atención / Negociación** | `bg-amber-50 border-amber-200` | `text-amber-800` | Leads en negociación, citas próximas, alertas moderadas |
| **Urgencia / Vencido** | `bg-rose-50 border-rose-200` | `text-rose-700` | Contactos vencidos (>10 días), errores, acciones destructivas |
| **Proceso / Agenda** | `bg-purple-50 border-purple-200` | `text-purple-700` | Visitas agendadas, coordinación de citas comerciales |

---

## 3. Tipografía y Jerarquías

- **Encabezados Principales (H1):** `text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl`
- **Títulos de Sección (H2):** `text-lg font-bold text-slate-900 sm:text-xl`
- **Subtítulos y Contexto:** `text-sm text-slate-500 font-normal`
- **Etiquetas de Metadatos y Encabezados de Tabla:** `text-xs font-bold uppercase tracking-wider text-slate-400`
- **Valores Numéricos / Métricas Clave:** `text-2xl font-black text-slate-900 tracking-tight sm:text-3xl`
- **Límite de Legibilidad:** No utilizar tamaños inferiores a `11px` (`text-[11px]` o `text-xs`).

---

## 4. Componentes y Patrones de Interfaz

### Tarjetas y Contenedores (Cards)
```tsx
<section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
  <header className="flex items-center justify-between border-b border-slate-100 pb-4">
    <h2 className="text-base font-bold text-slate-900">Título del Módulo</h2>
  </header>
  <div className="mt-4">
    {/* Contenido */}
  </div>
</section>
```

### Botones
- **Primario:** `min-h-11 rounded-xl bg-blue-600 px-4 text-sm font-bold text-white hover:bg-blue-700 shadow-sm transition-colors focus-visible:ring-2 focus-visible:ring-blue-500`
- **Secundario / Outline:** `min-h-11 rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-colors`
- **Ghost:** `rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-800 transition-colors`

### Tablas de Datos
- Las filas deben tener padding confortable (`px-4 py-3.5`), separadores sutiles (`divide-y divide-slate-100`) y hover suave (`hover:bg-slate-50/60 transition-colors`).
- Estados de carga con placeholders pulso (`animate-pulse bg-slate-100 rounded-xl`).
- Estados vacíos siempre acompañados de icono Lucide sobrio y texto orientador.

---

## 5. Checklist de Verificación para el Agente
Antes de dar por finalizado cualquier trabajo de UI/diseño, verificar:
1. [ ] ¿Hay algún degradado (`bg-gradient-...`)? Reemplazarlo por color sólido.
2. [ ] ¿Hay algún emoji en el código o texto renderizado? Eliminarlo o reemplazarlo por un icono Lucide adecuado.
3. [ ] ¿Los contrastes de texto sobre fondo cumplen con la legibilidad adecuada (evitar texto gris claro sobre blanco)?
4. [ ] ¿Los botones y campos interactivos tienen estados de hover, focus y active limpios y accesibles?
