# EVP-113 — Citas internas y control de condiciones comerciales

Rama `ticket/EVP-113-citas-y-control-de-terminos` · base develop `81de372` · sin commits todavía (cambios en la carpeta de trabajo) · fecha 2026-11-14 · agente `agent-runtime-engineer` (Claude) para Ramiro Ruggeri

## 1. Qué pedía el ticket

- Que el cliente nunca vea identificadores internos: el prompt pide citar `[fuente: id]` y esa marca no puede llegar al canal ni al borrador del copiloto.
- Que el asistente no pueda prometer condiciones comerciales (cuotas, descuentos, anticipos, tasas, plazos de financiación) sin respaldo en una fuente aprobada del turno.
- Violaciones: `UNKNOWN_SOURCE` (se cita algo que no se recuperó en el turno) y `UNSUPPORTED_TERM` → aviso fijo y derivación; en copiloto, `UNSAFE_DRAFT`.

Fuera de alcance: mostrar `cited` en la vista de traza (EVP-24); detectar ids sueltos que no sean de fuentes del turno.

## 2. Qué se implementó

**Decisiones de producto (tomadas, reversibles):**
- Un asesor puede editar la descripción de una propiedad sin aprobación, así que las descripciones **no respaldan condiciones comerciales**. La evidencia de términos es solo el conocimiento aprobado del turno: extracto **y encabezado**. Los precios estructurados de Inventory siguen respaldando montos como antes.
- El cliente recibe el texto **original** (por ejemplo "m²", "3º"), nunca la copia normalizada. El guard controla exactamente `canonical(original limpio y truncado)`.

### `OutputGuard` (`everprop-api/app/Domain/AgentRuntime/Coordinator/OutputGuard.php`)

- `visible()` (`:278`): sobre el original quita todo `\p{Cf}` (soft hyphen, ancho cero, controles bidi U+202A–202E, U+2066–2069, U+200E/F, U+061C, etiquetas U+E00xx), U+034F y selectores de variación. Conserva U+200D y U+FE0F solo dentro de secuencias de emoji. U+3164, U+115F, U+1160, U+FFA0 y U+2800 pasan a ser un espacio.
- `canonical()` (`:293`): lo que leen los controles. Aplica `visible()`, después NFKC y después pasa dígitos de cualquier alfabeto a ASCII con `IntlChar::digit`. Un dígito ilegible o UTF-8 inválido es error.
- `check()` (`:101`):
  - Recibe `requested`: texto del visitante que solo vale como evidencia para el valor `Consulta` del resumen de contacto.
  - Lee cada elemento de evidencia hasta 4.000 caracteres (`EVIDENCE_CHARS`, `:62`).
  - Si algún regex falló, agrega `GUARD_ERROR`.
- `ok()`/`matches()`: todo `preg_*` del guard pasa por acá; un `false`/`null` marca `$broken` y el resultado es `GUARD_ERROR`, nunca "ok".
- `citations()` (`:172`): devuelve el texto a enviar.
  - Trabaja sobre el **original**, después de `visible()`.
  - Busca el corchete más interno, ASCII o de ancho completo (`OPEN`/`CLOSE`/`BRACKETED`, `:48`–`:56`), con el énfasis alrededor si es igual de los dos lados ("**[fuente: F1]**"), y después uno cortado al final.
  - Si es una marca o no lo decide `markIds()` (`:257`) sobre su forma NFKC. Cuentan `[fuente: F1]`, `[fuente F1]`, `[source: F1]`, `[F1]`, `(fuentes: a; b)` y `［ｆｕｅｎｔｅ： Ｆ１］`; "(ver condiciones)" o "[fuente de agua]" son texto común.
  - Quita marcas y restos (`[]`, `()`, `[** **]`, espacios) **en bucle hasta que no cambie**, así limpiar un texto limpio no lo cambia.
  - Resuelve ids sin distinguir mayúsculas: alias `F1`…`Fn` → `source_id` del turno, o el `source_id` largo si coincide.
