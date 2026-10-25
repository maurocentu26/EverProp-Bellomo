# EVP-77 — Rediseño vista Conocimiento IA

Rama `ticket/EVP-65-rediseno-visual` · sin commit por pedido del usuario · fecha 2026-10-25 · autor Codex.

## 1. Qué pedía el ticket

Rediseñar la ruta existente `/admin/conocimiento` con el estilo del panel: encabezado claro, documentos legibles a 17 px, estados en palabras, fechas es-AR, confirmaciones del panel y disposición de una columna en teléfono. Mantener permisos y contrato de API. No modificar ingestión, recuperación RAG, prompts ni contenido enviado al modelo.

El usuario confirmó que EVP-77 existe en Jira y está En curso y que EVP-76 fue revisado y aprobado (61bbb77). Solicitó no consultar Jira: no se verificó ni actualizó su estado. Se conserva la rama maestra solicitada como excepción explícita al flujo de rama por ticket. El módulo solo puede integrarse a develop, nunca a main.

## 2. Qué se implementó

- `everprop-public/src/components/admin/assistant/KnowledgeManager.tsx`: encabezado, acción principal para escritores, formulario desplegable, tarjetas con estado e icono, versión, fecha de actualización, audiencia y vigencia. Contenido mediante hijos de texto de React, sin interpretación HTML. Estados de carga, error con reintento y vacío. Singular/plural para el contador. Un enlace Atrás para administradores; para asesores se reutiliza el del layout.
- Confirmación con Dialog existente del panel para guardar un borrador, publicar y archivar. Incluye título y datos disponibles del documento; el contenido se consulta desde un desplegable. Permite cancelar y bloquea envíos repetidos mientras guarda. El formulario de creación confirma título, texto, audiencia y vigencia.
- Se conserva exactamente WRITERS y canWrite. READ_ONLY y SALES_ADVISOR no tienen formulario, botones de escritura ni diálogo de confirmación. La ejecución también verifica canWrite.
- `everprop-public/src/data/knowledge-sample.ts`: cuatro documentos ficticios con estados variados y temas realistas. Solo se seleccionan con isMockDataMode; las operaciones mock permanecen en memoria y no llaman a la API. Actualizar vuelve a cargar las muestras originales; no hay persistencia mock.
- `everprop-public/src/app/admin-design.css`: estilos knowledge-* alineados con inventory-*, projects-* y stats-*, columnas adaptables, contenido que puede partirse y controles de ancho completo en teléfono. No se añadieron rutas.
- `everprop-public/tests/knowledge-redesign.test.mjs`: pruebas ejecutables con node:test y transpilación TypeScript siguiendo el estilo de Estadísticas.

No se modificaron endpoints, roles, API, esquema, variables de entorno, backend ni proveedores. Archivar conserva la operación revoke existente y explica que el asistente deja de usar el documento. No se ofrecen borrar o reemplazar: el contrato actual no proporciona esas operaciones.

## 3. Por qué esta solución

Se reutilizan KnowledgeDocument, las cuatro funciones existentes de API, el hook de sesión, Dialog del panel, Lucide y los tokens de diseño. Las referencias PC y teléfono se consultaron; la PC propone archivos PDF, subida y métricas que no están disponibles en esta API. No se simulan esas capacidades con datos reales.

### Lo que la API no informa

El contrato de listado devuelve id, title, audience, status, version, valid_until, approved_at y updated_at. No entrega cuerpo del documento, formato/tipo de archivo, proyecto o tema asociado, autor, nombre de archivo, cantidad de páginas, historial de versiones ni capacidades de borrar/reemplazar/subir archivos. En datos reales, tipo y proyecto/tema muestran «Sin informar»; el contenido explica que no está disponible desde el panel. No se deduce el proyecto a partir del título ni se inventan datos. Las muestras sí incluyen texto, tipo y tema, exclusivamente para mock. Los identificadores internos nunca se muestran.

La publicación conserva las reglas actuales del servidor; el panel informa la vigencia, no modifica cómo el asistente selecciona información.

## 4. Cómo se verificó

- `npm run lint`: terminó con 0 errores y 122 advertencias del proyecto. El archivo KnowledgeManager presenta una advertencia react-hooks/set-state-in-effect por el patrón de carga en el efecto; no se deshabilitó la regla.
- `npx tsc --noEmit`: finalizó con código 0.
- `node --test --test-isolation=none tests/knowledge-redesign.test.mjs tests/stats-redesign.test.mjs`: 13/13 pruebas aprobadas, incluidas las 6 de EVP-77. Cubren muestras sin llamadas API, roles, publicar/archivar con confirmación y cancelar, creación confirmada, texto literal con etiquetas HTML, estados vacíos/error, fechas, contador y reglas CSS móviles.
- `node --test --test-isolation=none tests/*.test.mjs`: en la ejecución antes de agregar el sexto test de EVP-77, 148/154 aprobaron. Las seis fallas pertenecen a notifications-worker.test.mjs, por navigator no definido en su contexto de pruebas (clearAppBadge/setAppBadge). Se reprodujeron ejecutando ese archivo solo; sus archivos no se modificaron. No se presenta la suite completa como aprobada.
- Se usó --test-isolation=none porque el ejecutor aislado de Node falló con spawn EPERM en este entorno.
- Detector de diseño: solo informó tres advertencias de gris sobre violeta en la línea 130 preexistente del CSS compartido, fuera de los estilos nuevos.
- No se ejecutó build por instrucción. No se inició Docker. No se validó en navegador: 375 px, foco real del diálogo, contraste calculado y ausencia de scroll horizontal quedan pendientes de comprobación visual; la evidencia actual es de estructura React y reglas CSS, no de una captura renderizada.
- No se hicieron revisiones especializadas de backend/LLM: no se tocaron esas capas.

## 5. Pendientes y riesgos

- El contenido real y la asociación proyecto/tema necesitan soporte de API para poder mostrarse; no se incorporaron endpoints ni inferencias.
- Falta verificación visual en navegador PC y teléfono de 375 px y una prueba contra el entorno autenticado real. No se desplegó ni se configuró staging.
- Las muestras son efímeras; Actualizar restaura sus valores originales. No afectan datos reales ni el modelo.
- Quedan las seis fallas ajenas de notificaciones y las advertencias de lint informadas.
- Sin commit, push, PR, merge ni cambio de estado Jira, conforme al pedido. Ningún cambio para main.
- Si se propone producción en el futuro, antes deben verificarse forwards SQL pendientes contra schema_versions, dominios definitivos, CORS/R2, hosts/Sanctum/cookies y tenant_domains, credenciales y permisos de proveedores, base de datos y storage. Este trabajo no valida accesos de producción.
