# Guion — Presentación del MVP de EverProp

**Duración sugerida:** 3–4 minutos
**Tono:** profesional, cercano, demostrativo
**Objetivo:** explicar qué hace el MVP, mostrar flujo clave (leads, propiedades, agendar visitas, calendario) y destacar próximos pasos / features.

---

## 0) Apertura (0:00–0:15)
**Visual:** Logo de EverProp + pantalla del dashboard (suave zoom in).
**Voz en off:**
- "Hola — esto es EverProp. Una demo rápida del MVP para gestionar leads, propiedades y visitas en una inmobiliaria."

**Texto en pantalla:** "EverProp — MVP"

---

## 1) Problema que resolvemos (0:15–0:30)
**Visual:** pantalla partida mostrando caos (hojas, excel) → transición al dashboard limpio.
**Voz en off:**
- "Muchas inmobiliarias pierden oportunidades por falta de seguimiento centralizado: contactos dispersos, visitas mal agendadas y poca visibilidad del pipeline. EverProp organiza todo eso en un solo lugar."

**Bullet en pantalla:** "Contactos • Propiedades • Agenda"

---

## 2) Dashboard y navegación (0:30–0:55)
**Visual:** Recorrido por la sección Admin → mostrar métricas, tarjetas, resumen mensual de agenda.
**Acción:** mover el cursor por los elementos: métricas, buscar, sección de leads/properties, resumen de agenda.
**Voz en off:**
- "El dashboard ofrece una vista rápida: métricas principales, búsqueda rápida y un resumen compacto de la agenda del mes con accesos a 'Ver todos' y 'Ver calendario'."

**Mostrar:** hacer click en "Ver todos los leads".

---

## 3) Leads — creación y persistencia (0:55–1:25)
**Visual:** abrir Leads → click "Agregar nuevo lead" → formulario `NewLeadForm`.
**Acción:** completar nombre, origen, email/phone, elegir propiedad (opcional), enviar. Mostrar modal de éxito y toast.
**Voz en off:**
- "Crear un lead es simple: completás los datos, lo vinculás a una propiedad si corresponde, y el contacto se guarda localmente. Mostramos confirmación inmediata para asegurar que la operación fue exitosa."

**Hacer énfasis:** validación de campos, mensajes de error y modal de éxito.

**Mostrar:** listado de leads con el lead recién creado.

---

## 4) Propiedades — creación y lista (1:25–1:50)
**Visual:** ir a Propiedades → "Nueva propiedad" → `NewPropertyForm`.
**Acción:** completar fields (título, operación, tipo, precio, ubicación), guardar.
**Voz en off:**
- "Las propiedades también se crean desde el panel y quedan persistidas. Las tarjetas muestran la información clave y enlazan a la vista detallada."

**Mostrar:** click a una `PropertyCard` → abrir `PropertyDetailView`.

---

## 5) Agendar visita desde la propiedad (1:50–2:15)
**Visual:** en `PropertyDetailView` mostrar la sección "Agenda de visitas" (`VisitManager`).
**Acción:** click en campo "Visitante" → usar autocomplete con leads existentes → seleccionar lead (prefill teléfono/email) → elegir fecha/hora → Agendar → mostrar visita añadida en la lista y toast.
**Voz en off:**
- "Al agendar desde la propiedad, el campo 'Visitante' autocompleta con leads existentes; al seleccionar uno se rellenan teléfono y email. La visita se guarda tanto en la propiedad como en el lead asociado."

**Mostrar:** visitas listadas debajo y botón "Eliminar".

---

## 6) Detalle del lead y agendado desde el lead (2:15–2:35)
**Visual:** abrir `LeadDetailView` → `VisitManager` con `defaultGuestName`.
**Acción:** agendar visita desde el lead; la visita se agrega también a la propiedad (si está asociada).
**Voz en off:**
- "También podés agendar desde la ficha del lead; la visita queda sincronizada con la propiedad asociada cuando corresponda."

---