- `leftover()` (`:217`): falla cerrada sobre `canonical(enviado)`.
  - Cuenta `fuente:`/`source:` seguido de algo con forma de alias, UUID o `#N`, y cualquier `source_id`/UUID de fuente del turno.
  - "Fuente: Instagram" o "Residencia La Fuente: 2 amb" son texto común.
- `commits()` (`:233`): `acord|ofrec|otorg|aprob|garantiz|reservad`, "precio final" y "te damos/hacemos/dejamos" → `COMMITMENT_CLAIM` en la `Consulta` del resumen.
- `NUMBERS` (`:68`) y los patrones de `terms()`: cuantificadores posesivos (ReDoS). `percentKind()` mira ventanas acotadas de 400 bytes enteros (`mb_strcut`, `:406`), así que no recorre todo el texto en cada porcentaje.
- `unsupportedTerms()` (`:333`): cada par de la respuesta tiene que estar igual en la evidencia. Un `%` sin tipo solo pasa si la evidencia tiene el mismo número **también sin tipo**.
- `terms()` (`:359`) extrae pares `número|tipo`:
  - `cuotas`:
    - número antes del sustantivo, con hasta dos palabras entre medio que no sean preposiciones ni artículos (`INSTALLMENTS` `:82`, `FILLER` `:85`), y `cuot\p{L}*`: "36 cuotas", "36 cuotitas", "36 cómodas cuotas";
    - "en 36 veces";
    - sustantivo primero: "Cuotas: 48", "Cantidad de cuotas: 36", "12 cuotas sin interés o en 24".
  - porcentajes por tipo con `percentKind()` (`PERCENT_KIND`, `:79`):
    - `descuento`: descuento, bonificación, ahorro, rebaja, promo, off;
    - `anticipo`: anticipo, entrega, seña;
    - `tasa`: interés, tasa, TNA, TEA, CFT.
  - palabra clave primero, con o sin ":" ("Anticipo: 30", "Anticipo 30"), y "0 de anticipo".
  - ceros (`:375`–`:379`): "sin interés(es)", "tasa cero", "interés cero" y "sin recargo" son `0|tasa`; "sin anticipo/entrega/seña" es `0|anticipo`.
  - `meses`:
    - "36 meses", "3 años" (= 36), "Plazo: 60", "saldo a 48", "resto en 48", "financiamos 48" (`:446`);
    - solo en una oración de financiación o pago o en la siguiente (`FINANCING`, `:76`, que incluye abon, sald, resto, escritur, "te lo dej…", interés, tasa, TNA, TEA, plan, mensual y "% de entrega"/"entrega inicial").
  - "36 (treinta y seis) cuotas": se descarta la copia entre paréntesis.
  - Comentario `ponytail:` (`:353`): es un control léxico.

### `AgentCoordinator` (`everprop-api/app/Domain/AgentRuntime/Coordinator/AgentCoordinator.php`)

- `converse()` (`:217`): `$trace['knowledge']` es `encabezado: extracto`, lo mismo que ve el modelo.
- `collectPrices()` (`:333`): se revirtió `collectEvidence`/`facts`; los resultados de herramientas solo aportan precios.
- `screen()` (`:357`): única salida hacia `deliver` y hacia el borrador.
  - **Respuesta común:** original sin marcas → truncar a `reply_max_chars` → `leftover()` (`:380`) → `check()` del mismo texto. En `cited` quedan solo `source_id` del turno.
  - **Resumen de confirmación de contacto:** sale byte a byte, para que `bind()` lo encuentre. `ContactConfirmation::request()` (`:372`) lo separa en el valor `Consulta` y el resto.
    - El resto se controla sin evidencia del visitante; por eso un nombre como "Ana 36 cuotas" da `UNSUPPORTED_TERM`.
    - La `Consulta` se controla con los mensajes del visitante de este turno y el anterior (`array_slice(..., -2)`, `:377`) y con `commits()`.
    - Cualquier marca o resto de cita en el resumen es `UNKNOWN_SOURCE` (`:373`).
- `finalText()`: ya no trunca; lo hace `screen()` después de limpiar.

### Herramientas y prompt

