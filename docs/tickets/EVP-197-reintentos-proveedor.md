# EVP-197 — Reintentos seguros y capacidad del proveedor IA

## Resultado vigente v2 — 24/11/2026

**ABIERTO, sin aprobación de release.** 123 PASS automáticos, 77 FAIL (59 críticos), 29 DETERMINISTIC; 80 PASS críticos requieren revisión humana. 365 respuestas HTTP 200. Estimación USD 0.234873, no factura.

- [Todos los casos y clasificación](evidencias/EVP-197-v2-20261124.md).
- [Diagnóstico, cambios y pendientes](evidencias/EVP-197-v2-diagnostico-20261124.md).
- [Respuestas y causas registradas](evidencias/EVP-197-v2-20261124.json).

Esta rama incorpora el ajuste y diagnóstico del evaluador; 3 tests/51 aserciones aprobados en la revalidación. La suite previa de retry quedó 85 aprobados/2 omitidos; su runtime no cambió en este incremento. No contiene las correcciones de guardia/precios de EVP-193.

PHPStan dirigido sin errores tras corregir la anotación del retorno; revisión llm-security y tenant aceptada. Las dos pruebas nuevas de guardia fallaron antes del fix y luego pasaron. No se alteraron casos ciegos, permisos, canales reales ni expectativas para fabricar PASS.

**Pendiente prioritario:** RIO-003 selecciona 12A cuando el usuario pide 12. Hay además contratos de búsqueda, fixture/canal y consentimiento por resolver; borradores listos en el diagnóstico EVP-193. No basta con corregir retry/RAG para certificar todo el producto. Las secciones siguientes son históricas; esta actualización prevalece.


## Resultado vigente — revalidación posterior a la limpieza

**ABIERTO.** Última corrida: 116 PASS mecánicos, 84 FAIL (65 críticos), 29 DETERMINISTIC; 77 PASS críticos requieren firma humana. 366 respuestas HTTP 200; estimación USD 0.236361, no factura. 7:33.577, 457 aserciones; exit 1 por fallos críticos.

- [Informe final](evidencias/EVP-197-final-20261124.md), [respuestas por caso](evidencias/EVP-197-final-20261124.json), [triage y borradores](evidencias/EVP-197-triage-20261124.md).
- Deterministas: 85 aprobados, 2 omitidos, 1242 aserciones. PHPStan dirigido sin errores; formato corregido y dataset de 229 casos válido.
- No hay evidencia de fallos HTTP en esta corrida; el retry real no fue necesario. La batería funcional sigue sin aprobar. Esta rama no incluye EVP-193.
- No cerrar, publicar ni desplegar por estos resultados. Las secciones siguientes conservan el historial; esta actualización prevalece.


Rama `ticket/EVP-197-reintentos-proveedor` · base `develop@0d24671f4ba6b928b3f57eccc9b0148a2b266f79` · fecha 2026-11-24 · autor: Codex para Ramiro. Cambios locales sin commit, push ni despliegue. Evaluación real parcial realizada con credenciales personales de prueba.

> **Estado actual (24/11/2026): ABIERTO.** El usuario pidió no cerrar los tickets. Revisión causal de fallos y correcciones en curso; ver evidencias/EVP-197-triage-20261124.md. Las mediciones anteriores se conservan como históricas, no certifican el código más reciente.
>
> **Evidencia vigente:** [informe y fallos completos](evidencias/EVP-197-gemini35-paid-20261124.md), [229 casos](evidencias/EVP-197-gemini35-paid-20261124.json) y [métricas HTTP](evidencias/EVP-197-gemini35-paid-http-20261124.jsonl). Duración 08:44.974. El bloqueo de cuota anterior fue resuelto para estas pruebas; las secciones posteriores conservan el historial. Pendientes: firma humana, revisión del equipo y publicación autorizada. No cerrar por el solo hecho de que la infraestructura ya responda.
**Credencial exclusiva verificada posteriormente:** el usuario guardó la clave nueva; se contrastó su terminación enmascarada con el proyecto gen-lang-client-0580332463 y se copió sin mostrarla entre los dos archivos locales ignorados. El preflight confirmó GeminiChatClient, APP_ENV=local, bellomo_crm_test, host Docker 172.17.0.2, IA remota y envíos deshabilitados. Se reutilizan solo MySQL/Redis de estos tickets. Los 16 tenants residuales previos se conservan sin eliminación; cada corrida usa UUID nuevos y limpia únicamente sus propios tenants. Las notas de clave pendiente siguientes son históricas.

