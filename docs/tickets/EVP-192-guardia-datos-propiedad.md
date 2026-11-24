# EVP-192 — Guardia determinista de datos de propiedad en `OutputGuard`

Rama `ticket/EVP-192-guardia-datos-propiedad` (desde `develop` `9d46f63`, cambios locales sin commitear) · fecha 2026-11-23 · autor: equipo de desarrollo y revisión con agente IA.

> [!NOTE]
> **Jira (`TICKETS.md` §0):** `EVP-192` verificado *En curso* el 2026-11-24; pasa a *En revisión* al abrir el PR.

---

## 1. Qué pedía el ticket

Evitar que el asistente conversacional (tanto respuestas enviadas al canal como borradores de copiloto) invente o cruce datos de propiedades no respaldados por la evidencia del turno:

- Cantidades y superficies (`dormitorios`, `baños`, `ambientes`, `m²`/`hectáreas`), incluso expresadas como números sueltos en respuestas elípticas (`"Tiene 3."`), palabras o tablas Markdown.
- Códigos de unidad no devueltos ni mencionados por el visitante (`UNSUPPORTED_UNIT`).
- Afirmaciones de disponibilidad (`disponible`, `a la venta`, `"no está vendido"`) o no disponibilidad (`vendido`, `"no está disponible"`) desligadas de las unidades efectivamente devueltas o reportadas como `NOT_FOUND` en el turno (`UNSUPPORTED_AVAILABILITY`).
- Fechas y plazos de entrega (`UNSUPPORTED_DATE`) que no provengan de oraciones de entrega de la evidencia.
- Ubicaciones del catálogo del tenant (`UNSUPPORTED_LOCATION`) y amenities/servicios (`UNSUPPORTED_AMENITY`) sin respaldo de la unidad o su fuente.
- Incorporar 9 casos en el dataset de evaluación (`DATA-038` a `DATA-046`) y cerrar todos los hallazgos de aislamiento entre tenants y de las pasadas de `llm-security-reviewer`.

**Fuera de alcance:** afirmaciones puramente cualitativas sin cifras ni términos reconocibles (`"luminoso"`, `"cerca del centro"`), lugares fuera del catálogo del tenant, features fuera de `AMENITIES`, y medición con el modelo real en Etapa 2 (`EVAL_LLM=configured`, que requiere autorización aparte).

---

## 2. Qué se implementó

### Piezas modificadas