- `ContactConfirmation` (`everprop-api/app/Domain/AgentRuntime/Tools/ContactConfirmation.php`):
  - `requireConfirmed()` (`:77`): limpia `notes` y `contact_name` con `citations()` (sin marcas ni invisibles) antes de guardar la propuesta, armar el resumen y compararla al confirmar.
  - `request()` (`:139`): devuelve el valor `Consulta` (entre comillas JSON y en su propia línea, así ningún otro campo lo puede imitar) y el resto del resumen.
- `RegistrarContacto` (`everprop-api/app/Domain/AgentRuntime/Tools/RegistrarContacto.php:92`): lo que se guarda en el lead lleva el mismo prefijo que `registrar_interes`, `[Asistente, dicho por el visitante] `.
- `DerivarAAsesor` (`everprop-api/app/Domain/AgentRuntime/Tools/DerivarAAsesor.php:34`): deriva solo excepciones comerciales **no publicadas**; los descuentos y las condiciones publicados se informan.
- `PromptBuilder` (`everprop-api/app/Domain/AgentRuntime/Coordinator/PromptBuilder.php`):
  - fuentes como `<fuente id="F1">` (`:25`);
  - regla 2 (`:36`): solo fuentes aprobadas, las descripciones no sirven, lo publicado se informa, las marcas van solo en la respuesta y nunca en argumentos de herramientas, y las cifras del cliente solo van en `notes` como pedido suyo;
  - regla 4 (`:38`): `notes` con palabras del cliente, nunca ofrecer, acordar ni confirmar condiciones;
  - regla 5 (`:39`): deriva lo no publicado.
- `config/agent.php`: `prompt_version` `coordinator-2026-11-14.1`.
- Evals: `tests/Feature/Evals/ModelEvalTest.php:383` acepta `description` en fixtures de propiedades; nuevo `DATA-037`. Dataset: 213 casos.
- Documentación: `docs/eversys-conversations/implementation-status.md:47`, `evals/README.md:9`.

Sin cambios de esquema ni variables nuevas.

### Flujo

1. Modelo → `finalText()` → `screen()`.
2. `citations()` sobre el original: `visible()`, quitar marcas en bucle y resolver alias.
3. Según el caso:
   - respuesta común: truncar, `leftover()` y `check()`;
   - resumen de contacto: sin tocar, `check()` del resto y `check()` + `commits()` de la `Consulta`.
4. Si hay violación o `GUARD_ERROR`: aviso fijo y derivación (en copiloto, `UNSAFE_DRAFT`).

## 3. Por qué esta solución

- Se reutilizó `OutputGuard` (montos, links, pagos, visitas), `wordsToDigits()`, el resumen de `ContactConfirmation`, el prefijo de notas de `RegistrarInteres` y el único punto de salida del coordinador; no hay tablas, servicios ni dependencias nuevas.
- **Descripciones fuera de la evidencia:** las edita un asesor sin aprobación. Si Producto lo revierte, alcanza con volver a pasar valores de herramientas como evidencia en `screen()`, pero antes hace falta aprobar descripciones.
- **Original en lugar de NFKC:** el cliente ve "m²". Controlar `canonical()` del texto que efectivamente sale evita mapear posiciones entre dos copias. Quitar del original los caracteres invisibles hace que lo que se ve y lo que se controla sean los mismos caracteres.
- **Alias cortos en lugar de UUID:** el modelo copia mejor `F1` y el id interno ya no está en el prompt. Se acepta igual el `source_id` largo correcto.
- **Resumen de contacto:** solo su `Consulta` repite el pedido del visitante, y solo ahí valen sus palabras de este turno y el anterior. Nunca puede estar redactada como oferta.
- **Otras simplificaciones:**
  - "36 (60) cuotas" solo controla el 60.
  - "Entrega" cuenta como financiación solo en "N % de entrega" o "entrega inicial"; "entrega 2027" se lee como fecha.
  - Un paréntesis con la palabra "fuente" sola ("(fuente)") se toma como marca y se quita.
  - Las secuencias de bandera con etiquetas (U+E00xx) pierden las etiquetas.
  - En una `Consulta` con marco de pedido, "confirm…" y "disponible" no cuentan como compromiso ("Consulta si está disponible el lote 12A" se registra); sin marco siguen bloqueando (`commits()`, `OutputGuard.php:237`).
  - Solo en el texto a enviar (no en la evidencia) fallan cerrado un número con marca, dos dígitos separados por un espacio no ASCII y una palabra que mezcla alfabetos: un precio escrito "85 000" con espacio fino también deriva.

