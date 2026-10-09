# Staging S6: recorrido real del chat web (guion para la prueba)

Objetivo: probar en `bellomito-staging`, con navegador y servicios reales, que una conversación del chat web llega a la bandeja, que el asesor responde, y que el visitante ve la respuesta **una sola vez**, también si el worker se cae con una respuesta en cola. Es el único requisito de X04 que no depende de Meta (ver `meta-app-review.md`, sección 5).

## Límites

- Solo staging: API `https://api-staging-30f3d.up.railway.app` y panel `https://panel-staging-staging-62ec.up.railway.app`. Producción de Bellomo, `main` y Vercel quedan fuera.
- IA y WhatsApp siguen apagados. No cambiar `CONVERSATIONS_AI_ENABLED`, `AGENT_LLM_PROVIDER`, `META_SEND_ENABLED` ni `META_ONBOARDING_ENABLED`.
- Solo datos sintéticos: textos inventados y ningún nombre, teléfono ni email de una persona real.
- La base se consulta en modo lectura (solo `SELECT`). Si algo falla, **no se corrige a mano en la base**: se detiene la prueba y se reporta.
- Las credenciales del usuario de prueba no se escriben en la evidencia, el repo ni el chat.

## Preparación

| # | Qué | Cómo se comprueba |
|---|---|---|
| P1 | Los cuatro servicios (api, worker, scheduler, panel) corren el mismo commit de `develop` | Railway muestra ese commit en cada servicio |
| P2 | API sana | `/readyz` 200; `everprop:production-check --connections` todo OK en api y worker |
| P3 | Cola limpia | En el chequeo anterior, pendientes y fallidos en 0 |
| P4 | Usuario de prueba con rol admin o asesor del tenant `bellomito-staging` | Login en el panel de staging |
| P5 | Widget de staging `8f32042b-a9b8-4a74-91c0-40837d962910` | Abrir `https://panel-staging-staging-62ec.up.railway.app/widget/8f32042b-a9b8-4a74-91c0-40837d962910` en un navegador **sin la sesión del asesor** (es el visitante) |

El visitante y el asesor no pueden compartir almacenamiento del navegador. Cualquiera de estas opciones sirve: una ventana de incógnito, **otro navegador** (por ejemplo, Edge si el asesor usa Chrome), otro perfil del mismo navegador, o un celular. Dos pestañas del mismo navegador y perfil **no** sirven.

## Recorrido A: ida y vuelta

| # | Acción | Resultado esperado |
|---|---|---|
| A1 | Visitante: escribir "Hola, busco un lote en Bellomo [prueba S6-A]" | El mensaje aparece en su ventana |
| A2 | Asesor: Conversaciones → filtro "Esperan asesor" | Aparece la conversación con estado "Espera asesor" y la vista previa del mensaje (puede tardar hasta 8 s) |
| A3 | Abrirla | Se ve el mensaje del visitante. **No** aparece aviso de ventana de WhatsApp, porque es chat web |
| A4 | "Tomar control" | Aparece el campo de respuesta |
| A5 | Responder "Hola, te paso la info del lote [S6-A]" | Primero "En cola", después "Enviado" en pocos segundos |
| A6 | Visitante: esperar hasta 5 s | La respuesta aparece **una vez** |
| A7 | Visitante: recargar la ventana | La conversación sigue igual y la respuesta no se duplica |

## Recorrido B: worker caído con una respuesta en cola

| # | Acción | Resultado esperado |
|---|---|---|
| B1 | En Railway, detener el servicio `worker` (sin borrarlo ni tocar variables) | El worker queda detenido |
| B2 | Asesor, en la misma conversación: responder "Segunda respuesta [S6-B]" | Queda en "En cola" y **no** pasa a "Enviado" |
| B3 | Visitante | No ve la segunda respuesta |
| B4 | Volver a iniciar el `worker` | Arranca sano en los logs |
| B5 | Esperar hasta 2 min | La respuesta pasa a "Enviado" y el visitante la ve **una vez** |
| B6 | Visitante: escribir "Sigo acá [S6-B]" | El mensaje aparece en la bandeja después de la segunda respuesta, en orden |

## Recorrido C: búsqueda y nota interna

| # | Acción | Resultado esperado |
|---|---|---|
| C1 | Asesor: "Agregar nota interna" → "Nota de prueba S6-C, no la ve el cliente" → Guardar | Aparece "Nota interna de …" en el hilo |
| C2 | Visitante: esperar 10 s y recargar | **No** ve la nota |
| C3 | Asesor: en el listado, buscar "S6-C" | Aparece esta conversación |
| C4 | Buscar "S6-A" con el filtro "Todas" | Aparece esta conversación |
| C5 | Buscar "zzz-no-existe" | "Nada coincide con …" |

## Verificación en la base (solo lectura)

```sql
-- 1. Respuestas duplicadas: tiene que dar 0 filas.
SELECT m.conversation_id, m.text_body, COUNT(*) AS veces
FROM messages m JOIN tenants t ON t.id = m.tenant_id
WHERE t.slug = 'bellomito-staging' AND m.direction = 'OUTBOUND' AND m.text_body LIKE '%[S6-%'
GROUP BY m.conversation_id, m.text_body HAVING COUNT(*) > 1;

-- 2. Estado de los envíos de la prueba: solo SENT, ninguno FAILED / UNKNOWN / PROCESSING.
SELECT j.status, COUNT(*) AS jobs
FROM outbound_jobs j JOIN messages m ON m.id = j.message_id AND m.tenant_id = j.tenant_id
JOIN tenants t ON t.id = j.tenant_id
WHERE t.slug = 'bellomito-staging' AND m.text_body LIKE '%[S6-%'
GROUP BY j.status;

-- 3. La nota quedó interna y no generó ningún envío: 1 fila INTERNAL y 0 jobs.
SELECT m.direction, COUNT(DISTINCT m.id) AS mensajes, COUNT(j.id) AS jobs
FROM messages m JOIN tenants t ON t.id = m.tenant_id
LEFT JOIN outbound_jobs j ON j.message_id = m.id AND j.tenant_id = m.tenant_id
WHERE t.slug = 'bellomito-staging' AND m.text_body LIKE 'Nota de prueba S6-C%'
GROUP BY m.direction;
```

## Criterios de corte

Detener la prueba y reportar sin tocar nada más si pasa cualquiera de estas cosas:

- una respuesta aparece dos veces al visitante, o la consulta 1 devuelve filas;
- una respuesta sigue "En cola" más de 2 minutos con el worker corriendo;
- aparece "Envío sin confirmar" (`UNKNOWN`);
- la nota interna aparece en la ventana del visitante;
- errores 5xx en la API o excepciones en los logs del worker.

## Evidencia a registrar (en `staging-evidence.md`)

- Fecha y hora, y commit desplegado en cada servicio.
- Para cada paso (A1–A7, B1–B6, C1–C5): OK o falla, con una captura **sin datos de sesión ni credenciales**.
- El resultado de las tres consultas.
- Las líneas de log del worker al reiniciar en B4–B5 (sin tokens ni contenido de mensajes).
- Lo que no se pudo verificar y por qué.

S6 se marca verificado solo si todos los pasos dan OK y la consulta 1 da 0 filas. Esto no verifica WhatsApp ni Meta.