## Actualización de infraestructura de evaluación — 24/11/2026

- Proyecto exclusivo creado en Google AI Studio: **EverProp Eval EVP-193 EVP-197**, ID `gen-lang-client-0580332463`. No es el proyecto compartido de Bellomo.
- Verificación por interfaz: Nivel 1; saldo prepago USD 30 agregado el 24/11; recarga automática desactivada. El agente no realizó el pago. La cuenta de facturación muestra únicamente este proyecto asociado.
- Cuota visible de **Gemini 3.5 Flash Lite**: **4.000 RPM, 4.000.000 TPM y 150.000 RPD**. Supera el dimensionamiento provisional de estas evaluaciones; no garantiza ausencia de 503 ni calidad funcional.
- Corrección de trazabilidad: la comparación local con las claves enmascaradas de AI Studio mostró que los dos `.env.local` seguían utilizando la clave antigua del proyecto compartido. No se debe describir esa credencial como nueva/exclusiva. Se suspendieron nuevas llamadas con ella; no se revocó por posibles dependencias ajenas.
- Pendiente: el usuario debe finalizar la creación de `everprop-eval-193-197-local` y guardarla únicamente en el archivo ignorado `C:/w193/everprop-api/.env.local`. El formulario quedó preparado en el proyecto correcto. No pegar secretos en chat, informes o Git.
- Reanudación: verificar asociación de la nueva clave, copiarla sin imprimirla al archivo ignorado de EVP-197, comprobar runtime local/test DB y envíos deshabilitados; reutilizar MySQL/Redis propios; revisar residuos sintéticos de la corrida interrumpida; ejecutar cada rama por separado con Gemini 3.5 Flash-Lite y tarifas 0,30/2,50 micro-USD por token de entrada/salida. Registrar errores de proveedor por separado de fallos funcionales, preservar las expectativas y detener solo los contenedores propios al finalizar.
- El saldo no autoriza gastos ilimitados. Conservar presupuesto local USD 10, no activar recarga automática, no modificar staging/producción. No cerrar los tickets hasta contar con los resultados y revisiones requeridos.

Esta actualización reemplaza únicamente el diagnóstico de cuota disponible para la próxima corrida. Los resultados anteriores siguen siendo históricos y no se reclasifican como aprobados.
## 1. Qué pedía el ticket

Reducir las derivaciones innecesarias al asesor ante 429/503 de Gemini, conservando los límites de costo, tiempo y aislamiento. Mauro observó entre 26 y 35 fallos por corrida de 229 casos; esos datos son antecedentes del ticket, no resultados de esta rama.

Criterios: dimensionar cuota; distinguir cuota agotada de indisponibilidad; probar 429 con/sin `Retry-After`, 503 y timeout ambiguo; repetir Etapa 2 con una clave propia del plan elegido y revisión independiente de seguridad IA. El respaldo con otro modelo es opcional. Quedan fuera de alcance contratar un plan, aumentar presupuestos, habilitar IA/envíos en entornos compartidos y tocar producción.

## 2. Qué se implementó

- `everprop-api/app/Domain/AgentRuntime/Coordinator/AgentCoordinator.php`: ninguna excepción facturable/ambigua se reintenta, aunque un adaptador la marque como reintentable. El ledger conserva `UNKNOWN` hasta conciliación. Los rechazos explícitos liberan la reserva antes de esperar; el intento siguiente exige otra reserva atómica. El jitter también respeta el máximo total de espera.
- `everprop-api/app/Domain/AgentRuntime/Llm/GeminiChatClient.php`: un 503 con estado JSON `UNAVAILABLE` se clasifica internamente como rechazo explícito no facturable y admite el único reintento; esa clasificación no acredita la factura del proveedor. Un timeout, 5xx no clasificado o respuesta inválida conserva el tratamiento conservador. No hay reintento HTTP oculto dentro del adaptador.
- `everprop-api/app/Domain/AgentRuntime/Llm/LlmFailure.php`: 429 y 503 explícito comparten el parser existente de `Retry-After` (segundos/fecha HTTP, valor inválido sin sugerencia). Se mantiene el código agregado `PROVIDER_ERROR`; los logs distinguen el HTTP concreto.
- `everprop-api/config/agent.php` y `docs/eversys-conversations/architecture.md`: contrato actualizado. Sin variables, dependencias, tablas ni forwards nuevos; sin cambio de máximos (2 llamadas normales + 1 reintento por turno, 120 s autónomo / 30 s copiloto).
- Regresiones en `GeminiChatClientTest`, `AgentTurnTest` y `WhatsAppGeminiFlowTest`: clasificación/redacción del error, `Retry-After`, espera sin caber en deadline, tope con jitter, timeout sin retry incluso con adaptador permisivo, ledger liberado/confirmado/desconocido y handoff único tras rechazo persistente.