### Límite conocido del control léxico

`OutputGuard` es un control léxico (`ponytail:` en `OutputGuard.php:353`): ninguna lista de patrones cubre toda paráfrasis de una promesa comercial. **La red de seguridad es la evaluación con el modelo real (Q01)** antes de cambiar prompt o modelo; la mejora posible es una lista revisada de redacciones sacadas de trazas reales. Casos conocidos que este control **no** detecta y que Q01 tiene que cubrir:

- `Cuotas = 36`, `Cuotas (36)`, `Cuotas → 36`, `cuotas… 36` (conectores que no son ":", "de" o "hasta").
- `Lo cancelás en 36 meses`, `Lo terminás de pagar en 3 años`, `en 36 meses lo tenés pago` cuando ninguna palabra de la oración ni de la anterior es de financiación.
- `36 cuotas` escrito con letras que no son número ni romano en mayúsculas (`xxxvi cuotas`, `trentiséis`), o palabras enteras en otro alfabeto que imitan "cuotas" sin mezclar con el latino.
- Porcentajes sin "%" ni palabra clave (`te sacamos 30 puntos`, `pagás 70 de cada 100`).
- Promesas sin cifras (`te armamos un plan a medida`, `seguro conseguimos financiación`), que no tienen un número para comparar.
- Cifras repartidas en mensajes o en imágenes, y tablas que no siguen el formato Markdown `| a | b |`.

## 4. Cómo se verificó

Contenedor `everprop-rag-php` (PHP 8.4, MySQL de pruebas), proveedor LLM simulado (`ScriptedLlm`), sin red ni proveedores reales.

- Asistente: `php artisan test tests/Unit/AgentRuntime tests/Feature/AgentRuntime` → **264 passed (1143 assertions)**. Antes del ticket: 154.
- Suite completa: `php artisan test` → **730 passed, 1 skipped, 1 failed (5919 assertions)**, 252,2 s. La falla fue `Tests\Feature\CRM\ReleaseSchemaTest` ("extensions can be repeated…"), ajena a este ticket: la base es compartida con otro agente. Repetida una vez sola → **1 passed (13 assertions)**. Corrida en la tercera ronda; el ajuste final (marco de pedido en `commits()` y test del punto 7) se verificó con AgentRuntime, Pint y PHPStan.
- `vendor/bin/pint --test` → PASS (347 archivos).
- `vendor/bin/phpstan analyse --memory-limit=1G` → `[OK] No errors`.
- `node evals/validate.mjs` → OK, 213 casos (current-data 37, security 44, rioplatense 22).
- ReDoS:
  - **Antes:** con el `NUMBERS` anterior, `preg_match_all` devolvía `false` ("Backtrack limit exhausted"), con JIT y sin JIT, en 26 "1," antes de "36 cuotas, 30% de descuento, 48 meses de financiación, 45 % TEA" y en 1..30 separados por coma.
  - **Ahora:** esas mismas entradas dan `UNSUPPORTED_TERM`, sin `GUARD_ERROR`.

### Primera revisión (llm-security y tenant-isolation): qué cambio cerró cada hallazgo

| Hallazgo | Cambio | Test |
|---|---|---|
| 1 ReDoS / falla abierta | `NUMBERS` posesivo; `ok()`/`matches()` → `GUARD_ERROR` | `test_long_number_lists_cannot_make_the_guard_fail_open`, `test_a_failing_regex_fails_closed` |
| 2 formas no detectadas | patrones con el sustantivo primero, `FINANCING` y oración anterior, invisibles, copia entre paréntesis | `OutputGuardTest::terms` ("noun first" … "full width digits") |
| 3 `%` por tipo | `percentKind()` | `OutputGuardTest::terms` (descuento, anticipo, tasa, "70 % de avance") |
| 4 resumen de contacto | `notes` limpias en `requireConfirmed()`; el resumen sale byte a byte con `requested` | `test_the_contact_summary_repeats_the_visitors_request_but_never_an_invented_term` |
| 5 citas robustas | limpieza antes de truncar, en bucle, restos, falla cerrada | `OutputGuardTest::citations` |
| 6 alias | `F1`…`Fn` en el prompt, traducción en el servidor | `OutputGuardTest::citations`, `CopilotTest` (`F2` inexistente) |
| 7 prompt | reglas 2 y 5 | — |
| 8 dos tenants / turnos | — | `test_sources_back_terms_only_for_their_own_tenant_and_turn` |
| 9 evals/tests de descripciones | evidencia sin descripciones; `DATA-037` | `test_a_property_description_never_backs_a_commercial_term` |

