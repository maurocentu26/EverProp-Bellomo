# EVP-196: falsos positivos de `OutputGuard` medidos en la Etapa 2

Rama `ticket/EVP-196-falsos-positivos-guardia` (desde `develop` `0d24671`) · commits `ac3172b` + informe · fecha 2026-11-24 · autor: Claude Code (agente) con Mauro Centurión.

Jira: `EVP-196` En curso. El flujo de EVP no tiene un estado "En revisión", así que al abrir el PR queda En curso con el enlace en un comentario.

---

## 1. Qué pedía el ticket

En la Etapa 2 (evaluación con el modelo real `gemini-3.1-flash-lite`, 2026-11-24) la guardia derivó al asesor 46 respuestas en la primera corrida. Repetí esos casos guardando el borrador bloqueado: hubo 24 bloqueos, la mayoría de respuestas correctas.

El ticket pedía:
- Corregir los falsos positivos de EVP-192 en `unsupportedFacts`:
  - disponibilidad negada o sin unidad;
  - "disponible" referido a algo que no es una unidad;
  - amenities negadas;
  - el horario de atención;
  - códigos que nombró el visitante.
- Corregir los anteriores a EVP-192: `CONFIRMATION_CLAIM` ante "Te confirmo que…", y `UNSUPPORTED_TERM` ante la negación que repite al visitante.
- Mantener los bloqueos correctos.
- Agregar cada caso como regresión, junto con su gemelo malicioso.

**Fuera de alcance:**
- Inyección vía conocimiento (EVP-193).
- "12 a secas" convertido en 12A (EVP-194).
- Dataset y prompt (EVP-195).
- Errores 429/503 del proveedor (EVP-197).

## 2. Qué se implementó

Todo en `everprop-api/app/Domain/AgentRuntime/Coordinator/OutputGuard.php`. No hay forwards SQL, dependencias nuevas, variables de entorno ni cambios de contrato.

**Principio que surgió de la revisión: solo exime una falta de datos.** "No tengo información sobre la pileta" o "no sé si tiene pileta" no afirman nada. En cambio, "no tiene cochera", "sin pileta" o "no ofrecemos 60 cuotas" son afirmaciones sobre la propiedad y siguen necesitando evidencia.

- **Disponibilidad** (`availability()`, línea 1439; llamada en la 873):
  - "no contamos con / no cuento con / no disponemos de … disponibles" es negativa. Pasa después de una búsqueda vacía y se bloquea si se devolvió alguna unidad.
  - Exenciones nuevas:
    - frase nominal sobre datos ("la información que tengo disponible sobre…");
    - oferta de búsqueda ("puedo buscarte lotes disponibles");
    - el sustantivo "disponibilidad" cuando es lo que se consulta o falta;
    - documentos ("el reglamento no está disponible para consultar por este canal").
  - Las últimas tres **nunca aplican si hay una unidad concreta en juego**: nombrada en el segmento, arrastrada o preguntada por el visitante (`$specific`).
  - La regla previa de sustantivos de datos ahora exige borde de palabra y rechaza un verbo de estado.
- **Códigos** (línea 805): se puede nombrar un código reportado como no encontrado (`notFound`). Un número suelto del visitante ("el 14") no respalda un código sin consulta, porque puede ser un día o una hora.
- **Amenities en la respuesta** (`deniedInReply()`, línea 1230): una mención queda exenta solo bajo un marco de falta de datos, sola o en una lista de amenities que empieza ahí. Un verbo o un comparativo después la deshace.
- **Amenities en la evidencia** (`affirmed()`, línea 1260):
  - decide la negación más cercana ("no tiene cochera y no hay pileta");
  - sin, tampoco y ni (con su verbo) son marcos;
  - un verbo afirmativo o un "pero" en el medio cancela la negación.
- **Términos comerciales** (`negatedEchoTerms()`, línea 379): un término que pidió el visitante queda exento si la oración entera dice que falta el dato ("no tengo información confirmada respecto a una financiación en 60 cuotas"). Deja de estar exento si:
  - la oración excluye algo (que, otro, salvo, aparte, distinto…);
  - más adelante la respuesta concede ("en pesos, sí", "se puede", "pero sí en 36");
  - el mismo término aparece afirmado en otro lugar.