## 7) Calendario y agenda (2:35–2:55)
**Visual:** abrir `Agenda` (vista de calendario `CalendarAgenda`).
**Acción:** mostrar mes, filas de días, eventos del día; click en un día → lista de eventos del día con hora, teléfono, email. Mostrar eliminar con confirmación modal y toast.
**Voz en off:**
- "La Agenda muestra un calendario visual con eventos por día. Al hacer click en un día ves las visitas programadas, teléfono y email, y podés eliminar una cita con confirmación y notificación."

---

## 8) Búsqueda y filtros (2:55–3:05)
**Visual:** probar búsqueda en la barra superior -> filtrar por nombre/propiedad.
**Voz en off:**
- "El buscador permite filtrar rápidamente leads y propiedades desde cualquier pantalla."

---

## 9) Resumen final y llamadas a la acción (3:05–3:20)
**Visual:** volver al dashboard con resaltado de flujo (lead → propiedad → visita → calendario).
**Voz en off:**
- "En resumen: EverProp organiza contactos, propiedades y visitas en un flujo simple y rápido. Es ideal para pequeñas y medianas inmobiliarias que quieren centralizar operaciones sin complejidad."

**Texto en pantalla:** "Probar el MVP — Feedback bienvenido"

---

## 10) Funcionalidades sugeridas para producto final (mención rápida) (3:20–3:45)
**Voz en off (lista rápida, ritmo dinámico):**
- "Funcionalidades por agregar en próximas versiones:"
  - "Autenticación multi-usuario y roles (agentes, admins)."
  - "Sincronización con Google Calendar / Outlook (invitaciones y recordatorios automáticos)."
  - "Notificaciones por email y SMS para recordatorios de visitas y confirmaciones."
  - "Back-end persistente (API + base de datos) con multi-empresa y export/import CSV."
  - "Integración con portales (publicación automática de propiedades) y webhook para leads entrantes."
  - "Agenda colaborativa con arrastrar y soltar (reschedule), bloqueo de horarios y detección de conflictos."
  - "Historial y auditoría de cambios, permisos por equipo y roles."
  - "Reportes y analytics: tasa de conversión por origen, visitas por propiedad, pipeline health."
  - "App móvil/ PWA con notificaciones push y experiencia offline limitada."
  - "Mejoras UX: búsqueda fuzzy, filtros avanzados, templates de email/Whatsapp."

**Mostrar:** íconos pequeños junto a cada item.

---

## 11) Cierre (3:45–4:00)
**Visual:** logo + link a demo / repo / contacto (o CTA).
**Voz en off:**
- "Si querés que armemos una prueba de concepto para tu agencia, escribinos. Gracias — y probá EverProp."

**Pantalla final:** "EverProp — MVP. Contacto / Demo"

---

# Notas de producción (breves)
- Ritmo: mantener video compacto; cada escena 10–25 segundos.
- En las demos en pantalla, usar resaltadores/rectángulos para guiar la mirada hacia el botón/campo que se usa.
- Grabar el audio con pausas breves entre frases para permitir cortes y subtítulos.
- Incluir subtítulos en castellano y versiones en inglés si es necesario.

---

# Guía de voz (líneas para leer)
- Introducción: "Hola — esto es EverProp. Una demo rápida del MVP para gestionar leads, propiedades y visitas en una inmobiliaria."
- Problema: "Muchas inmobiliarias pierden oportunidades por falta de seguimiento centralizado..."
- Dashboard: "El dashboard ofrece una vista rápida..."
- Leads: "Crear un lead es simple..."
- Propiedades: "Las propiedades se crean desde el panel..."
- Agendar: "Al agendar desde la propiedad, el campo 'Visitante' autocompleta con leads existentes..."
- Calendario: "La Agenda muestra un calendario visual..."
- Cierre: "Si querés que armemos una prueba de concepto para tu agencia, escribinos."

---

# Versiones adicionales (opcional)
Si querés, puedo generar:
- Versión condensada para video de 60–90 segundos.
- Guion en inglés.
- Guion con marcas de tiempo y cues de cámara más detalladas.

---

*Archivo generado automáticamente por el asistente de desarrollo.*
