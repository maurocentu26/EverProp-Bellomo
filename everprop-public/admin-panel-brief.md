
---

# 🏗️ Especificaciones Técnicas: EverProp Admin Panel

**Producto:** EverProp by EverSys Solutions  
**Versión:** 1.0 (MVP SaaS)  
<!-- **Responsable UI/UX:** Centu   -->

---

## 1. Módulo: Autenticación y Multi-tenancy
*Ningún dato se muestra si no está filtrado por `company_id`.*

| Campo | Tipo | Comportamiento |
| :--- | :--- | :--- |
| **Email** | Input (Email) | Validación de formato y existencia. |
| **Password** | Input (Password) | Mínimo 8 caracteres, encriptación en backend. |
| **Company Selector** | Dropdown | Solo visible para SuperAdmins (EverSys). Para usuarios normales, el `company_id` se asume del perfil. |
| **User Role** | Label/Badge | Admin, Agente o Visualizador. |

---

## 2. Módulo: Dashboard (Vista General)
*Objetivo: Resumen ejecutivo del estado de la inmobiliaria.*

*   **Indicadores (Cards):**
    *   Total Propiedades Activas.
    *   Leads nuevos (últimas 24h).
    *   Visitas programadas para hoy.
    *   Valor total del inventario (Venta).
*   **Gráfico de Embudo:** Visualización del estado del Pipeline de Leads.
*   **Actividad Reciente:** Feed de las últimas acciones (ej: "Ramiro cargó una nueva propiedad en Palermo").

---

## 3. Módulo: Gestión de Propiedades (Inventario)
*El módulo más denso. Requiere carga dividida en pasos (Stepper).*

### A. Información Básica
| Campo | Tipo | Detalle / Comportamiento |
| :--- | :--- | :--- |
| **Título** | Text | Ej: "Departamento 3 Ambientes con Cochera". |
| **Descripción** | Textarea | Soporte para formato enriquecido (Bold, listas). |
| **Tipo de Operación** | Select | Venta / Alquiler / Alquiler Temporal. |
| **Tipo de Propiedad** | Select | Departamento / Casa / PH / Local / Terreno / Oficina. |
| **Precio** | Number | Soporte para decimales. |
| **Moneda** | Toggle | USD / ARS. |

### B. Ubicación
| Campo | Tipo | Detalle / Comportamiento |
| :--- | :--- | :--- |
| **Dirección** | Text | Calle y número. |
| **Piso / Depto** | Text | Opcional. |
| **Barrio / Zona** | Select/Search | Autocompletado basado en base de datos de zonas. |
| **Ciudad / Provincia** | Select | Jerárquico. |
| **Mapa (Geolocalización)** | Mapa Interactivo | Pin draggeable para obtener Latitud/Longitud. |

### C. Características Técnicas
| Campo | Tipo | Detalle / Comportamiento |
| :--- | :--- | :--- |
| **Superficie Total** | Number | En m². |
| **Superficie Cubierta** | Number | En m². Debe ser $\le$ que Total. |
| **Ambientes** | Counter | 1 a 10+. |
| **Dormitorios** | Counter | 1 a 10+. |
| **Baños** | Counter | 1 a 5+. |
| **Cocheras** | Counter | 0 a 5+. |
| **Antigüedad** | Number | Años o "A estrenar". |
| **Expensas** | Number | Monto mensual estimado. |
| **Amenities** | Checkboxes | Pileta, Parrilla, Gimnasio, SUM, Seguridad, etc. |

### D. Media (Multimedia)
*   **Gestor de Imágenes:** Drag & Drop. Permitir reordenar fotos (la primera es la portada).
*   **Video:** Input de URL (YouTube/Vimeo).
*   **Tour 360:** Input de URL externa (Matterport u otros).

---

## 4. Módulo: CRM & Leads (Pipeline)
*Gestión comercial de interesados.*

### Etapas del Pipeline (Columnas Kanban)
1.  **Nuevo:** Lead entrante sin procesar.
2.  **Contactado:** Primer contacto realizado.
3.  **Visita Programada:** Cita confirmada en la propiedad.
4.  **Negociación:** Oferta presentada o reserva.
5.  **Cierre:** Ganado (Vendido/Alquilado) o Perdido (Desestimado).

### Ficha del Lead (Card)
| Campo | Tipo | Comportamiento |
| :--- | :--- | :--- |
| **Nombre del Cliente** | Text | Link a la ficha de "Contactos". |
| **Propiedad de Interés** | Link | Acceso rápido a la propiedad consultada. |
| **Origen** | Badge | Web Propia, WhatsApp, Zonaprop, Argenprop, etc. |
| **Última Actividad** | Time-ago | Ej: "Hace 2 horas". |
| **Botón WhatsApp** | Action | Abre chat directo con mensaje predefinido. |

---

## 5. Módulo: Agenda de Visitas
*Calendario operativo.*

*   **Campos de Evento:** Propiedad, Cliente, Agente asignado, Fecha y Hora.
*   **Comportamiento:**
    *   Sincronización con Google Calendar (V3).
    *   Recordatorios automáticos por mail/WhatsApp al cliente 2 horas antes (V2).

---

## 6. Módulo: Configuración de Inmobiliaria (SaaS Settings)
*Aquí el cliente personaliza su instancia de EverProp.*

*   **Perfil de Empresa:** Nombre legal, CUIT, Logo (PNG/SVG), Dirección física.
*   **Redes Sociales:** Links a Instagram, Facebook, LinkedIn.
*   **Web Pública:**
    *   Subdominio (ej: `grow.everprop.com`).
    *   Color Primario (Selector de color para que la web pública use sus colores).
*   **Integraciones:** Token de API para portales externos.

---

## ✅ Reglas de QA Visual

1.  **Empty States:** Si no hay propiedades cargadas, mostrar un diseño ilustrado con el botón "Cargar mi primera propiedad".
2.  **Validación de Formularios:** Los campos obligatorios deben marcarse en rojo con el error específico enviado por la API de Ramiro.
3.  **Mobile Readiness:** El agente debe poder cargar un lead o ver su agenda desde el celular mientras está en una visita.
4.  **Optimización de Carga:** Uso de *Skeletons* para las tablas de propiedades mientras la API responde.

---