### Segunda revisión: qué cambio cerró cada hallazgo

| Hallazgo | Cambio | Test |
|---|---|---|
| Decisión NFKC | se envía el original limpio y truncado; `visible()`; `canonical()` del enviado; marcas buscadas sobre el original con variantes de ancho completo; `leftover()` sobre `canonical(enviado)` | `OutputGuardTest::citations` ("original characters are sent", "invisible characters go, emoji stay", "full width") |
| 1 ALTO frases comunes | ceros de tasa y anticipo, `cuot\p{L}*`, relleno y "veces", `FINANCING` ampliado, "saldo a N"/"financiamos N", `PERCENT_KIND` con ahorro, rebaja, promo y off, `%` sin tipo solo con `%` sin tipo, dígitos de otros alfabetos; `ponytail:` | `OutputGuardTest::terms` (de "interests plural" a "arabic digits") |
| 2 MEDIO invisibles | `visible()` en el original y en `canonical()` | casos "left-to-right mark", "mark inside interest free", "right-to-left override", "invisible separator and grapheme joiner", "tag and hangul filler" |
| 3 MEDIO resumen | `request()` + `requested` solo en `Consulta` y con 2 mensajes; `commits()` → `COMMITMENT_CLAIM`; `contact_name` limpio; prefijo en `RegistrarContacto` | `test_the_contact_summary_repeats_the_visitors_request_but_never_an_invented_term` (acuerdo con "precio final", "Te ofrecemos 36/60 cuotas", nombre "Ana 36 cuotas", PERSISTED con prefijo), `test_notes_that_read_as_an_offer_are_commitments` |
| 4 MEDIO limpieza no idempotente | bucle de marcas + restos hasta que no cambie | `test_cleaning_a_clean_text_changes_nothing` (`(**[fuente: F1]**)`, `[** **]`, `[fuente[]: F1]`); Feature: `notes` con `(**[fuente: F1]**)` + "sí" → PERSISTED |
| 5 MEDIO dos tenants | — | `test_another_tenants_conversation_and_sources_back_nothing` (pedido del visitante de B, alias sin fuentes en A); `CopilotTest` (A cita el `source_id` de B → `UNSAFE_DRAFT`, `cited=[]`) |
| 6 BAJO | posesivos en los patrones de `terms()`, evidencia hasta 4.000 caracteres, ventanas de `percentKind()`; marcas `[fuente F1]`, `[source: F1]`, `*[…]*`, `[F1]`; `leftover()` solo con forma de id; `DerivarAAsesor` y reglas 2 y 4 coherentes | `OutputGuardTest::citations`, `test_leftover_marks_and_source_ids_fail_closed_but_ordinary_text_does_not` |

### Tercera revisión (verificación final): qué cambio cerró cada hallazgo