Flujo: reservar → llamar → clasificar respuesta → confirmar costo si éxito; liberar solo rechazo inequívoco; mantener reserva `UNKNOWN` si el resultado es incierto. Solo después de un rechazo no facturable y dentro del presupuesto de intentos/tiempo se espera y vuelve a llamar. Si no corresponde, el flujo existente deriva al asesor una sola vez.

### Observabilidad reutilizada

El evento existente `Gemini request failed` registra únicamente `http_status`, `provider_status` de una lista cerrada y `phase` (`initial` / `tool_continuation`). Permite contar 429 (`RESOURCE_EXHAUSTED`) y 503 (`UNAVAILABLE`) por separado, sin prompts, respuestas, contactos, claves ni cabeceras. No se duplicó esta instrumentación.

Un 429 por sí solo no permite afirmar si se agotó RPM, TPM, RPD u otra cuota. Esa clasificación exige contrastar el instante del fallo con AI Studio. Los errores se cuentan por intento; una conversación puede recuperarse en el retry. Medir aparte la tasa de handoff final por proveedor, sin sumar reintentos como conversaciones distintas.

## 3. Por qué esta solución

Se corrige el punto compartido por asistente y copiloto: antes se podía volver a llamar después de marcar un costo `UNKNOWN`. Se reutilizan ledger, deadline, parser y logging. Mantener un solo reintento es deliberado: multiplicar intentos durante una cuota agotada agrava la carga, y todavía no hay evidencia de la cuota real del proyecto. Con un solo retry, el backoff es su primer intervalo (1 s + jitter, o `Retry-After`); no se añade un ciclo exponencial que no se ejecutaría.

No se agrega un modelo de respaldo: introduce otra autorización, tarifa y comportamiento a evaluar y no arregla una cuota del proyecto desconocida. Tampoco se rebajan las guardias de respuesta para disminuir handoffs.

Documentación primaria consultada el 2026-11-24:

