# EVP-69 — Etapas completas en móvil y tablet

27/10/2026 · Álvaro con Codex · rama `ticket/EVP-69-etapas-responsive`, desde develop `64ea4af` (PR84 integrado).

## Pedido

La captura del usuario muestra etapas recortadas en una fila desplazable. Mostrar las seis etapas completas sin desplazamiento horizontal, manteniendo lectura y filtros. Aviso previo en Jira comentario 10170, luego reasignación a Álvaro y estado En curso verificados. No se retoma el resto del rediseño de Ramiro ni se modifica PR82.

## Cambio

Solo `everprop-public/src/app/admin-design.css`: se conserva Grid con seis columnas en escritorio, tres hasta 1199px y dos hasta 767px. Se elimina la conversión a Flex con overflow horizontal y ancho mínimo de 160px. Las tarjetas pueden contraerse, sus etiquetas pueden saltar de línea y el padding baja de 18 a 12px, sin reducir la fuente. Sin cambios de lógica, API, datos, permisos, dependencias ni configuración.

## Verificación

- Navegador local mock: 320, 375, 390, 768, 1024 y 1440px, con fuente normal 17px y Grande 20.4px. Doce mediciones: seis tarjetas, sin desborde horizontal de grilla, etiquetas, botones ni página.
- Verificación visual de móvil 375px y tablet 768px con texto Grande: las seis etapas caben completas en tres y dos filas respectivamente. Contadores legibles; el salto vertical de la página sigue disponible.
- Clic en Nuevos y Contactados conserva los contadores y filtra a dos/tres leads ficticios, respectivamente.
- Suite frontend: 186/186 pruebas aprobadas. Build con webpack aprobado. `git diff --check` aprobado. Ajuste CSS reversible de bajo impacto validado en navegador; no se agregan pruebas artificiales del texto de CSS.
- Evidencias en `docs/tickets/evidence/EVP-69/`: capturas móvil/tablet y matriz JSON de medidas.
- Se detuvo el servidor de desarrollo propio. Se excluyó el cambio automático de Next a AGENTS.md. Sin Docker ni servicios externos nuevos.

## Límites y entrega

Álvaro autorizó expresamente commit, push y PR hacia develop y, si CI aprueba, merge y despliegue exclusivamente en staging el 27/10/2026. La verificación remota queda pendiente hasta que Railway active esta revisión. No se modificaron dominios, cookies, CORS, variables ni configuración de entorno.

Sin prueba en dispositivo físico, teclado táctil o lector de pantalla. Texto Grande no equivale a zoom de navegador 200%. La corrección evita desplazamiento horizontal de las etapas; no promete eliminar el desplazamiento vertical del panel completo. Este informe no certifica todo el alcance original de EVP69.
