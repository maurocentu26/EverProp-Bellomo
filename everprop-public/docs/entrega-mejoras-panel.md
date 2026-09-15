# Mejoras del panel Bellomo

Base de comparación: eeeefcc (8 de septiembre de 2026). Branch: codex/mejoras-panel.

## Cambios
- Cockpit de cuatro indicadores, consistencia de seguimiento y agenda, filtros comerciales y disciplina de contacto.
- Persistencia de visitas, control de acceso por tenant/perfil y notificaciones; eliminación de archivar solicitada.
- Identidad Bellomo/50 años, recursos de desarrollos, tema claro/oscuro y preferencias de texto por usuario.
- Ajustes responsive de listados, filtros, tarjetas, galerías, formularios y modales. Fecha/hora separadas conservando formato de API.
- Accesibilidad: etiquetas, estado seleccionado, orden de lectura y controles táctiles. Ajustes funcionales documentados en qa-panel-2026-09-14.md.

## Verificación final
- npm run build: aprobado.
- node --test tests/*.test.mjs: 32 aprobadas.
- Laravel en Docker/MySQL: 76 aprobadas, 384 assertions.
- Navegador: recorridos con Marcos, Sofía, Lucas y Valentina; tamaños móvil/tablet/escritorio y temas/tamaños de texto. La cobertura visual detallada y sus límites constan en el registro QA. No se garantiza ausencia absoluta de defectos ni revisión de cada combinación imaginable.

## Preparación del entorno
Los cambios de visitas y push requieren las extensiones forward y dependencias incluidas. Desde la raíz del repositorio, revisar `everprop-api/docs/integracion-panel.md` (orden de revisión, instalación, recuperación y aceptación), `everprop-api/docs/crm-cockpit-consistency.md` y `everprop-api/docs/web-push.md`. No se modifica el baseline SQL. No hay secretos ni configuraciones .env en este commit.

Push con aplicación cerrada todavía requiere configuración VAPID, HTTPS/worker y validación en teléfono físico. Subir esta branch no equivale a desplegar ni a certificar esa entrega. Se conserva el selector demo/API y las restricciones de roles existentes.

## Refuerzo posterior de entrega
- Verificador existente ampliado: `php artisan everprop:production-check --connections --webpush`. Detecta columnas/tablas pendientes, VAPID inválido y cola Push no asíncrona, sin mostrar secretos ni enviar mensajes.
- El instalador de visitas rechaza un esquema parcialmente extendido en vez de dar éxito incorrectamente.
- Nueva prueba MySQL: repetir ambas extensiones dos veces conserva los registros presentes. No equivale a ensayar la primera instalación en la base de producción.
- Nuevas pruebas Push: fallo temporal conserva la suscripción para reintento y notificación leída no se reenvía.
- Texto de citas aclarado en navegador; no se cambió ninguna clasificación ni regla comercial.
- Validación de esta tanda: suite API 77 pruebas/395 assertions antes de agregar dos casos Push; después, los cuatro casos Push pasan (23 assertions). Frontend: 32 pruebas y TypeScript aprobados. No se repitió build por el único cambio de texto.
- Datos QA: siguen en el entorno local; no se importan mediante Git. Su limpieza requiere comprobar identidades y relaciones según la guía; no se borraron datos por nombres ni prefijos.
