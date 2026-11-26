# EVP-200 — Asistente: nunca precio ni disponibilidad; cotización y cuotas bloqueadas por defecto

Rama `ticket/EVP-200-reglas-precio-disponibilidad`, desde `origin/develop` `71a8528` (incluye EVP-193, EVP-194, EVP-195, EVP-196 y EVP-197) · commits `27e9bc4` y el ajuste posterior a los evals · PR [#178](https://github.com/maurocentu26/EverProp-Bellomo/pull/178) · 2026-11-25 · Claude (sesión local) con Mauro Centurión. Jira: [EVP-200](https://eversys.atlassian.net/browse/EVP-200), En curso.

## 1. Qué pedía el ticket

Reglas de negocio de Bellomo para el asistente que atiende a visitantes (widget, WhatsApp, Instagram, Messenger) y para los borradores del copiloto:

1. Nunca decir precios de las unidades, aunque estén en la base.
2. Nunca confirmar la disponibilidad de un activo.
3. Informar cotización y cuotas solo si el proyecto lo autoriza desde el panel. Es una funcionalidad futura: por defecto nunca.

Criterios: las reglas aplicadas en tools, prompt y guardia determinista, con tests y evals negativos de precio, disponibilidad y cuotas.

Fuera de alcance: el flag por proyecto en el panel (columna, SQL y UI), la corrida contra el modelo real y el despliegue a staging (EVP-201).

## 2. Qué se implementó

- **Tools.** [`PublicInventory.php`](../../everprop-api/app/Domain/AgentRuntime/Tools/PublicInventory.php):
  - `summary()` y `detail()` ya no devuelven `price` ni `availability`;
  - `columns()` deja de leer precio, moneda y estado.

  [`BuscarPropiedades.php`](../../everprop-api/app/Domain/AgentRuntime/Tools/BuscarPropiedades.php):
  - se quitó el filtro `budget`, porque saber qué unidades entran en un monto revela su precio. El esquema cerrado lo rechaza con `VALIDATION_ERROR`;
  - `more_available` pasa a llamarse `more_results`, para que el modelo no lo lea como stock;
  - la descripción aclara que la tool no devuelve precio ni disponibilidad.

  `consultar_propiedad` cambia solo su descripción.
- **Prompt.** [`PromptBuilder.php`](../../everprop-api/app/Domain/AgentRuntime/Coordinator/PromptBuilder.php):
  - la regla 1 prohíbe precios, montos y monedas, y confirmar o negar disponibilidad o stock. Ante esas preguntas, el asistente dice que lo confirma un asesor y ofrece registrar el contacto o derivar;
  - la regla 2 prohíbe cotizaciones y condiciones de pago aunque estén en una fuente;
  - la regla 5 deriva si el cliente insiste;
  - se quitaron las menciones a "informar precio" de la regla 12/12A y la palabra "disponibilidad" de la regla de horario.
  - si una unidad no aparece, el asistente dice que no la encontró en el catálogo, sin decir que no está disponible ni que se vendió; los gastos de escritura cuentan como condición de pago;
  - `agent.prompt_version` pasa a `coordinator-2026-11-25.200b` (la `.200` fue la de las corridas contra Gemini).
- **Coordinador.** [`AgentCoordinator.php`](../../everprop-api/app/Domain/AgentRuntime/Coordinator/AgentCoordinator.php):
  - se eliminó `collectPrices()`: ningún precio de tool es evidencia;
  - los hechos de propiedad ya no incluyen `price`;
  - `screen()` llama a la guardia sin precios y sin `financingAllowed`, así que queda apagado. Aplica igual a la respuesta autónoma y al borrador del copiloto.
- **Guardia determinista.** [`OutputGuard.php`](../../everprop-api/app/Domain/AgentRuntime/Coordinator/OutputGuard.php):
  - Parámetro nuevo `bool $financingAllowed = false` en `check()`.
  - **Montos:** un monto solo pasa si repite el pedido del visitante (`$requested`, el resumen de contacto que arma el servidor) o si `financingAllowed` está encendido y figura en una fuente aprobada. Los precios de las tools nunca lo respaldan. La asociación precio-unidad de EVP-193 sigue activa y ahora bloquea cualquier precio de unidad.
  - **Términos de pago** (cuotas, anticipos, tasas, plazos, descuentos, porcentajes comerciales): siguen la misma regla. Sin autorización, `UNSUPPORTED_TERM` aunque una fuente los publique.
  - **Escasez** ("quedan pocas", "última unidad"): siempre `UNSUPPORTED_AVAILABILITY`, aunque esté en una fuente.
  - **Disponibilidad positiva:** siempre `UNSUPPORTED_AVAILABILITY`, incluso para una unidad que la tool acaba de devolver.
  - **Excepciones acotadas en `availability()`**, por lista permitida tras la revisión:
    - "la disponibilidad del 12A te la confirma un asesor", "el precio y la disponibilidad te los confirma un asesor" y "un asesor te confirma la disponibilidad";
    - con una unidad nombrada, solo las formas de incapacidad: "no puedo confirmarte la disponibilidad", "no tengo información sobre la disponibilidad";
    - "un asesor te confirma si el 12A está disponible";
    - "tu disponibilidad horaria";
    - "lotes en venta", como operación y sin código de unidad.
    - Cualquier estado después ("es inmediata", "que es total") o un sustantivo sin artículo ("Confirmamos disponibilidad…") sigue bloqueado.
  - **Más frases de disponibilidad positiva:** "no está reservado", "sin vender", "sin dueño", "no tiene comprador", "hay stock", "quedan varias", "se puede reservar el 12A", "podés reservarlo". "Se puede reservar un turno de visita" no cuenta.
  - **Números sin moneda en una oración de precio** (`priceNumbers()`): "sale 85.000", "precio de lista: 85.000", "arrancan en 25.000", "1.200 el metro", "85 lucas", "€ 85.000" son `UNSUPPORTED_AMOUNT`, salvo que los mismos dígitos estén en la evidencia comercial. Quedan afuera años, teléfonos y superficies.
  - **Financiación sin cifras** (`financingClaim()`), con la autorización apagada: "se puede pagar en cuotas", "hay financiación propia", "hay descuento por contado", "es más barato que", "entra en tu presupuesto" son `UNSUPPORTED_TERM`. Pasan las preguntas, la falta de datos ("no tengo información sobre financiación") y la derivación sin afirmar ("las condiciones de pago te las detalla un asesor"). "Hay financiación propia, un asesor te detalla" sigue bloqueado. No se aplica al resumen de contacto del servidor.
  - **Disponibilidad negativa** (decisión del usuario, 2026-11-25): también se bloquea sobre una unidad ("el 12B ya no está disponible", "se vendió", "la unidad 14 no se encuentra disponible"), aunque una tool la haya reportado NOT_FOUND. Solo pasa la negativa sobre el catálogo, sin unidad en juego y con una búsqueda vacía ("no encontré casas disponibles en Tilcara"). "No encontré la unidad 14 en el catálogo" pasa porque no afirma un estado.
- **Evals** (`evals/cases/*.jsonl`):
  - 38 casos que exigían una cifra (precio, `USD`, `%`, "36 cuotas") o la palabra "disponible" ahora la tienen prohibida, con una nota EVP-200. El `behavior` no cambia: la respuesta tiene que derivar sin que actúe la guardia.
  - 13 casos negativos nuevos (DATA-055 y DATA-056 se sumaron con las decisiones del usuario):
    - DATA-047 a DATA-056: precio en la base, insistencia, presupuesto, disponibilidad de una unidad devuelta, stock, unidad vendida, cuotas de una fuente aprobada, descuento de contado, unidad inexistente y gastos de escritura;
    - SEC-045: falsa autoridad pide el precio de lista;
    - SEC-046: descripción con precio e instrucción inyectada;
    - RIO-027: pregunta coloquial por precio y "cuotitas".
- **Docs:**
  - CLAUDE.md, invariante 5: Inventory sigue siendo la fuente de verdad interna, pero el asistente no expone precio ni disponibilidad;
  - `data-and-contracts.md`: contratos de `buscar_propiedades` y `consultar_propiedad`;
  - `evaluation-and-security.md`: amenaza nueva y sus casos.
- Sin SQL, sin variables nuevas, sin cambios de esquema.

## 3. Por qué esta solución

- **Tres capas, como pide el diseño:**
  - lo que el modelo no recibe no lo puede decir (tools);
  - el prompt hace probable la respuesta correcta;
  - la guardia determinista bloquea lo que igual se escape y deriva a un asesor (falla cerrada).
- **Se reutilizó la maquinaria de EVP-113, EVP-192 y EVP-196.** Las reglas de coincidencia de montos y términos con fuentes siguen intactas detrás de `financingAllowed`: cuando exista el flag del panel, encenderlo vuelve a permitir cotización y cuotas publicadas, sin reescribir la guardia. Los tests que probaban esa coincidencia corren ahora con `financingAllowed: true`, así que siguen cubriendo ese camino.
- **Descartado:** borrar la lógica de montos y términos, porque el flag la va a necesitar. También agregar códigos de violación nuevos, porque los existentes ya los consumen las trazas, los KPIs y el runner de evals.
- **Límites conocidos:**
  - La detección es léxica. Paráfrasis de disponibilidad no cubiertas por el detector (por ejemplo "todavía tenemos el 12A") pasan la guardia y dependen del prompt y de los evals.
  - "No te puedo confirmar la disponibilidad del 12A: te la confirma un asesor" se bloquea por el ":", un falso positivo que deriva igual.

## 4. Cómo se verificó

Entorno: Docker local (PHP 8.4, MySQL 8.4, Redis) con la base de tests recién importada (baseline y forwards; `everprop:schema:verify` OK en dev y testing).

- `vendor/bin/phpunit` (suite completa, después de las correcciones de la revisión): **1213 pruebas, 7577 comprobaciones, 0 fallas, 2 omitidas** (repetida después del ajuste por evals) (benchmark y modelo real).
- `OutputGuardTest::test_reviewed_price_availability_and_financing_bypasses_fail_and_deflections_pass`: cada bypass de la revisión se bloquea y cada derivación válida pasa. Los gemelos de EVP-196 ("te paso los detalles de disponibilidad del 12B") siguen bloqueados.
- `tests/Unit/AgentRuntime` y `tests/Feature/AgentRuntime`: 652 pruebas OK. Tests nuevos o reescritos:
  - `OutputGuardTest::test_prices_availability_and_financing_are_never_disclosed_by_default`: precio por tool, fuente o visitante, en dígitos o en letras; disponibilidad de una unidad devuelta; escasez desde una fuente; cuotas y montos de una fuente aprobada; la derivación al asesor pasa y cinco gemelos maliciosos se bloquean.
  - `AgentTurnTest::test_a_price_question_gets_the_advisor_answer_without_price_or_availability`: la tool no entrega precio ni estado y la respuesta de derivación llega al visitante.
  - `AgentTurnTest::test_a_price_or_availability_the_model_states_anyway_never_reaches_the_visitor`: un precio o un "disponible" correctos se bloquean y la conversación pasa a un asesor.
  - Presupuesto rechazado por el esquema; términos de una fuente bloqueados de punta a punta; copiloto con las mismas reglas.
- `vendor/bin/pint --test`: PASS. `vendor/bin/phpstan analyse`: sin errores.
- `node evals/validate.mjs`: **244 casos válidos**, 141 críticos en test.
- **Después de las decisiones del usuario** (disponibilidad negativa, gastos de escritura): suite completa **1217 pruebas, 7581 comprobaciones, 0 fallas, 2 omitidas**; Pint y PHPStan OK; `node evals/validate.mjs`: **246 casos válidos**, 143 críticos en test. No se repitió la corrida contra Gemini.
- **Evals contra el modelo real** (autorizados por el usuario el 2026-11-25):
  - Configuración: `gemini-3.1-flash-lite` (el mismo modelo que `bellomito-staging`), `APP_ENV=local` con `.env.local` ignorado, base aislada `bellomo_crm_test`, Meta apagado, presupuesto local de USD 10.
  - Comando: `docker compose --project-name everprop-api run --rm -v "<repo>/evals:/var/www/evals:ro" -e APP_ENV=local -e AGENT_LLM_MODEL=gemini-3.1-flash-lite -e EVAL_LLM=configured everprop-api-php php artisan test --filter=test_model_cases`.
  - La primera corrida usó `APP_ENV=testing`. Ahí Gemini queda deshabilitado (`PROVIDER_DISABLED`), así que no llamó al modelo ni tuvo costo.

  | Corrida | PASS | FAIL | Bloqueos por disponibilidad | Bloqueos por términos | Qué cambió antes |
  |---|---|---|---|---|---|
  | 1 | 120 | 95 | 58 | 10 | código del primer commit |
  | 2 | 141 | 74 | 23 | 12 | "disponibilidad" como tema deja de ser afirmación |
  | 3 | 140 | 75 | 3 | 4 | prompt: no repetir cuotas ni promociones de las fuentes; derivaciones destrabadas |
  | 4 | **157** | **58** | 1 | 4 | prompt: seguir buscando y nombrando unidades, sin precio ni disponibilidad |

  (29 casos deterministas en cada corrida. Reporte final: `storage/app/evals/report-20261125-211733.json` en el volumen local.)
  - **Fugas:** en la corrida 4 no hay **ningún bloqueo por monto** (`UNSUPPORTED_AMOUNT`). Revisé las respuestas que vio el visitante en busca de cifras, monedas, "disponible", cuotas, anticipos o descuentos: solo aparecen 6 derivaciones del estilo "las cuotas y condiciones te las detalla un asesor", sin datos.
  - **Diagnóstico:** el texto bloqueado lo obtuve con un log temporal que no se commiteó. En la corrida 1, el modelo derivaba bien ("los precios y la disponibilidad los confirma un asesor") y la guardia lo bloqueaba por la palabra "disponibilidad": eran falsos positivos. Los corregí y quedaron como regresión en `OutputGuardTest`. Las infracciones reales fueron cuotas, anticipos o descuentos copiados de una fuente ("anticipo del 30% y 36 cuotas", "10% de descuento") y "lotes disponibles". La guardia las frenó; después el prompt las redujo a 4 y 1.
  - **Los 58 FAIL restantes no dependen de estas reglas.** Son expectativas de herramientas: no busca o consulta cuando el caso lo pide, deriva o no según lo esperado, persistencia de CRM y visitas. También hay bloqueos de código de unidad de EVP-192/194 (`UNSUPPORTED_UNIT`: 9) y "gastos de escritura 3%" (DATA-014), bloqueado por decisión.
  - **No hay corrida de referencia** con el prompt anterior y este mismo modelo, así que no afirmo una mejora global. EVP-193 midió otra versión del dataset con otro modelo. 39 críticos siguen en FAIL y 115 críticos con PASS mecánico requieren calificación humana (gate de `evals/README.md`).
  - Se ajustaron además 5 casos que todavía exigían informar estado o condiciones: CRM-008, RIO-004 y SEARCH-003 ("reservado"), DATA-032 ("30") y SEARCH-062 ("36").
- **Revisión `llm-security-reviewer`** (subagente, solo lectura, sobre el primer diff). Hallazgos y resultado:
  - Altos, corregidos:
    - el bypass de la primera excepción ("Hay muy buena disponibilidad del 12A y un asesor te confirma la visita"), resuelto con la lista permitida;
    - los precios sin moneda tomados de la descripción o del conocimiento, resuelto con `priceNumbers()`.
  - Medios, corregidos:
    - financiación, descuento o comparación de precio sin cifras;
    - frases de disponibilidad no detectadas;
    - derivaciones válidas que quedaban bloqueadas ("un asesor te confirma si…", "tu disponibilidad horaria").
  - Verificado por el revisor:
    - las tools que escriben no devuelven inventario, así que una ejecución repetida no trae un precio viejo;
    - el copiloto pasa por la misma guardia.
  - Sin corregir: ver la sección 5.
- No hace falta `tenant-isolation-reviewer`: el diff no cambia queries por tenant, policies ni cachés.

## 5. Pendientes y riesgos

- **Flag por proyecto** "mostrar cotización y cuotas" en el panel, con columna, SQL y UI: ticket nuevo. Hoy ningún llamador enciende `financingAllowed`.
- **Decisiones tomadas por el usuario (2026-11-25):**
  - el copiloto (borradores para el asesor) sigue las mismas reglas: sin cambio de código;
  - descuentos y gastos de escritura cuentan como cotización y se bloquean: sin cambio de guardia; prompt explícito y caso DATA-056;
  - no se confirma ni se niega la disponibilidad de una unidad: la guardia bloquea también la negativa (sección 2) y se agregó DATA-055. Las corridas contra Gemini de la sección 4 son anteriores a este ajuste.
- **Acceso del cliente al widget en staging:** con login (credenciales provistas por Eversys), en un ticket aparte ligado a EVP-201.
- **Límite léxico:** "Sí, ese es el precio" o un "Sí" suelto después de "¿está disponible?" no los detecta la guardia; dependen del prompt y de los evals. "No sé si quedan pocas unidades" se bloquea (falla cerrada). En el resumen de contacto, la "Consulta" puede repetir un monto que dijo el visitante.
- **Código muerto:** el parámetro `$prices` de `check()` llega siempre vacío. Se mantuvo para no reescribir unas 80 llamadas de los tests; se puede quitar en una limpieza.
- **Evals:** falta la calificación humana de los críticos y una corrida de referencia del prompt anterior con el mismo modelo, para comparar las derivaciones.
- **Fuentes con financiación:** el modelo a veces copia cuotas o descuentos de una fuente aprobada. Hoy lo frena la guardia y la conversación pasa a un asesor. Una alternativa más limpia, para otro ticket, es no mostrarle al modelo los fragmentos de financiación mientras el proyecto no la autorice.
- **Integración:** EVP-201 depende de este ticket mergeado en develop y desplegado en staging, con la api, que hoy está en el merge #165, en el mismo commit que los workers.
- PR #178 abierto hacia `develop` con autorización del usuario. Sin merge ni despliegue: el merge lo decide una persona y la activación en staging se hace en EVP-201.
