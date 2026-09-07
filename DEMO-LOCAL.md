# Demo local: panel y web de Bellomito

Todo el código está en `trabajo/continuacion-everprop`. `bellomo-web-demo/` es una copia de la web encontrada en `Desktop/everprop-bellomo`, incorporada al mismo repositorio para mantener una sola branch. El proyecto del escritorio conserva sus archivos originales.

## Iniciar

Con Node instalado, ejecutar `./start-demo.ps1` desde PowerShell en la raíz. Si faltan dependencias, ejecutar `npm ci` dentro de `everprop-public` y `bellomo-web-demo`.

1. Abrir http://127.0.0.1:3001/login y elegir Marcos Bellomo en el acceso demo.
2. Entrar a Propiedades: http://127.0.0.1:3001/admin/properties.
3. Abrir http://127.0.0.1:3002/#catalogo-demo en otra pestaña.
4. Crear una propiedad usando Nueva Propiedad. Al guardar, se publica en la web.
5. Usar Ocultar / Publicar en la fila. La web consulta cambios cada dos segundos, sin recarga manual.
6. Preguntar a Bellomito por propiedades: responde usando solo las publicadas en el catálogo demo, sin clave de IA.

Las propiedades se guardan en `everprop-public/.demo-data/properties.json` y sobreviven al reinicio del servidor y al cierre del navegador. El archivo está ignorado por Git. El resto del CRM conserva el modo mock existente; esta integración conecta la lista de Propiedades y el formulario de alta, no todas las pantallas del ERP.

El catálogo público entrega solo campos comerciales. Los proyectos institucionales de la web siguen siendo contenido editorial; no son anuncios del inventario. El envío de consultas desde Bellomito está deshabilitado en esta demo y muestra un mensaje explícito. No hay conexión con producción, MySQL ni servicios de IA en este recorrido.

Los servidores escuchan únicamente en 127.0.0.1. Las rutas de catálogo requieren LOCAL_DEMO=1 y están deshabilitadas en producción. Para implementar una integración real se necesitará autenticación de administración y persistencia en el backend.

El script muestra los PID de los procesos y deja registros en `work/`. Para detenerlos, cerrar esos procesos Node. No iniciar otra instancia si los puertos ya están ocupados.