| Hallazgo | Cambio | Test |
|---|---|---|
| 1 ALTO Markdown/WhatsApp | en la copia que lee `terms()` (nunca en lo enviado): asteriscos, guiones bajos, virgulillas, comillas invertidas, barras verticales, `\p{So}` y `\p{Sk}` → espacio, "N-cuotas" → "N cuotas", filas de tabla como "Encabezado: celda." (`OutputGuard.php:361`, `tables()` `:454`); `percentKind()` lee esa misma copia | `OutputGuardTest::terms` ("bold number" … "formatted reply backed by a plain source"); Feature: nombre "Ana *48* cuotas" → `UNSUPPORTED_TERM` |
| 2 MEDIO dígitos con marcas | keycaps `(\d)\x{FE0F}?\x{20E3}` → dígito, conservando el emoji en lo enviado (`visible()` `:278`, `canonical()` `:295`); en el texto a enviar, `\p{N}\p{M}` y dígitos separados por U+00A0/U+202F/U+2009 → `GUARD_ERROR` (`:296`) | casos "keycaps"; `test_digit_tricks_and_homoglyphs_in_the_reply_fail_closed` (`3̲6̲`, `3́6`, `3\u{202F}6`) |
| 3 MEDIO homoglifos | `٪ ﹪ ％` → `%` (`:316`); palabra que mezcla latino con otro alfabeto en el texto a enviar → `GUARD_ERROR` (`:317`); romanos `[IVXLC]{2,}` (y `Ⅰ`–`Ⅻ` vía NFKC) antes de un sustantivo de financiación → número (`:366`, `roman()` `:481`) | `test_digit_tricks_and_homoglyphs_in_the_reply_fail_closed` (`cuоtas` cirílica, `cuοtas` griega); casos "arabic percent", "roman numerals", "roman numeral sign" |
| 4 MEDIO `Consulta` | la evidencia del visitante vale solo si la `Consulta` tiene marco de pedido (`asks()` `OutputGuard.php:246`, `AgentCoordinator.php:375`–`:377`); `commits()` (`:237`) suma corresp, vigent, aplic, inclu, acced, habilit y conced siempre, y confirm y disponible solo sin marco de pedido | Feature: "Quiere pagar en 36 cuotas", "Consulta si está disponible el lote 12A" y "Pregunta si se puede confirmar una visita" → PERSISTED; "Disponible y confirmado para vos", "Le corresponden…, confirmadas", "Condición vigente…", "Aplica…" e "Incluye…" → bloqueados; `test_notes_that_read_as_an_offer_are_commitments` |
| 5 MEDIO falsos positivos | `%` sin tipo es término solo con financiación en su oración (`:409`); "tiene/antigüedad N años" no es plazo (`:434`); `mensual(?!mente)` en `FINANCING` (`:76`); la oración anterior no arrastra si la actual habla de obra, entrega o posesión (`:427`); "entrega 19xx/20xx" es fecha (`:363`) | casos "progress of works", "share of units sold", "age of a company", "monthly is not financing", "handover after installments", "handover year" |
| 6 BAJO redacciones | "sin costo financiero", "no tienen / libres de interés" → `0|tasa` (`:375`); "no hace falta / requiere / lleva anticipo" → `0|anticipo` (`:378`); `ctas?` en `INSTALLMENTS` (`:82`); "x36" (`:393`); "N veces" en oraciones de financiación (`:440`). Lo no cubierto está en "Límite conocido del control léxico" | casos "no financial cost" … "times without en" |
| 7 BAJO resumen | todos los valores del resumen (incluidos `display_name` y el título de la propiedad) pasan por `citations()`/`visible()` (`ContactConfirmation.php:120`) | `AgentTurnTest::test_the_summary_never_shows_invisible_characters_of_names_or_property_titles` (nombre con U+202E y título con U+200B → el resumen enviado no los contiene) |

Revisiones obligatorias: este cambio toca prompts, salidas del modelo, RAG y consultas tenant-scoped. **Requiere una nueva pasada de `llm-security-reviewer` y `tenant-isolation-reviewer`** sobre esta versión. Los evals con modelo real no se corrieron (sin proveedores reales); el cambio de prompt exige correrlos con `eval-engineer` antes de habilitarlo en staging.

## 5. Pendientes y riesgos

- Mostrar `cited` en la vista de traza (EVP-24).
- Ids sueltos que no son fuentes del turno (por ejemplo, un UUID de otro tenant sin marca) no se detectan.
- Correr los evals con el modelo configurado (Q01): es la red de seguridad del control léxico.
- Falsos positivos posibles (derivan, no mienten): ver la sección 3.
- Decisión sobre descripciones: reversible; si Producto quiere que respalden condiciones, hace falta antes un flujo de aprobación de descripciones.