- **Confirmaciones** (`CLAIMS`, línea 41):
  - "confirmo" solo es compromiso con visita, reserva, compra o seña, o con la unidad como objeto directo ("te confirmo el lote 12A"). "Te confirmo que el 12A está disponible" informa un hecho.
  - Se suman como compromisos:
    - "¡Confirmado!";
    - reservas y retenciones ("te reservamos el 12A", "separamos el 12A para vos", "te lo dejo reservado", "ya lo tenés reservado", "queda para vos");
    - "ya es tuyo", con una unidad como sujeto.
- **Horarios** (línea 1069): los minutos de una hora ("9:00") se saltean.
- `check()` deja de repetir códigos de violación.

## 3. Por qué esta solución

- **Se descartaron las listas abiertas.** Las seis pasadas de `llm-security-reviewer` mostraron que cada relajación léxica ("no hay", "sin", "buscar … disponible", ventanas de 8 palabras) abre una variante rioplatense. Las dos que cerraron clases enteras fueron el principio de "solo falta de datos" y la regla de "ninguna exención con una unidad en juego".
- **Concesiones aceptadas a propósito (derivan a un asesor):**
  - una respuesta evasiva sobre una unidad no encontrada ("un asesor va a confirmarte la disponibilidad del 12B");
  - un código que el visitante escribió como número suelto sin que se consultara (SEC-028/030/034, que son casos de ataque).
- **Límites conocidos (`ponytail`):** las listas son léxicas.
  - Una concesión anafórica ("…en dólares. En moneda local tenemos ese plan") no se detecta; queda para el gate Q01.
  - Tampoco se detecta una negación no léxica en la evidencia ("Pileta: no", "carece de pileta"), que es anterior a EVP-196.

## 4. Cómo se verificó

Entorno: stack Docker aislado `everprop-etapa1` (PHP 8.4, MySQL 8.4, Redis), datos sintéticos.

| Comprobación | Resultado |
| --- | --- |
| `OutputGuardTest` (incluye `stageTwo()` con R1–R6 y la prueba de horarios) | 511 pasan |
| Tests del asistente y de conversaciones | 770 pasan, 1 salteado (antes de la última ronda) |
| Suite completa de la API (versión final) | **1162 pasan**, 2 salteados (benchmark y evaluación con el modelo real). Dos fallos intermitentes de corridas anteriores (`ReleaseSchemaTest`, `WhatsAppTemplatesTest`, en módulos que este ticket no toca) pasan solos y en esta corrida |
| PHPStan / Pint | 0 errores / PASS |
| Probe con los 24 borradores reales y la evidencia de su turno | 27/27 como se esperaba (incluye 3 variantes con búsqueda vacía) |
| Probe de gemelos maliciosos y bypasses de las 6 revisiones | 132/132 |
| Probe de EVP-192 (67 casos) | sin cambios |
| Rendimiento con respuestas adversariales de 4000 caracteres | menos de 20 ms; sin backtracking |

**Revisión `llm-security-reviewer`: seis pasadas.**
- Primera: 1 bloqueante y 7 altos.
- Segunda: 5 altos.
- Tercera: 5 altos.
- Cuarta: 4 altos.
- Quinta: 1 alto.
- Sexta: **apto con una condición** (la retención sin clítico), que quedó corregida y probada (R6).

Cada ejemplo de cada pasada es una regresión en `stageTwo()`. No hubo cambios en consultas ni en datos por tenant, así que no hizo falta `tenant-isolation-reviewer`.

**Etapa 2 con el modelo real:**
- Antes: 46 de 229 casos bloqueados por la guardia.
- La repetición de los 24 bloqueados con una versión intermedia no tuvo ningún bloqueo de la guardia entre las respuestas que llegaron. Pero hubo 37 errores 429: la cuota diaria de la clave de prueba se agotó. **La cifra final, antes y después, sigue pendiente** (ver la sección 5).

## 5. Pendientes y riesgos

- **Repetir la Etapa 2** sobre los 24 casos con la versión final cuando se recupere la cuota de Gemini, y anotar la cifra. EVP-197 trata la cuota.
- **PR a `develop`:** abierto para revisión humana, sin merge.
- **Cambios ajenos en el mismo checkout:** hay modificaciones en `everprop-public` (`ProjectWebEditor.tsx`, `admin-design.css`, `AGENTS.md` y un test) que no son de este ticket. No entran en este commit.
- **Riesgo:** la guardia sigue siendo léxica. La red de seguridad es la evaluación con el modelo real y el copiloto con revisión humana (go-live F2 5b).
