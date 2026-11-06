# EVP-108 — Continuidad de herramientas y diagnóstico seguro de Gemini

## Seguimiento después del PR #104

Rama actual `ticket/EVP-108-gemini-finalizacion`, basada en `develop` actualizado `14f5c77`.

La prueba real de staging no aprobó: `buscar_propiedades` terminó correctamente, pero la segunda respuesta de Gemini devolvió HTTP 200 / STOP con otra llamada de función desconocida, sin texto, cuando `allowTools=false`. Se rechazó correctamente con `INVALID_RESPONSE`. Reproducción: conversación ficticia `4fd350e5-3499-4753-a336-12eafd6cb8d9`; dos llamadas, con ledger y controles existentes. No se ejecutó la llamada desconocida.

Este seguimiento cambia únicamente la construcción de solicitudes de Gemini: se incluyen declaraciones solo cuando `allowTools=true`; la llamada final omite `tools` y `toolConfig`, conservando las llamadas históricas firmadas y los resultados correlacionados. La respuesta inesperada continúa rechazándose. Los demás proveedores no cambian.

**Es una hipótesis de mitigación, no una causa demostrada ni una solución validada en staging.** El contrato de Google indica que NONE ya impide llamadas; la implementación anterior no omitía ese control. Omitir declaraciones expresa la misma intención por otra vía. No se afirma que resolverá el comportamiento del proveedor hasta repetir el recorrido desplegado.

Verificación del seguimiento:
- RED: 11 pruebas, 66 aserciones; la nueva prueba falla porque el pedido final todavía incluye `tools`.
- GREEN: 67 pruebas, 168 aserciones (Gemini, OpenAI, OutputGuard y ContactConfirmation), PHP 8.4.24 sin red y sin credenciales reales.
- Pint: los dos archivos modificados pasan. Revisión independiente en snapshot externo: 67 pruebas, 168 aserciones; sin bloqueos.
- Pruebas específicas: pedido inicial conserva AUTO; final omite declaraciones y configuración; firmas e IDs se conservan; funciones conocidas y desconocidas en una respuesta final STOP siguen rechazándose.
- Evaluación nativa: medium / under_budget, sin nueva revisión adicional requerida.
- PHPStan nivel 6 sobre los dos archivos modificados: sin errores.

No se consumieron nuevas llamadas del proveedor durante este seguimiento local. La aceptación de inventario, confirmación de contacto y correo sigue pendiente de publicación y prueba autorizadas. La sección siguiente conserva la evidencia del PR #104 ya integrado.

Entrega anterior: rama `ticket/EVP-108-gemini-inventario` · base `5e19d6a` · fecha 2026-11-04.

## 1. Qué pedía el ticket

Investigar los errores `PROVIDER_ERROR` de Bellomito en staging al consultar inventario; corregir defectos demostrables del adaptador, conservar presupuesto, consentimiento y guardas, y dejar evidencia verificable. Producción y migraciones fuera de alcance.

## 2. Qué se implementó

- `everprop-api/app/Domain/AgentRuntime/Llm/GeminiChatClient.php`: conservar el ID original del proveedor en la respuesta de cada herramienta, usando el ID interno para emparejar llamadas. Si el proveedor no entregó un ID, no se inventa uno.
- Conservar las firmas opacas asociadas a bloques de texto durante la normalización y reconstrucción del historial. Las firmas de llamadas a herramientas ya se conservaban.
- Registrar errores HTTP con exactamente tres campos: `http_status`, `provider_status` de una lista cerrada o `null`, y `phase` (`initial` o `tool_continuation`, según presencia de resultados de herramientas en la solicitud). Sin claves, modelo configurable, mensajes crudos, encabezados, prompts, datos de clientes, firmas ni IDs.
- Pruebas en `everprop-api/tests/Feature/AgentRuntime/GeminiChatClientTest.php`: continuidad de firmas e IDs, herramientas repetidas y resultados reordenados, compatibilidad sin ID y diagnóstico con valores hostiles.
- No cambian clasificación de errores, reservas de presupuesto, reintentos, herramientas ni persistencia. Sin esquema ni variables nuevas.

## 3. Por qué esta solución

Se amplía el mapeo que el adaptador ya usaba para los nombres de herramientas; no se agrega otra capa ni dependencia. El coordinador conserva el contenido completo de la respuesta, por lo que no requiere modificación.

Referencias oficiales: [function calling de GenerateContent](https://ai.google.dev/gemini-api/docs/generate-content/function-calling), [firmas opacas](https://ai.google.dev/gemini-api/docs/generate-content/thought-signatures), [errores del proveedor](https://ai.google.dev/gemini-api/docs/generate-content/api-errors). La aplicación sigue usando `generateContent`; no se migra a Interactions.

La omisión del ID y la pérdida de firmas de texto son defectos reproducibles del contrato. **No prueban la causa de los HTTP 5xx observados en staging**: también se reportaron fallos antes de ejecutar herramientas. El diagnóstico agregado permitirá distinguir el estado HTTP y la fase cuando la corrección se publique.

## 4. Cómo se verificó

- `develop` actualizado mediante `git pull --ff-only origin develop`, de `eff75bd` a `5e19d6a`; worktree aislado desde esa base.
- PHP 8.4.24 en contenedor efímero con `--network none`, dependencias existentes de solo lectura y configuración sintética. Sin importar bases ni acceder a proveedores. El stack existente no se modifica.
- RED: PHPUnit del adaptador antes del parche: 8 pruebas, 50 aserciones; falla de firma de texto y diagnóstico ausente.
- GREEN inicial: 9 pruebas, 60 aserciones. Cubre también IDs exactos y ausencia de ID; excepciones y facturación conservan su comportamiento.
- Pint: 2 archivos pasan.
- PHPStan nivel 6 sobre los dos archivos modificados: sin errores. Se corrigió el tipado de la verificación del logger en el test sin cambiar comportamiento productivo.
- Suite pertinente final: GeminiChatClientTest, OpenAiChatClientTest, OutputGuardTest y ContactConfirmationTest: **65 pruebas, 159 aserciones, todas pasan**.
- Revisión independiente de seguridad/contrato en snapshot externo: sin bloqueos; ejecutó las mismas cuatro clases (65 pruebas, 156 aserciones antes del ajuste de tipado del test).
- Prueba diferencial externa contra `5e19d6a`: solicitud sin ID, respuesta y uso serializados idénticos; 1 prueba, 2 aserciones en cada versión. Ninguna prueba versionada consulta el historial de Git.
- Revisión adicional autorizada: seguridad y fiabilidad sin hallazgos; aprobación reconocida y cerrada para el candidato revisado. Esta nota posterior solo registra el resultado.

## 5. Pendientes y riesgos

- No afirmar incidente resuelto hasta observar en staging inventario, continuación posterior a herramienta y confirmación de contacto ficticio con correo exacto, incluyendo traza y estado HTTP si vuelve a fallar.
- Commit, publicación de rama y PR autorizados por el usuario. Merge y despliegue siguen pendientes de autorización. No se desplegó ni se consumió el proveedor real durante estas pruebas.
- `phase` describe la presencia de resultados de herramientas en la solicitud, no el número de intento. El ledger y la traza actuales siguen registrando llamadas y reintentos.
- No se ejecutó la suite completa con MySQL/Redis; las comprobaciones locales se concentran en el adaptador y sus límites. Staging y producción no quedan certificados por estas pruebas.

Risk: items 2 and 3 — diagnostics must preserve confidentiality and provider call continuity must preserve opaque metadata.
