# Material Bellomo

Integración en las pantallas existentes: portadas en Proyectos y Desarrollos; identidad, galería, ubicación y documentos dentro de cada proyecto. Se retiró la biblioteca independiente y sus accesos del menú. La antigua URL redirige a Proyectos. Los recursos del Drive no crean nuevos desarrollos operativos.

Selección incorporada el 14/09/2026 desde [Material Bellomo](https://drive.google.com/drive/folders/1CCyZHMuyPYaO3WOXdkso3PK2S4OVyevo).

El catálogo contiene 54 recursos de 14 desarrollos: logos, una selección de fotos representativas, renders, fichas y documentación técnica, más el PDF de logotipos institucionales. `catalog.json` conserva el origen de cada pieza. La revisión del Drive incluyó los índices de 27 ZIP (2.435 entradas); no constituye una revisión visual individual de todas esas entradas. No se importa el archivo completo ni se crean unidades, precios o desarrollos operativos a partir de piezas publicitarias.

## Identidad y preparación

- Logo institucional original y símbolo en `public/brand/bellomo`, recortando únicamente el espacio del lienzo. Tipografía Avenir Next LT Pro Regular/Bold suministrada en el Drive, incorporada localmente. Colores principales del manual: `#00375C` y `#446AA7`.
- La mención de 50 años es texto independiente. No se encontró una pieza gráfica oficial de aniversario: el ZIP identificado como 50 años contiene fotografías del evento. No se creó un logo sustituto.
- Fotos y renders optimizados a WebP, máximo 1440 × 1080 sin ampliar originales. Los renders de Arbolada 2, Quintas y Huasi VII están identificados; la planta de Huasi VII se clasifica como documentación técnica.
- Documentos conservados como referencias, sin convertir condiciones comerciales antiguas en ofertas vigentes. Se excluyeron originales marcados para corregir de Santa Emilia, San Pablo y Quintas y las placas cuya propia carpeta advierte errores. Se excluyó `ESTE ARCHIVO.pdf`, cuyo contenido corresponde a EverSys.
- Las fichas PDF de Los Arenales, La Arbolada 2 y El Arrabal no se incorporaron porque no se obtuvo una descarga verificable. Sus otros recursos disponibles siguen en el catálogo.

## Acceso

Los archivos operativos permanecen fuera de `public`. Ambas rutas `/api/bellomo/materials` y `/api/bellomo/assets/[id]` verifican la sesión vigente contra la API de EverProp. Descargas y vistas previas tienen la misma autorización y `private, no-store`.

| Perfil API | Alcance |
| --- | --- |
| TENANT_ADMIN / SUPER_ADMIN de Bellomo | Catálogo completo, originales institucionales y pendientes de revisión |
| SALES_MANAGER / SALES_ADVISOR / READ_ONLY de Bellomo | Recursos de los proyectos que devuelve la API para esa cuenta |
| INVENTORY_MANAGER de Bellomo | Mismo alcance por proyectos, excluyendo fichas comerciales |
| Sin sesión, otra empresa o rol no admitido | Sin acceso |

El cruce usa alias explícitos, con normalización de tildes y espacios. No se mezclan etapas por coincidencia parcial. Agregar o renombrar un desarrollo exige revisar sus alias. La API de proyectos sigue siendo la autoridad para disponibilidad, asignaciones y datos operativos. No se decide el rol por el nombre o correo del usuario.

## Validación

Desde `everprop-public`, ejecutar `npm run test:materials` para probar límites entre empresas, alcance por proyecto y rol, aislamiento de etapas e integridad/procedencia del catálogo. También se verificaron TypeScript, lint de los archivos modificados, sesiones locales de administración/gerencia/dos asesores, bloqueo de descargas directas no autorizadas y galería/filtros en navegador.

El perfil INVENTORY_MANAGER se cubrió con pruebas de política: la cuenta local Sofía tiene realmente SALES_MANAGER. No se alteraron cuentas para simular roles. `outputFileTracingIncludes` incluye los archivos privados en el paquete de la ruta para despliegues de Next.js. No se publicó ni se modificó la rama main.
