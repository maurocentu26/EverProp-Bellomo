# Integración local

Base: Ramiro-Ruggeri/everprop-bellomo, commit eda68ba59db596c7ef9d41a92a41ffbbfc765acf (4 septiembre 2026). Verificado remoto 8 septiembre 2026.

Se conservan componentes y estilos de Rami. Los adaptadores OfficialCms y WebsiteProvider leen el contenido publicado del panel, sin duplicar la web. La propiedad official de WebsiteContent conserva el esquema editorial original. Los textos, imágenes y enlaces estáticos tienen claves CMS; los desarrollos y galerías se editan desde Contenido.

Las propiedades del inventario se muestran usando la tarjeta de Rami; las promociones se insertan después del inicio. Autorización, cookie de sesión, borrador, publicación y bloqueo por revisión siguen en el servidor de la demo. La integración permanece local y usa el chat de la demo con su catálogo publicado; no activa servicios externos.

Backups de datos de esta migración: work/website-before-rami.json. No volver a ejecutar la migración sobre contenido editado. Los originales de Rami permanecen en su repositorio.
