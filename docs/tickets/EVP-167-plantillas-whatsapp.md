# EVP-167: 10 plantillas rotativas para el WhatsApp a leads

Rama `hotfix/EVP-167-plantillas-whatsapp` desde `main` @ `26157de` · 2026-11-19 · Ramiro Ruggeri con Claude

## Problema
WhatsApp suspendía a los asesores: el botón de WhatsApp de cada lead armaba siempre el mismo texto ("Hola X, te escribo de Bellomo Inmobiliaria respecto a tu consulta… ¿Cómo estás?"), y el envío del mismo mensaje a muchos contactos se detecta como spam.

## Cambio
- `src/lib/lead-whatsapp-message.ts`: 10 redacciones distintas. Cada lead recibe una elegida de forma estable por su id (FNV-1a): el mismo lead ve siempre el mismo texto, y leads distintos se reparten entre las 10. Usa solo el primer nombre y, si existe, la propiedad consultada.
- Se usa en los 4 lugares que tenían el texto fijo: `LeadTable`, `LeadDetailView`, `AdvisorCockpit`, `AdminMonthBalanceWidget`.
- Los recordatorios de visita (agenda) no cambian: son mensajes a leads con cita, no envíos masivos.
- Sin cambios de backend, ni conexión a Meta.

## Verificación
- `tests/lead-whatsapp-message.test.mjs`: 3 pass (10 variantes distintas y usadas en 1.000 leads, más de 50 cada una; estable por lead; sin huecos ni "null" sin propiedad).
- `tsc --noEmit` sin errores; ESLint sin errores (solo warnings previos).

## Pendientes y recomendación
- Rotar el texto reduce la señal de spam, pero WhatsApp también mide volumen, ritmo y bloqueos/reportes. Recomendación a los asesores: personalizar el mensaje antes de enviar, espaciar los primeros contactos y no mandar decenas seguidas desde un número nuevo.
- Solución de fondo: WhatsApp Cloud API con plantillas aprobadas por Meta (módulo en `develop`, no va a `main`).