- **`everprop-api/app/Domain/AgentRuntime/Coordinator/OutputGuard.php`**:
  - `check()` ([OutputGuard.php:113](file:///c:/Users/usuario/Documents/EverSys/Proyectos/EverProp/repo/everprop-api/app/Domain/AgentRuntime/Coordinator/OutputGuard.php#L113)): recibe `$facts`, `$inventoryChecked`, `$locations`, `$notFound`, `$serverTexts` y `$factsText` (para el resumen de contacto).
  - `canonical()` ([OutputGuard.php:307](file:///c:/Users/usuario/Documents/EverSys/Proyectos/EverProp/repo/everprop-api/app/Domain/AgentRuntime/Coordinator/OutputGuard.php#L307)): normalización NFKC fail-closed ante marcas Unicode (`\p{Mn}`), homógrafos mixtos o letras latinas fuera de `[A-Za-z\x{00C0}-\x{00D6}\x{00D8}-\x{00F6}\x{00F8}-\x{00FF}]` (acepta nombres propios reales como `Gonçalves`, `João`, `Zoë` sin abrir `ı`, `ɑ` ni versalitas).
  - `termsAndOffsets()` ([OutputGuard.php:373](file:///c:/Users/usuario/Documents/EverSys/Proyectos/EverProp/repo/everprop-api/app/Domain/AgentRuntime/Coordinator/OutputGuard.php#L373)) y `moneyMatches()` ([OutputGuard.php:1572](file:///c:/Users/usuario/Documents/EverSys/Proyectos/EverProp/repo/everprop-api/app/Domain/AgentRuntime/Coordinator/OutputGuard.php#L1572)): unifican la limpieza de Markdown/emojis (`/[\*_~`|\p{So}\p{Sk}]/u`) y devuelven los offsets exactos registrados para montos y condiciones comerciales; `wordsToDigits()` ([OutputGuard.php:1627](file:///c:/Users/usuario/Documents/EverSys/Proyectos/EverProp/repo/everprop-api/app/Domain/AgentRuntime/Coordinator/OutputGuard.php#L1627)) colapsa espacios múltiples antes de `mil`/`millones` para que símbolos intermedios (`90 💵 mil`) no rompan el control de montos.
  - `unsupportedFacts()` ([OutputGuard.php:600](file:///c:/Users/usuario/Documents/EverSys/Proyectos/EverProp/repo/everprop-api/app/Domain/AgentRuntime/Coordinator/OutputGuard.php#L600)):
    - Lista blanca numérica por segmento: todo número sin cobertura de `moneyMatches()`, `termsAndOffsets()`, fecha/plazo de entrega validada o código de unidad se evalúa contra la evidencia del turno.
    - Evidencia aislada por unidad: campos estructurados (`bedrooms`, `bathrooms`, `area_m2`) tienen precedencia sobre `description` y sobre el conocimiento; los fragmentos de `knowledge` se filtran por `codeFold` o `project` cuando hay unidad en foco.
    - `segments()` ([OutputGuard.php:911](file:///c:/Users/usuario/Documents/EverSys/Proyectos/EverProp/repo/everprop-api/app/Domain/AgentRuntime/Coordinator/OutputGuard.php#L911)): separa oraciones, líneas, preguntas `¿…?` (incluso sin espacio tras `?` o `!`), listas numeradas (`1. Lote 12A` sin cortar en `1.`) y cláusulas finales con `?` sin `¿` tras coma o conjunción (`pero|aunque|y|o`).
    - `ECHO_FRAME` acotado: las palabras del visitante solo respaldan hechos dentro de preguntas reales o dentro del sintagma gobernado por marcos explícitos (`No encontré…`, `Busco…`), excluyendo muletillas (`no hay problema/drama/inconveniente`, `no sé si`, `si querés`, `si te interesa`) y cortando en `[,;:]`, `pero|aunque|sino|porque|ya que|así que|por eso|además|y <verbo>`.
    - Sujetos plurales, `EVERY` y elipsis (`A3`/`A4`): agrupa menciones contiguas antes de verbos plurales (`tienen`, `miden`, `poseen`, etc.), evalúa `EVERY` (`ambos`, `los dos`, `las 2 unidades tienen...`), exige todas las unidades cuando hay >1 devuelta sin código, re-evalúa elipsis (`también`, `igual`, `lo mismo`, `ídem`) dentro del segmento y entre segmentos (incluso tras encabezados intermedios), y limpia `$current` ante referencias sin código (`otra opción`, `otra alternativa`).
    - `claims()` ([OutputGuard.php:948](file:///c:/Users/usuario/Documents/EverSys/Proyectos/EverProp/repo/everprop-api/app/Domain/AgentRuntime/Coordinator/OutputGuard.php#L948)) y `askedKindFromMessages()` ([OutputGuard.php:1140](file:///c:/Users/usuario/Documents/EverSys/Proyectos/EverProp/repo/everprop-api/app/Domain/AgentRuntime/Coordinator/OutputGuard.php#L1140)): detecta tipo (`KINDS` y rótulos en listas y tablas transpuestas `Dormitorios — 12A: 2.`) **antes** de filtrar años; saltea montos/términos únicamente por los offsets reales de `moneyMatches()` y `termsAndOffsets()`; hereda el tipo de la repregunta en los últimos 3 mensajes del visitante.
    - `availability()` ([OutputGuard.php:1333](file:///c:/Users/usuario/Documents/EverSys/Proyectos/EverProp/repo/everprop-api/app/Domain/AgentRuntime/Coordinator/OutputGuard.php#L1333)): evalúa `POSITIVE` y `NEGATIVE` juntos por segmento; trata participios negados (`no/ni/tampoco está/fue/figura vendido/alquilado/ocupado`, `no/ni/tampoco se vendió`) como `POSITIVE`; y cuando no se nombra unidad, hereda como `$about` las unidades pedidas en el último mensaje del visitante.
    - `unsupportedDates()` ([OutputGuard.php:1186](file:///c:/Users/usuario/Documents/EverSys/Proyectos/EverProp/repo/everprop-api/app/Domain/AgentRuntime/Coordinator/OutputGuard.php#L1186)) y `periods()` ([OutputGuard.php:1226](file:///c:/Users/usuario/Documents/EverSys/Proyectos/EverProp/repo/everprop-api/app/Domain/AgentRuntime/Coordinator/OutputGuard.php#L1226)): cubren `3-2027`, `año y medio`, estaciones, `estará lista`, `se terminó`, `posesión/entrega (es) inmediata` y usan `hasWord` para `WHEN` (`mayo` no matchea `mayor`).
    - `affirmed()` ([OutputGuard.php:1168](file:///c:/Users/usuario/Documents/EverSys/Proyectos/EverProp/repo/everprop-api/app/Domain/AgentRuntime/Coordinator/OutputGuard.php#L1168)) y `AMENITIES` ([OutputGuard.php:537](file:///c:/Users/usuario/Documents/EverSys/Proyectos/EverProp/repo/everprop-api/app/Domain/AgentRuntime/Coordinator/OutputGuard.php#L537)): separan `servicios`, `gas`, `agua` (`(?<!vista\sal\s)`) y `luz` (`(?!\s++natural)`), suman diminutivos (`cocherita`, `terracita`) y negaciones de hasta 8 palabras (`sin servicios de agua, cloacas, asfalto ni gas`, `no dispone de cochera`).
    - `unitMentions()` ([OutputGuard.php:1277](file:///c:/Users/usuario/Documents/EverSys/Proyectos/EverProp/repo/everprop-api/app/Domain/AgentRuntime/Coordinator/OutputGuard.php#L1277)): excluye acrónimos no unitarios (`RN9`, `3D`, `2D`, `4K`, `Q1`–`Q4`, `T1`–`T4`), soporta listas tras artículo (`el 12, el 12A`) y códigos en minúscula en listas (`12c y 14d`). En una lista tras sustantivo (`Lote 12A, 85 m2`), un número seguido de un tipo (con decimales `80.50`/`80,50`) es un dato, no otro código: se chequea contra la unidad.
    - `SCARCITY` ([OutputGuard.php:39](file:///c:/Users/usuario/Documents/EverSys/Proyectos/EverProp/repo/everprop-api/app/Domain/AgentRuntime/Coordinator/OutputGuard.php#L39)): escasez y demanda inventadas (`la última unidad`, `quedan pocas`, `se vende rápido`, `alta demanda`) dan `UNSUPPORTED_AVAILABILITY` salvo que una fuente aprobada diga lo mismo; ninguna herramienta devuelve stock. `availability()` suma paráfrasis positivas (`nadie lo compró`, `todavía no lo reservaron`, `es tuyo`, `lo podés reservar/señar`).
- **`everprop-api/app/Domain/AgentRuntime/Coordinator/AgentCoordinator.php`**:
  - `collectFacts()` ([AgentCoordinator.php:396](file:///c:/Users/usuario/Documents/EverSys/Proyectos/EverProp/repo/everprop-api/app/Domain/AgentRuntime/Coordinator/AgentCoordinator.php#L396)): recolecta hechos estructurados/descripciones de herramientas de inventario y valida el formato de `unit_code` (`/^[a-z0-9\-\/.\s]{1,32}$/i`) antes de registrarlo en `trace['not_found']`.
  - `locations()` ([AgentCoordinator.php:427](file:///c:/Users/usuario/Documents/EverSys/Proyectos/EverProp/repo/everprop-api/app/Domain/AgentRuntime/Coordinator/AgentCoordinator.php#L427)): consulta los lugares del tenant (`properties`, `projects` y `legacy_localities`) filtrados por `tenant_id`.
  - `screen()` ([AgentCoordinator.php:451](file:///c:/Users/usuario/Documents/EverSys/Proyectos/EverProp/repo/everprop-api/app/Domain/AgentRuntime/Coordinator/AgentCoordinator.php#L451)): pasa horarios como `$serverTexts`, respalda la propiedad pendiente del resumen como `summary_only`, usa fallback `?? $frame` ante error de regex, y valida la línea `Nombre:` por separado con `OutputGuard::check($nameLine, ..., locations: [])` para impedir contrabando de hechos/amenities/fechas/disponibilidad sin falsos positivos por apellidos.
- **Prompt, confirmación, evals y tests**:
  - [PromptBuilder.php](file:///c:/Users/usuario/Documents/EverSys/Proyectos/EverProp/repo/everprop-api/app/Domain/AgentRuntime/Coordinator/PromptBuilder.php) y [config/agent.php](file:///c:/Users/usuario/Documents/EverSys/Proyectos/EverProp/repo/everprop-api/config/agent.php) (`prompt_version` → `coordinator-2026-11-23.1`).
  - [ContactConfirmation.php](file:///c:/Users/usuario/Documents/EverSys/Proyectos/EverProp/repo/everprop-api/app/Domain/AgentRuntime/Tools/ContactConfirmation.php) (`pendingPropertyId()`).
  - [evals/cases/current-data.jsonl](file:///c:/Users/usuario/Documents/EverSys/Proyectos/EverProp/repo/evals/cases/current-data.jsonl) (`DATA-038` a `DATA-046`), [evals/README.md](file:///c:/Users/usuario/Documents/EverSys/Proyectos/EverProp/repo/evals/README.md), [ModelEvalTest.php](file:///c:/Users/usuario/Documents/EverSys/Proyectos/EverProp/repo/everprop-api/tests/Feature/Evals/ModelEvalTest.php) y [evaluation-and-security.md](file:///c:/Users/usuario/Documents/EverSys/Proyectos/EverProp/repo/docs/eversys-conversations/evaluation-and-security.md).
  - [OutputGuardTest.php](file:///c:/Users/usuario/Documents/EverSys/Proyectos/EverProp/repo/everprop-api/tests/Unit/AgentRuntime/OutputGuardTest.php), [AgentTurnTest.php](file:///c:/Users/usuario/Documents/EverSys/Proyectos/EverProp/repo/everprop-api/tests/Feature/AgentRuntime/AgentTurnTest.php) y [CopilotTest.php](file:///c:/Users/usuario/Documents/EverSys/Proyectos/EverProp/repo/everprop-api/tests/Feature/AgentRuntime/CopilotTest.php).

**Esquema y configuración:** sin scripts forward nuevos, sin nuevas dependencias ni nuevas variables de entorno.

---

## 3. Por qué esta solución

- **Reutilización:** se reutilizó la normalización existente (`canonical`, `wordsToDigits`, `tables`, `ok()` fail-closed) y los extractores propios de precios/términos (`moneyMatches`, `termsAndOffsets`) para generar los spans que `claims()` omite, evitando heurísticas duplicadas que se desincronizaban en montos con Markdown/emojis y plazos en oraciones sobre la obra.
- **Alternativas descartadas:**
  - *Lista negra de frases*: la primera revisión demostró que es fácil de eludir con paráfrasis rioplatenses naturales; una lista blanca numérica ligada a la evidencia por unidad corta el problema de raíz.
  - *Eximir porcentajes no financieros o años de trayectoria (`progress of works`, `share of units sold`, `age of a company`)*: bajo una lista blanca estricta, inventar `"70 % de avance"` o `"25 años de trayectoria"` sin respaldo debe bloquearse como `UNSUPPORTED_FACT` (manteniendo sin disparo `UNSUPPORTED_TERM`), por lo que se ajustaron esos 3 casos heredados de EVP-113 en [OutputGuardTest.php](file:///c:/Users/usuario/Documents/EverSys/Proyectos/EverProp/repo/everprop-api/tests/Unit/AgentRuntime/OutputGuardTest.php).
- **Límites conocidos (`ponytail:`):**
  - `AMENITIES` ([OutputGuard.php:534](file:///c:/Users/usuario/Documents/EverSys/Proyectos/EverProp/repo/everprop-api/app/Domain/AgentRuntime/Coordinator/OutputGuard.php#L534)): lista cerrada; un feature fuera de ella depende del prompt hasta ampliar vocabulario desde trazas.
  - Afirmaciones cualitativas ([OutputGuard.php:577](file:///c:/Users/usuario/Documents/EverSys/Proyectos/EverProp/repo/everprop-api/app/Domain/AgentRuntime/Coordinator/OutputGuard.php#L577)): adjetivos sin cifras ni términos (`"muy luminoso"`) ni lugares fuera del catálogo del tenant dependen del prompt y de la evaluación con modelo real.
  - `AgentCoordinator::locations()` ([AgentCoordinator.php:429](file:///c:/Users/usuario/Documents/EverSys/Proyectos/EverProp/repo/everprop-api/app/Domain/AgentRuntime/Coordinator/AgentCoordinator.php#L429)): lee las filas de ubicaciones del tenant en cada respuesta revisada (adecuado a escala actual; cachear por versión de inventario si crece).

---

## 4. Cómo se verificó

Todas las corridas finales se ejecutaron sobre el árbol definitivo en el contenedor `everprop-etapa1-php` (PHP 8.4, MySQL 8.4 y Redis locales del stack `everprop-etapa1`):

| Comprobación | Comando | Resultado |
|---|---|---|
| Suite completa API | `docker exec everprop-etapa1-php php artisan test` | Tras la revisión 4 (2026-11-24): **1052 passed** (7080 assertions), **2 skipped** y 1 fallo ajeno al ticket (`anonymous session creation is rate limited`, por correr otras pruebas en paralelo sobre el mismo Redis; pasa sola). Antes: **1041 passed**, **2 skipped** (benchmark `KNOWLEDGE_BENCH=1` y `ModelEvalTest::test_model_cases` sin `EVAL_LLM`) |
| Análisis estático | `docker exec everprop-etapa1-php ./vendor/bin/phpstan analyse --memory-limit=512M` | **0 errores** (338 archivos) |
| Estilo | `docker exec everprop-etapa1-php ./vendor/bin/pint --test` | **PASS** (370 archivos) |
| Validación dataset evals | `node evals/validate.mjs` | **OK: 229 casos válidos** (search 65, current-data 46, crm 30, security 44, failures 22, rioplatense 22; split dev 95 / test 134) |
| Corrida en seco evals (229 casos) | `docker compose --project-name everprop-etapa1 run --rm --no-deps -v "C:/Users/usuario/Documents/EverSys/Proyectos/EverProp/repo/evals:/var/www/evals:ro" -e EVAL_LLM=dry everprop-api-php php artisan test --filter=test_model_cases` | **1 passed** (457 assertions, 43.69 s); `{"FAIL":131,"PASS":69,"DETERMINISTIC":29}` en `storage/app/evals/report-20261124-022828.json` (confirma carga de todos los fixtures y runner) |

### Revisiones obligatorias

- **`tenant-isolation-reviewer`:** ejecutada previamente al cierre; 0 bloqueantes, 2 hallazgos medios ya corregidos (`summary_only` y validación de alcance por tenant).
- **`llm-security-reviewer`:**
  - 1.ª pasada: originó la reescritura completa a lista blanca numérica.
  - 2.ª pasada: detectó 2 bloqueantes (`B1`, `B2`), 7 altos (`A1`–`A7`), 8 medios (`M1`–`M8`) y 4 bajos (`L1`–`L4`).
  - 3.ª pasada acotada (solo lectura sobre el diff actualizado): detectó 2 bloqueantes adicionales (`moneyMatches()` vs `factsReading()`, y corte tras `?`/`!` sin espacio en `segments()`), 2 altos (`A3` mismo segmento y `A4` lista plural / `$unitProofs`), 5 medios y 5 bajos, sin riesgos de ReDoS. Todos quedaron corregidos, re-verificados en `OutputGuardTest` (`reviewed()`, `replies()`, `test_marks_and_foreign_latin_letters_fail_closed`) y `AgentTurnTest`, con `php artisan test`, PHPStan y Pint en verde después de la última edición.

- **Revisión 4 (2026-11-24, Claude Code, sobre el árbol local):** probe de 67 respuestas (todos los ejemplos de la 2.ª pasada, variantes nuevas y respuestas correctas) más 20 de huecos y falsos positivos. Halló un falso positivo (`Lote 12A, 85 m2` → `UNSUPPORTED_UNIT`) y huecos de disponibilidad parafraseada y escasez inventada; corregidos y agregados a `reviewed()` como casos `R4`. Tras el arreglo, el probe de 67 queda sin fallos (el único desvío es un caso cuya expectativa estaba mal: `monoambiente` con 2 dormitorios se bloquea, correctamente).

### Qué no se pudo verificar en esta etapa

- Evaluación real con modelo (`EVAL_LLM=configured`, Etapa 2): no se ejecutó (requiere autorización explícita por consumo de API).
- Prueba en navegador sobre entorno `staging` desplegado.

---

## 5. Pendientes y riesgos (Hoja de ruta hacia Etapa 2 y veredicto Bellomo)

1. **Cierre administrativo de `EVP-192`:**
   - Autorizar `git commit`, `git push` de `ticket/EVP-192-guardia-datos-propiedad` y apertura de PR a `develop` (sin merge hasta revisión humana).
   - Actualizar manualmente `EVP-192` en Jira (verificar *En curso* y pasar a *En revisión* enlazando este informe).
   - El stack local `everprop-etapa1` quedó levantado para inspección/Etapa 2; detenerlo desde `everprop-api/` con `docker compose --project-name everprop-etapa1 stop` cuando ya no se use.
2. **Etapa 2 — Evaluación con modelo real (`EVAL_LLM=configured`):**
   - Ejecutar `test_model_cases` contra el proveedor configurado (con autorización expresa y base aislada).
   - Medir la tasa real de derivación a asesor y falsos positivos remanentes de `M8` aceptados deliberadamente en esta etapa (horarios/plazos propuestos por el modelo sin cita en fuente como `"¿a las 10 o a las 16?"`, opciones no pedidas por el visitante como `"¿2 o 3 dormitorios?"`, y repreguntas sin re-consultar inventario).
   - Registrar la firma humana de todos los casos en `critical_needs_human` del reporte (incluido `DATA-038` a `DATA-046`).
3. **Veredicto para el alta de redes sociales de Bellomo (WhatsApp / Instagram) y paso a producción:**
   - Combinar las métricas reales de Etapa 2 con la validación de canales en `staging` antes de emitir Go / No-Go.
   - Antes de proponer o ejecutar cualquier pase a producción, recordar verificar y configurar expresamente los accesos definitivos del entorno: forwards SQL pendientes (`schema_versions`, contrastando con `php artisan everprop:schema:verify` y `php artisan everprop:production-check --connections`), dominios definitivos, CORS (incluido R2), `tenant_domains`/Sanctum/cookies, credenciales/permisos de proveedores Meta y de IA, base de datos, storage y pruebas extremo a extremo desde el navegador y canal real del entorno desplegado.