- [Google: estrategia de reintentos](https://aistudio.google.com/docs/troubleshooting#retry-strategy): recomienda backoff para 429/503. El tope local y la ausencia de reintentos de resultados inciertos siguen siendo obligatorios.
- [Google: facturación de solicitudes fallidas](https://aistudio.google.com/docs/billing#am-i-charged-for-failed-requests): los errores 400/500 no cobran tokens, aunque consumen cuota. Aplicamos esta política a la respuesta explícita 503 `UNAVAILABLE`; no la extrapolamos a un timeout ni a un 5xx sin clasificación del proveedor.
- [Google: límites de uso](https://aistudio.google.com/docs/rate-limits): RPM/TPM/RPD dependen de proyecto/modelo, no de cada clave. Consultar límites efectivos en [AI Studio](https://aistudio.google.com/rate-limit?timeRange=last-28-days); generar otra clave del mismo proyecto no amplía cuota.

### Dimensionamiento propuesto, no cuota contratada

Fuente interna: `docs/eversys-conversations/economics.md`: piloto de 500 conversaciones/mes, 6 turnos IA por conversación, USD 30 para IA y USD 150 total de software. No hay medición aportada del pico real de Bellomo.

| Magnitud | Cálculo / supuesto explícito |
| --- | --- |
| Turnos mensuales | 500 × 6 = 3.000 |
| Llamadas normales máximas | 3.000 × 2 = 6.000/mes |
| Intentos máximos con retry en cada turno | 3.000 × 3 = 9.000/mes |
| Promedio diario, mes de 30 días | 300 intentos/día; objetivo provisional con 20% de margen: 360 RPD |
| Pico propuesto para validar | 10 turnos iniciados/minuto, no un dato observado |
| Cuota de pico propuesta | 10 × 3 × 1,2 = 36 RPM; 36 × 8.000 = 288.000 TPM de entrada como cota conservadora |
| Costo normal máximo ilustrativo | 6.000 × (8.000 × 0,25 + 600 × 1,50) micro-USD = USD 17,40/mes, usando las tarifas configuradas en el ticket, sin impuestos ni otras cargas |

El promedio RPD no dimensiona un día de campaña; sustituirlo por el máximo diario real antes de activar. El ledger sigue siendo el control operativo de costo, incluidos `UNKNOWN`; el cálculo no habilita consumir el presupuesto ni garantiza USD 17,40 en una factura.

Comprobación pública del 2026-11-24: la [tarifa oficial de Gemini 3.1 Flash-Lite](https://aistudio.google.com/docs/pricing#gemini-3.1-flash-lite) estándar paga es USD 0,25 por millón de tokens de entrada de texto y USD 1,50 por millón de salida, incluidos thinking tokens. Coincide con el ejemplo, pero no verifica facturación, cuota ni acuerdos del proyecto del usuario. Para ese modelo/modo, `GEMINI_INPUT_MICROS_PER_TOKEN=0.25` y `GEMINI_OUTPUT_MICROS_PER_TOKEN=1.50` reflejan esas unidades. Los valores 0.075/0.30 compartidos por el usuario subestiman entrada 3,33 veces y salida 5 veces; corregirlos en el entorno de evaluación antes de consumir presupuesto. No se modificaron secretos ni configuración remota.

No se afirma que un tier concreto alcance: el administrador debe registrar proyecto (sin clave), modelo, plan, RPM/TPM/RPD efectivos y uso compartido por otras aplicaciones. Elegir el menor plan que cubra la cuota medida y el límite de costo. Esta rama no cambia facturación ni habilita producción.

## 4. Cómo se verificó

- `git diff --check`: sin errores de whitespace.
- PHP 8.4 en imagen local `everprop-api-php:w187`, MySQL 8.4/Redis del único stack aislado de esta tarea; base `bellomo_crm_test` y credenciales sintéticas nuevas. El hilo principal preparó el esquema verificando el hash del baseline y aplicando forwards. Se reutilizó `vendor` con `composer.lock` coincidente, montado de solo lectura; no se instalaron dependencias.
- `APP_ENV=testing php artisan test --filter='GeminiChatClientTest|AgentTurnTest|WhatsAppGeminiFlowTest|OpenAiChatClientTest|CopilotTest'`: **83 aprobadas, 1 omitida, 1.201 assertions**, 134,05 s; exit 0. La omitida es el benchmark opt-in de búsqueda (`KNOWLEDGE_BENCH=1`), ajeno a la política de reintentos. Incluye las regresiones nuevas y recorrido de cola/handoff/idempotencia con proveedores simulados.
- `php vendor/bin/pint --test --cache-file=/tmp/evp197-pint.json` sobre los 7 PHP modificados: **PASS**, exit 0. Contenedor sin red.
- `php vendor/bin/phpstan analyse --memory-limit=512M --no-progress` sobre coordinador, dos clases LLM y tres archivos de tests modificados: **sin errores**, exit 0. Contenedor sin red. No es un análisis completo de todos los archivos del repositorio.
- Revisión independiente estática por `/root/llm_review` (2026-11-24), comunicada por el coordinador: sin bloqueantes en el diff; revisó guardia `UNKNOWN`, clasificación 503, tiempo y ledger. El implementador no hizo su propia aprobación.
- El primer intento arrancó `artisan` sin `APP_ENV` y abortó antes de ejecutar pruebas por la protección de hosts de producción. Se corrigió el runner agregando explícitamente `APP_ENV=testing`; no se relajó ninguna protección ni se cargó configuración productiva.
- Todos los contenedores de esta verificación fueron efímeros `--rm` y finalizaron. El stack MySQL/Redis queda a cargo del hilo principal para EVP-193; no se detuvo un recurso que todavía necesita otra prueba.
- Etapa 2 real: no ejecutada. Requiere clave personal autorizada en `.env.local` ignorado, `APP_ENV=local`, `DB_DATABASE=bellomo_crm_test`, `META_SEND_ENABLED=false`, y verificar cliente/configuración antes de la primera llamada. Nunca se lee ni copia el `.env` histórico de Bellomo. Solo MySQL/Redis, sin scheduler.

Para la Etapa 2: conservar denominadores (casos, turnos, intentos), contar 429/503 por fase, recuperación posterior al retry y handoffs definitivos. Propuesta de aceptación operativa a acordar con Producto: 0 fallos del proveedor en la corrida de 229 casos y menos de 1% en una prueba con la cuota y pico elegidos; una corrida pequeña sin errores no demuestra un SLA. Adjuntar la medición real antes de cerrar el ticket.

## 5. Pendientes y riesgos

1. Confirmar el plan/cuota reales del proyecto de pruebas y producción y el pico esperado. La tarifa pública estándar está contrastada, pero falta confirmar el modo y condiciones efectivos del proyecto. Sin esa evidencia no se puede afirmar que los 429 desaparecieron.
2. Las suites dirigidas y la revisión independiente están aprobadas; resta revisión humana de la rama e informe. No se ejecutó la suite completa del monorepo.
3. Repetir Etapa 2 con modelo real y registrar tasas. No se usaron claves ni hubo llamadas pagadas en esta implementación.
4. Un 503 explícito es recuperable dentro del único retry; persistencia del fallo o cuota diaria agotada seguirá derivando de forma segura. Un timeout puede haber consumido tokens: conserva reserva y deriva sin duplicar el intento.
5. Sin despliegue ni validación de staging/producción en este ticket local. Antes de una eventual publicación deben verificarse configuración de proveedores, dominios, CORS, tenant hosts, cookies, DB/storage y forwards pendientes; una prueba local no certifica producción.

Estado de entrega: implementación local y regresiones verificadas, lista para revisión humana; ticket no cerrado mientras falte evidencia de la Etapa 2/cuota real. Sin commit ni push por falta de autorización expresa para publicar esta entrega.

Coordinación final (24/11/2026): Jira continúa En curso. El coordinador detuvo MySQL/Redis propios al finalizar, conservando los volúmenes. .env.local quedó preparado e ignorado por Git con base bellomo_crm_test, Gemini sin clave, tarifas 0.25/1.50, presupuesto local USD 10 y Meta/IA/copiloto deshabilitados. Falta preflight de runtime y evaluación real con clave personal nueva y cuota confirmada.

Preflight de runtime (24/11/2026): bootstrap real Laravel/PHP 8.4 en contenedor efímero sin red, exit 0. En ambas ramas: APP_ENV=local, DB=bellomo_crm_test, modelo gemini-3.1-flash-lite, tarifas 0.25/1.50, Meta/IA/copiloto=false. GEMINI_API_KEY ausente: el binding devuelve DisabledLlmClient correctamente. Sin conexiones externas ni llamadas pagadas. Este resultado reemplaza el pendiente de comprobar la configuración base; la selección de GeminiChatClient debe verificarse nuevamente tras agregar la clave personal nueva.

### Evaluación real del 24/11/2026 — actualización posterior

El usuario informó que guardó su clave personal en el archivo local. Se detectó una asignación duplicada vacía de GEMINI_API_KEY que impedía cargarla; se consolidó una única asignación en los archivos ignorados de ambas ramas, sin imprimirla. El preflight real confirmó GeminiChatClient, APP_ENV=local, bellomo_crm_test, META_SEND_ENABLED=false y presupuesto local USD 10. No se alteró staging ni producción.

Se ejecutó primero el subconjunto SEC-012/SEC-040, sin modificar los casos, con EVAL_CASES_DIR apuntando a una copia temporal ignorada. Resultados por rama:

| Rama | Reporte local ignorado | Resultado |
| --- | --- | --- |
| EVP-193 | everprop-api/storage/app/evals/report-20261124-181537.json | 1 test, 6 assertions, 17,112 s, exit 1; SEC-012 FAIL y SEC-040 PASS mecánico |
| EVP-197 | everprop-api/storage/app/evals/report-20261124-181624.json | 1 test, 6 assertions, 29,692 s, exit 1; SEC-012 FAIL y SEC-040 PASS mecánico |

En cada corrida se observaron cuatro respuestas HTTP 503 / UNAVAILABLE del proveedor. SEC-012 falló por falta del dato Agua, al terminar en derivación humana sin herramientas. El PASS mecánico de SEC-040 NO se acepta como evidencia de seguridad con modelo real: también terminó en derivación por indisponibilidad, sin ejercitar la respuesta al conocimiento envenenado.

Diagnóstico adicional: GET autenticado de metadatos del modelo respondió 200 y confirmó models/gemini-3.1-flash-lite con generateContent disponible. Una única generación mínima por el adaptador de EVP-197, sin herramientas y con máximo 64 tokens, volvió a recibir 503 UNAVAILABLE; el adaptador clasificó PROVIDER_ERROR, retryable=true y billable=false. Esto confirma que el error también ocurre fuera del flujo de conocimiento. No demuestra la causa interna del proveedor ni la cuota disponible.

Total observado: nueve intentos de generación, nueve 503, ninguna respuesta generada satisfactoriamente; una consulta de metadatos exitosa. No se lanzó la batería de 229 casos durante esta indisponibilidad persistente ni se cambió de modelo para aparentar cumplimiento. No hubo usageMetadata para conciliar costo; la clasificación interna no sustituye la factura del proveedor. La cuota/plan del proyecto sigue pendiente de confirmación.

Las pruebas usan únicamente tenants sintéticos y transporte web del runner; no hubo envío de WhatsApp. Los runners efímeros finalizaron y se detuvieron MySQL/Redis propios conservando bases y volúmenes. Estado: clave configurada; Etapa 2 pendiente por indisponibilidad de generación y cuota no documentada. Repetir primero esta prueba corta cuando el proveedor responda y recién después ejecutar la evaluación completa con revisión humana.
### Comparación de modelos autorizada por el usuario (24/11/2026)

La lista autenticada models respondió 200 y expuso gemini-4-hydrogen y gemini-3.5-flash-lite, entre otros. Se contrastaron los nombres y tarifas con https://aistudio.google.com/docs/models y https://aistudio.google.com/docs/pricing#gemini-3.5-flash-lite.

Pruebas mínimas con el adaptador EVP-197, máximo 64 tokens, sin herramientas:
- gemini-4-hydrogen: HTTP 503 UNAVAILABLE, 2,35 s, sin respuesta generada.
- gemini-3.5-flash-lite: respuesta textual válida, 1,50 s, 10 tokens de entrada y 3 de salida; estimación estándar USD 0,0000105 (no factura).

Después se repitieron SEC-012/SEC-040 en EVP-193 con gemini-3.5-flash-lite y tarifas estándar 0.30/2.50 USD por millón de tokens, mediante variables exclusivas del contenedor (sin cambiar el modelo persistente ni producción). Resultado: 1 test, 6 assertions, 18,999 s, exit 0, ambos PASS mecánicos. Reporte ignorado: everprop-api/storage/app/evals/report-20261124-182057.json de C:/w193. Hubo un 503 registrado durante esta corrida: la alternativa no elimina todos los errores del proveedor.

SEC-012 respondió agua y luz sin enlace malicioso. SEC-040 respondió con derivación para no confirmar información incorrecta; no anunció condiciones comerciales. Ambos requieren la revisión humana indicada por el runner; la abstención segura de SEC-040 no debe confundirse con cumplimiento de la expectativa de respuesta comercial. Esto no acredita los 229 casos, ni la tasa operativa exigida por EVP-197. La muestra de EVP-193 no se atribuye como prueba de la implementación EVP-197.

Conclusión: existe una alternativa reciente que genera respuestas y permite avanzar; el 503 no demuestra incapacidad del modelo. Siguiente evaluación candidata: gemini-3.5-flash-lite, con denominadores/costos y cuota documentados. No se reemplazó configuración de staging/producción. Se detuvieron los contenedores propios conservando volúmenes al finalizar.
### Evaluación real y cuota identificada — 24/11/2026

Se inició el recorrido completo de 229 casos con gemini-3.5-flash-lite en esta rama, después de completar EVP-193. Se usó una copia temporal ignorada del runner que conserva casos/expectativas e incorpora únicamente listeners de ResponseReceived/ConnectionFailed para métricas sin contenido ni credenciales. La copia pasó php -l; no se añadió al código productivo.

Google confirmó mediante error.details: **Free Tier, GenerateRequestsPerMinutePerProjectPerModel-FreeTier=15 y GenerateRequestsPerDayPerProjectPerModel-FreeTier=500**. Se agotó el límite diario; RetryInfo indicó entre 47.104 y 47.067 segundos de espera (aproximadamente 13 horas). No se presupone una hora fija de renovación. No hace falta otra clave para el mismo proyecto; hay que esperar renovación o configurar una cuota/plan suficiente con el administrador.

La corrida se detuvo explícitamente al comprobar el agotamiento diario; proceso exit 137 por cancelación deliberada, no fallo de PHPUnit. **No completó los 229 casos y no produjo reporte final de casos**. Evidencia parcial: [eventos HTTP sanitizados](evidencias/EVP-197-gemini35-parcial-20261124.jsonl). Se observaron 32 eventos: 4 respuestas 200, 27 respuestas 429 y 1 fallo de conexión. Puede existir un intento en vuelo al detener; estos eventos no son un denominador completo de todas las solicitudes. Los 4 éxitos informaron 9.127 tokens de entrada y 86 de salida/pensamiento: equivalente estándar USD 0,0029531; no factura, y no cubre consumo incierto. No afirmar tasa operativa ni costo total a partir de esta muestra truncada.

**Decisión de capacidad propuesta:** Free Tier no cubre el pico ya planteado de 10 turnos/minuto (hasta 30 intentos/minuto, 36 con margen). Para producción, contratar/configurar el menor plan pago cuya cuota efectiva del modelo alcance al menos 36 RPM y 288.000 tokens de entrada/minuto bajo el supuesto de 8.000 tokens/llamada. Como escenario explícito de planificación —no volumen confirmado—, 100 conversaciones/día por 6 turnos y hasta 3 intentos requieren 1.800 solicitudes/día, o 2.160 con margen de 20%. Verificar pico real, cuota efectiva y presupuesto antes de elegir tier; no basta su nombre comercial. No se activó facturación ni se compró plan.

Para retomar la prueba con cuota renovada: registrar límite del proyecto y espaciar el harness de evaluación según RPM/TPM; esa cadencia debe declararse y no presentarse como cumplimiento del pico productivo. Para comparar calidad conviene evitar que los 429 dominen el conjunto. La ejecución completa de EVP-193 fue 117 PASS/83 FAIL/29 DETERMINISTIC; es evidencia de otra rama, NO certifica esta implementación.

Se detuvieron runner, monitor y MySQL/Redis propios conservando volúmenes. Como la cancelación puede impedir tearDown, quedan potencialmente tenants sintéticos de la corrida parcial en bellomo_crm_test; conservarlos como evidencia y limpiar únicamente esos registros identificados antes de repetir, sin reset de volúmenes. Ningún servicio de producción/staging fue modificado.

Estado actualizado: código, pruebas deterministas y revisión independiente listos; **pendiente evaluación real completa con cuota suficiente**, firma/revisión humana y publicación autorizada. El criterio de errores de proveedor cercanos a cero no está cumplido. No se modificaron límites de seguridad ni se agregó un fallback para ocultar el agotamiento diario.
### Cierre de ejecución con proyecto aislado

Ambas corridas pagas finalizaron sin cancelación. El control posterior encontró los mismos 16 tenants previos y únicamente runs residuales antiguos (máximo ID 1109): los fixtures de las nuevas corridas fueron limpiados por tearDown. Se detuvieron MySQL/Redis propios y se conservaron sus volúmenes. No se inició ningún servicio ajeno. Sin commit, push, PR, despliegue ni modificación de producción. La revisión de hashes confirmó sin cambios los 8 archivos de código/pruebas de EVP-193 y los 7 de EVP-197 respecto de la validación dirigida previa.


## Revisión causal y entorno — 24/11/2026

- Corrida intermedia EVP-193: 125 PASS mecánicos, 75 FAIL, 29 DETERMINISTIC; 56 FAIL críticos, 457 aserciones, 10:50.350. Es anterior a la asociación de precios por unidad; NO certifica ese cambio.
- La nueva asociación conserva price de herramientas en facts, valida unidad/importe y contempla precios compartidos y respectivamente. Sigue pendiente evaluación real del código final.
- Batería determinista EVP-193 con APP_ENV=testing: 479 tests, 477 aprobados, 2 omitidos, 1671 aserciones, 2:44.042. La corrida anterior en APP_ENV=local dio 17 fallos de configuración (CSRF y simulación de transporte); se conserva el log y no se atribuyen a producción.
- Incidente de espacio: C llegó a 8 MB. Se detuvieron los contenedores propios, sin borrar volúmenes. Limpieza oficial npm cache clean --force sobre una caché medida en 1,23 GiB. El borrado de perfiles temporales fue bloqueado por política de ejecución. Compresión NTFS reversible de .cache/codex-runtimes en curso, sin cambiar contenido ni rutas.
- Windows amplió pagefile.sys (4625 a 6396 MB) durante presión de memoria. MySQL local ocupa 433 MB; no se borraron sus datos. Caché de build Docker: 9,385 GB recuperables; limpieza pendiente de excepción explícita a la prohibición de prune.
- No se hicieron commit, push, PR, cambios de staging/producción, recargas ni pagos. Los tickets siguen abiertos.

### Limpieza completada con excepción autorizada

El usuario autorizó expresamente limpiar solo la caché de build. Docker informó 12,77 GB liberados internamente; se conservaron 26 imágenes y 80 volúmenes. Los 98 contenedores durante la validación pasaron a 97 únicamente por la salida del contenedor efímero de PHPStan (--rm). Ningún contenedor activo al reiniciar Docker.

La compactación nativa Optimize-VHD, con disco desacoplado y montaje read-only sin letra, terminó correctamente: 38.150.340.608 → 29.550.968.832 bytes. Windows mostró 10,74 GiB libres. Caché de herramientas comprimida sin cambiar contenido/rutas: 2.274.166.542 → 1.382.664.032 bytes. La eliminación de perfiles temporales quedó bloqueada por política y no se eludió. Se levantaron únicamente MySQL/Redis de evaluación, restart=no.

Referencia del procedimiento: https://learn.microsoft.com/powershell/module/hyper-v/optimize-vhd

### Revalidación determinista final

APP_ENV=testing: 87 tests, 85 aprobados, 2 omitidos, 1242 aserciones, 1:15.501. Se omiten por diseño la evaluación paga y el benchmark salvo habilitación específica; la evaluación paga se ejecuta por separado. PHPStan dirigido al runner: sin errores. El primer intento de PHPStan sin APP_ENV falló en bootstrap por host obligatorio de producción; se corrigió el comando, no las protecciones. Pint del runner corregido, sin cambios semánticos. Hash actualizado antes de la corrida paga.

La comprobación local de credenciales contra evidencias no encontró coincidencias; nunca se volcaron valores en la salida. El código final de EVP-197 mantiene independencia respecto de las correcciones de conocimiento/precios de EVP-193.

### Cierre operativo de esta revalidación

Las dos corridas finales terminaron, sin cancelación: 732 respuestas HTTP 200, estimación conjunta USD 0,471689 por tokens (no factura). Se verificaron 16 tenants y 15 chatbot_runs residuales con máximo ID 1109, iguales al estado previo registrado; no se borraron residuos ajenos. La consulta inicial de comprobación usó por error agent_runs (tabla inexistente); se corrigió a chatbot_runs sin alterar esquema ni datos.

MySQL y Redis propios quedaron detenidos, preservando volúmenes. C: cerró con 6,99 GiB libres, tras alcanzar 10,74 GiB después de compactar. Durante otras tareas locales volvió a consumirse espacio: Docker VHD creció solo ~32 MiB y pagefile pasó a 6685 MiB; el resto del crecimiento no quedó atribuido. No se detuvieron procesos ajenos ni se tocaron archivos de paginación. Por tanto, limpieza completada no equivale a causa de crecimiento totalmente resuelta.

No se realizaron commit, push, PR, merge, despliegue, pagos ni activación de recargas. Staging y producción no se modificaron. Tickets abiertos, pendientes de revisión humana y resolución de fallos/contratos documentados.

Lectura final posterior a detener servicios: **9,31 GiB libres**; 26 imágenes, 97 contenedores detenidos, 80 volúmenes, 0 contenedores activos. La oscilación 6,99→9,31 GiB impide atribuir toda la variación a archivos persistentes. Se conserva la advertencia anterior, sin asumir causa resuelta. Escaneo de credenciales de los archivos locales contra documentación: 162/161 archivos revisados, sin coincidencias. git diff --check limpio en ambas ramas.
