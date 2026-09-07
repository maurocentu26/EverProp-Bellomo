# Demo local: panel, web de Bellomo y Bellomito

Una sola web pública: Bellomo, con su asistente Bellomito. Un único catálogo, administrado desde el panel. Todo está en `trabajo/continuacion-everprop`, con los cambios de Mauro hasta el 6 de septiembre incorporados. La carpeta `bellomo-web-demo` conserva la base visual de la web encontrada en el escritorio; esa copia original no se modificó.

## Usar la demo

Ejecutar `./start-demo.ps1` desde PowerShell en la raíz. Si faltan dependencias, ejecutar `npm ci` en `everprop-public` y `bellomo-web-demo`.

- Panel: http://127.0.0.1:3001/login (elegir Marcos Bellomo).
- Administración central: http://127.0.0.1:3001/admin/web-publica.
- Web de Bellomo con Bellomito: http://127.0.0.1:3002/.

La pantalla existente **Propiedades → Nueva Unidad** sigue siendo el lugar para cargar casas, departamentos, lotes, locales y cocheras. Al guardar se publica la propiedad y aparece una confirmación con el botón **Ver propiedad en la web**. La generación de lotes en grupo también usa el catálogo compartido.

## Web pública: todo junto

- **Propiedades:** las mismas del formulario existente; editar datos y foto, vista previa, publicar/ocultar y abrir la propiedad exacta en la web. Estos cambios son inmediatos.
- **Secciones:** mostrar u ocultar portada, información institucional, catálogo, áreas comerciales, desarrollos, contacto, pie, menú, redes y elementos flotantes. Agregar secciones con texto, imagen y enlace.
- **Contenido:** editar, agregar, quitar, ordenar y ocultar diapositivas, desarrollos, áreas de construcción, categorías, cifras e ítems de navegación.
- **Textos:** editar los textos de títulos, botones y párrafos, con buscador.
- **Imágenes y enlaces:** logos, imágenes y enlaces externos. Las fotos de cada sección se editan también en Contenido. Se aceptan PNG, JPG y WebP de hasta 2 MB por archivo.
- **Contacto:** dirección, horarios, teléfonos y WhatsApp.
- **Bellomito:** visibilidad, nombre, saludo, subtítulo, preguntas sugeridas e información adicional. Consulta exclusivamente el catálogo publicado y los datos de contacto guardados.

Los cambios de contenido se guardan como **borrador**. **Vista previa** guarda el borrador y lo abre dentro del panel. **Publicar cambios** actualiza la web pública, que comprueba novedades cada dos segundos. **Descartar borrador** recupera la última versión publicada. Las propiedades se guardan directamente, independientemente de ese borrador.

## Persistencia y límites de la demo

`everprop-public/.demo-data/properties.json` guarda el catálogo y `website.json` guarda borrador y publicación. Sobreviven al cierre del navegador y al reinicio del servidor; están ignorados por Git. Las revisiones evitan sobrescribir cambios desde un editor que quedó abierto con una versión anterior.

Es una demo local: servidores enlazados a 127.0.0.1, sin modificar producción ni requerir MySQL o claves de IA. Las rutas de edición están deshabilitadas en producción. El envío de consultas comerciales permanece deshabilitado y lo indica al intentar enviar. El resto de las pantallas del ERP conserva su comportamiento mock; el catálogo de la web no representa una integración productiva de todos los módulos del CRM.

## Verificación

Con ambos servidores encendidos: `node scripts/check-cms.mjs`. Comprueba borrador, vista previa, publicación, ocultamiento de catálogo y asistente, validación de enlaces y protección frente a revisiones antiguas. Restaura el contenido que encontró al iniciar. Ejecutar sin editar simultáneamente durante la prueba.

También se verificó en el navegador la publicación de una propiedad, su ocultamiento y la vista previa/publicación de una sección. TypeScript pasa en ambas aplicaciones.

Los procesos y registros se muestran al ejecutar el script; los registros están en `work/`. No iniciar otra instancia si los puertos ya están ocupados.

## Roles y permisos en la demo local

- **Administración (Marcos):** agregar, editar, publicar y ocultar propiedades; editar, guardar borradores y publicar todo el contenido de la web y Bellomito.
- **Ingeniería (Sofía):** conserva `manage_inventory`: agregar, editar, publicar y ocultar propiedades. En Web pública solo accede a Propiedades; no modifica textos, secciones ni Bellomito.
- **Asesores (Lucas y Valentina):** consulta de propiedades, sin altas, modificaciones ni cambios de visibilidad.

El servidor comprueba cada operación con una sesión opaca en cookie HttpOnly, con vencimiento a las ocho horas y revocación al salir. Los permisos se obtienen de los perfiles definidos en el servidor; no se confía en roles enviados por el navegador ni en localStorage. La vista previa y los borradores requieren Administración, incluso accediendo desde la web pública. El catálogo publicado y el contenido publicado permanecen públicos.

El selector de perfiles sigue disponible deliberadamente para probar la demo: cualquier persona con acceso a esta computadora puede elegir un perfil. No reemplaza el ingreso con credenciales y permisos de la API real. Este control cubre el catálogo compartido y el editor web locales; los restantes módulos mock mantienen su comportamiento anterior. Las sesiones se guardan en `.demo-data/sessions.json`, ignorado por Git. Al actualizar desde la demo anterior hay que elegir el perfil nuevamente una vez.

Prueba de permisos: `node scripts/check-permissions.mjs`. Comprueba rechazos sin sesión y como asesor, inventario de Ingeniería, edición web y vista previa de Administración, intentos de falsificar roles/tokens y cierre de sesión. No agrega propiedades ni altera su visibilidad. `check-cms.mjs` inicia su propia sesión de Administración y la revoca al terminar.
