# EVP-166: los vendedores no ven los leads que les deriva el operador

Rama `hotfix/EVP-166-carga-contactos` desde `main` @ `26157de` · 2026-11-19 · Ramiro Ruggeri con Claude

## Reporte
Desde el 14/11 el operador carga y deriva leads a los vendedores, pero los vendedores dicen que no los reciben.

## Diagnóstico (producción, Railway `awake-dedication`, logs del 12/11 al 19/11, solo lectura)
- **Carga OK:** `POST /api/v1/admin/leads` siempre 201 (28 el 12/11, 89 el 13/11, 69 el 15/11, 28 el 17/11).
- **Derivación OK:** más de 170 `PUT /api/v1/admin/leads/{id}` (incluye el asesor asignado), todos 200.
- **Sin errores:** ni 4xx en esas rutas, ni 5xx, ni excepciones de PHP. El backend guarda el asesor y crea la notificación en la misma transacción.
- **Frontend publicado:** coincide con `main` (incluye EVP-123).

**Causa en el frontend:** la cola de trabajo del vendedor (`AdvisorCockpit` → `commercialQueueGroups`) ordenaba así:
1. vencidos, 2. vencen hoy, 3. nuevos sin contactar, 4. el resto;
y dentro de cada grupo **por UUID del lead (aleatorio)**, mostrando **5 filas** por defecto.

Un vendedor con leads vencidos acumulados veía 5 vencidos al azar. Los leads recién derivados quedaban siempre debajo de todos los vencidos, fuera de la vista. Del lado del operador todo estaba bien, y el vendedor "no recibía" nada.

## Cambio
- `src/lib/commercial-queue.ts`: un lead **nuevo y sin contacto** va primero (velocidad de primer contacto). Después van vencidos y vencen hoy. Dentro de cada grupo, **el más reciente primero** (antes era al azar).
- `src/lib/everprop-api.ts` y `src/data/admin-sample.ts`: el lead expone `createdAt` (API `created_at`).
- Sin cambios de backend ni de esquema.

## Verificación
- `tests/commercial-queue.test.mjs`: 12 pass. Test nuevo: con 40 vencidos, los 2 leads recién asignados quedan primero y en orden de llegada.
- Suite frontend completa: 60 pass, 0 fail. `tsc --noEmit` sin errores, ESLint sin errores.

## Pendientes
- **Confirmar con datos:** correr en la base de producción (solo lectura) la consulta por día, asesor y notificación, para descartar también leads sin asignar o asignados a usuarios inactivos. No se pudo: la sesión de Railway del navegador no tenía la cuenta de Mauro.
- **Después del deploy:** pedirle a un vendedor que abra su panel y confirme que ve primero los leads derivados hoy.
- **Prevención propuesta (otro ticket):** alerta al admin por "lead asignado sin contacto en 24 h" y validación al derivar a un usuario que no es vendedor activo.
